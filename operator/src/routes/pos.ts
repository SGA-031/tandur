import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { q, one } from "../db/index.ts";
import { issueToken, requireKind } from "../services/auth.ts";
import { nikHashFor, verifySecret } from "../services/vault.ts";
import { createInvoice, loadInvoice, toDTO, expireStale } from "../services/invoices.ts";
import { balancesOf } from "../services/chain.ts";
import { findFarmerByNikHash, payInvoice } from "../services/payment.ts";

async function merchantOf(req: any) {
  const m = await one(`SELECT * FROM merchants WHERE id=$1`, [req.principal.sub]);
  if (!m) throw new Error("Merchant tidak ditemukan");
  return m;
}
const merchantDTO = (m: any) => ({ id: m.id, name: m.name, kind: m.kind, city: m.city, district: m.district, regency: m.regency, province: m.province, address: m.address, bankAccount: m.bank_account, status: m.status });

export async function posRoutes(app: FastifyInstance) {
  app.post("/login", async (req, reply) => {
    const body = z.object({ username: z.string(), password: z.string() }).parse(req.body);
    const m = await one(`SELECT * FROM merchants WHERE username=$1`, [body.username]);
    if (!m || !verifySecret(body.password, m.password_hash)) return reply.code(401).send({ error: "Nama pengguna atau kata sandi salah" });
    return { token: await issueToken({ sub: m.id, kind: "merchant", name: m.name }), merchant: merchantDTO(m) };
  });

  app.register(async (priv) => {
    priv.addHook("preHandler", requireKind("merchant"));

    priv.get("/me", async (req) => ({ merchant: merchantDTO(await merchantOf(req)) }));

    priv.get("/catalog", async () => ({
      products: await q(`SELECT sku, name, brand, category, unit, het_price AS "hetPrice" FROM products WHERE active ORDER BY category, name`),
    }));

    priv.post("/invoices", async (req, reply) => {
      const m = await merchantOf(req);
      const body = z.object({ items: z.array(z.object({ sku: z.string(), qty: z.number().int().positive() })).min(1) }).parse(req.body);
      try {
        const r = await createInvoice(m.id, body.items);
        return { invoice: toDTO(r, { withQr: true }) };
      } catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
    });

    priv.get<{ Params: { id: string } }>("/invoices/:id", async (req, reply) => {
      const m = await merchantOf(req);
      await expireStale();
      const r = await loadInvoice(req.params.id);
      if (!r || r.merchant_id !== m.id) return reply.code(404).send({ error: "Invoice tidak ditemukan" });
      return { invoice: toDTO(r, { withQr: true }) };
    });

    priv.post<{ Params: { id: string } }>("/invoices/:id/cancel", async (req, reply) => {
      const m = await merchantOf(req);
      const r = await loadInvoice(req.params.id);
      if (!r || r.merchant_id !== m.id) return reply.code(404).send({ error: "Invoice tidak ditemukan" });
      if (r.status !== "pending") return reply.code(400).send({ error: "Hanya invoice menunggu yang bisa dibatalkan" });
      await q(`UPDATE invoices SET status='cancelled' WHERE id=$1`, [r.id]);
      return { invoice: toDTO(await loadInvoice(r.id)) };
    });

    /** Assisted mode: farmer has no phone. Cashier scans KTP (NIK) and farmer enters PIN on the POS. */
    priv.post<{ Params: { id: string } }>("/invoices/:id/assisted", async (req, reply) => {
      const m = await merchantOf(req);
      const body = z.object({ nik: z.string().regex(/^\d{16}$/), pin: z.string().regex(/^\d{6}$/) }).parse(req.body);
      const r = await loadInvoice(req.params.id);
      if (!r || r.merchant_id !== m.id) return reply.code(404).send({ error: "Invoice tidak ditemukan" });
      const f = await findFarmerByNikHash(nikHashFor(body.nik));
      if (!f) return reply.code(404).send({ error: "NIK tidak terdaftar di e-RDKK/Tandur" });
      try {
        return await payInvoice({ invoiceId: r.id, farmer: f, pin: body.pin, mode: "assisted" });
      } catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
    });

    priv.get("/invoices", async (req) => {
      const m = await merchantOf(req);
      const { status, limit } = z.object({ status: z.string().optional(), limit: z.coerce.number().max(500).default(100) }).parse(req.query);
      const rows = await q(`SELECT i.*, m.name AS merchant_name, m.city AS merchant_city, m.kind AS merchant_kind, m.address AS merchant_address, f.name AS farmer_name FROM invoices i JOIN merchants m ON m.id=i.merchant_id LEFT JOIN farmers f ON f.id=i.farmer_id WHERE i.merchant_id=$1 ${status ? "AND i.status=$3" : ""} ORDER BY i.created_at DESC LIMIT $2`, status ? [m.id, limit, status] : [m.id, limit]);
      return { invoices: rows.map((r) => toDTO(r)) };
    });

    priv.get("/summary", async (req) => {
      const m = await merchantOf(req);
      const today = await one(`SELECT count(*)::int AS n, coalesce(sum(total),0) AS total FROM invoices WHERE merchant_id=$1 AND status='paid' AND (paid_at AT TIME ZONE 'Asia/Jakarta')::date = (now() AT TIME ZONE 'Asia/Jakarta')::date`, [m.id]);
      const all = await one(`SELECT count(*)::int AS n, coalesce(sum(total),0) AS total FROM invoices WHERE merchant_id=$1 AND status='paid'`, [m.id]);
      const types = await q(`SELECT type_id, category FROM voucher_types ORDER BY type_id`);
      const bal = await balancesOf(m.address, types.map((t) => t.type_id));
      const receivable: Record<string, number> = {};
      types.forEach((t, i) => { if (bal[i] > 0) receivable[t.category] = (receivable[t.category] ?? 0) + bal[i]; });
      const payouts = await q(`SELECT id, amount, by_type AS "byType", tx_hashes AS "txHashes", bank_ref AS "bankRef", status, created_at AS "createdAt" FROM payouts WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 20`, [m.id]);
      const byDay = await q(`SELECT (paid_at AT TIME ZONE 'Asia/Jakarta')::date AS day, count(*)::int AS n, sum(total) AS total FROM invoices WHERE merchant_id=$1 AND status='paid' AND paid_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`, [m.id]);
      const unsettled = await one(`SELECT count(*)::int AS n, coalesce(sum(total),0) AS total FROM invoices WHERE merchant_id=$1 AND status='paid' AND payout_id IS NULL`, [m.id]);
      return { today, all, receivable, receivableTotal: Object.values(receivable).reduce((a, b) => a + b, 0), unsettled, payouts, byDay };
    });
  });
}
