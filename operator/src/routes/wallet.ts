import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { decodeTandurQR } from "@tandur/shared";
import { q, one } from "../db/index.ts";
import { issueToken, requireKind } from "../services/auth.ts";
import { nikHashFor, verifySecret } from "../services/vault.ts";
import { coverageFor, farmerBalances, findFarmerByNikHash, payInvoice } from "../services/payment.ts";
import { loadInvoice, toDTO, expireStale } from "../services/invoices.ts";

async function farmerOf(req: any) {
  const f = await one(`SELECT * FROM farmers WHERE id=$1`, [req.principal.sub]);
  if (!f) throw new Error("Petani tidak ditemukan");
  return f;
}

function profile(f: any, balances: any[]) {
  return {
    id: f.id, name: f.name, pseudoId: f.pseudo_id, address: f.address, nikMasked: f.nik_masked, phone: f.phone,
    village: f.village, district: f.district, regency: f.regency, province: f.province, regionCode: f.region_code,
    landHa: f.land_ha, commodity: f.commodity, status: f.status, balances, totalBalance: balances.reduce((a, b) => a + b.balance, 0),
  };
}

export async function walletRoutes(app: FastifyInstance) {
  app.post("/login", async (req, reply) => {
    const body = z.object({ nik: z.string().regex(/^\d{16}$/, "NIK harus 16 digit"), pin: z.string().regex(/^\d{6}$/, "PIN 6 digit"), deviceId: z.string().min(4) }).parse(req.body);
    const f = await findFarmerByNikHash(nikHashFor(body.nik));
    if (!f || !verifySecret(body.pin, f.pin_hash)) return reply.code(401).send({ error: "NIK atau PIN salah" });
    if (f.device_id && f.device_id !== body.deviceId) {
      // Device re-binding needs in-person verification in production; prototype logs and allows.
      await q(`INSERT INTO audit_log (actor, action, target, detail) VALUES ($1,'device.rebind',$2,$3)`, [f.id, f.id, JSON.stringify({ from: f.device_id, to: body.deviceId })]);
    }
    await q(`UPDATE farmers SET device_id=$2 WHERE id=$1`, [f.id, body.deviceId]);
    const token = await issueToken({ sub: f.id, kind: "farmer", name: f.name });
    return { token, farmer: profile(f, await farmerBalances(f)) };
  });

  app.register(async (priv) => {
    priv.addHook("preHandler", requireKind("farmer"));

    priv.get("/me", async (req) => {
      const f = await farmerOf(req);
      const types = await q(`SELECT type_id AS "typeId", category, season, valid_from AS "validFrom", valid_until AS "validUntil", per_farmer_cap AS "perFarmerCap" FROM voucher_types ORDER BY type_id`);
      return { farmer: profile(f, await farmerBalances(f)), voucherTypes: types };
    });

    priv.get("/invoices", async (req) => {
      const f = await farmerOf(req);
      const rows = await q(`SELECT i.*, m.name AS merchant_name, m.city AS merchant_city, m.kind AS merchant_kind, m.address AS merchant_address FROM invoices i JOIN merchants m ON m.id=i.merchant_id WHERE i.farmer_id=$1 AND i.status='paid' ORDER BY i.paid_at DESC LIMIT 100`, [f.id]);
      return { invoices: rows.map((r) => toDTO(r)) };
    });

    priv.get<{ Params: { id: string } }>("/invoices/:id", async (req, reply) => {
      const f = await farmerOf(req);
      const r = await loadInvoice(req.params.id);
      if (!r || (r.farmer_id && r.farmer_id !== f.id)) return reply.code(404).send({ error: "Invoice tidak ditemukan" });
      const events = r.tx_hash ? await q(`SELECT block_number, block_time, tx_hash, log_index, name, args FROM chain_events WHERE tx_hash=$1 ORDER BY log_index`, [r.tx_hash]) : [];
      return { invoice: toDTO(r), document: r.document, events };
    });

    priv.post("/scan", async (req, reply) => {
      const f = await farmerOf(req);
      const { qr } = z.object({ qr: z.string().min(20) }).parse(req.body);
      let parsed;
      try { parsed = decodeTandurQR(qr.trim()); } catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
      await expireStale();
      const r = await loadInvoice(parsed.invoiceId);
      if (!r) return reply.code(404).send({ error: "Invoice tidak ada di sistem Tandur" });
      if (r.hash.toLowerCase() !== parsed.invoiceHash.toLowerCase() || r.total !== parsed.amount) {
        return reply.code(400).send({ error: "QR tidak cocok dengan invoice di sistem (kemungkinan dimanipulasi)" });
      }
      if (r.status !== "pending") return reply.code(400).send({ error: `Invoice sudah ${r.status === "paid" ? "dibayar" : r.status}` });
      const cov = await coverageFor(f.address, r.category_totals);
      return { invoice: toDTO(r), coverage: cov.coverage, canPay: cov.canPay && f.status === "active", frozen: f.status !== "active" };
    });

    priv.post("/pay", async (req, reply) => {
      const f = await farmerOf(req);
      const body = z.object({ invoiceId: z.string().uuid(), pin: z.string().regex(/^\d{6}$/) }).parse(req.body);
      try {
        return await payInvoice({ invoiceId: body.invoiceId, farmer: f, pin: body.pin, mode: "scan" });
      } catch (e) {
        return reply.code(400).send({ error: (e as Error).message });
      }
    });

    priv.get("/notifications", async (req) => {
      const f = await farmerOf(req);
      return { notifications: await q(`SELECT id, channel, body, created_at AS "createdAt" FROM notifications WHERE farmer_id=$1 ORDER BY created_at DESC LIMIT 50`, [f.id]) };
    });
  });
}
