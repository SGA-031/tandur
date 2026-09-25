import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { canonicalize, sha256Hex } from "@tandur/shared";
import { q, one } from "../db/index.ts";
import { issueToken, requireKind } from "../services/auth.ts";
import { verifySecret } from "../services/vault.ts";
import { b32, balancesOf, confirm, ledgerStatus, reasonHash, registry, voucher, voucherRead, revertReason, TX } from "../services/chain.ts";
import { getIndexedBlock } from "../services/indexer.ts";
import { loadInvoice, readDocument, toDTO } from "../services/invoices.ts";
import { runFraudRules } from "../services/fraud.ts";
import { reconciliationReport } from "../services/reconcile.ts";
import { runPayouts } from "../services/payouts.ts";
import { farmerBalances } from "../services/payment.ts";

const audit = (actor: string, action: string, target: string | null, detail: unknown) =>
  q(`INSERT INTO audit_log (actor, action, target, detail) VALUES ($1,$2,$3,$4)`, [actor, action, target, JSON.stringify(detail)]);

const farmerDTO = (f: any) => ({
  id: f.id, name: f.name, pseudoId: f.pseudo_id, nikMasked: f.nik_masked, phone: f.phone, village: f.village, district: f.district, regency: f.regency,
  province: f.province, regionCode: f.region_code, landHa: f.land_ha, commodity: f.commodity, address: f.address, status: f.status, createdAt: f.created_at,
});
const merchantDTO = (m: any) => ({
  id: m.id, name: m.name, kind: m.kind, city: m.city, district: m.district, regency: m.regency, province: m.province, regionCode: m.region_code,
  lat: m.lat, lng: m.lng, address: m.address, username: m.username, bankAccount: m.bank_account, status: m.status, createdAt: m.created_at,
});

function invoiceFilter(query: any, startIdx: number) {
  const params: unknown[] = [];
  const where: string[] = ["1=1"];
  const add = (cond: string, v: unknown) => { params.push(v); where.push(cond.replace("?", `$${startIdx + params.length}`)); };
  if (query.status) add("i.status = ?", query.status);
  if (query.merchantId) add("i.merchant_id = ?", query.merchantId);
  if (query.farmerId) add("i.farmer_id = ?", query.farmerId);
  if (query.province) add("m.province = ?", query.province);
  if (query.regency) add("m.regency = ?", query.regency);
  if (query.from) add("coalesce(i.paid_at, i.created_at) >= ?", query.from);
  if (query.to) add("coalesce(i.paid_at, i.created_at) < (?::date + 1)", query.to);
  if (query.q) add("(i.invoice_no ILIKE '%' || ? || '%' OR i.hash ILIKE '%' || ? || '%')", query.q);
  return { where: where.join(" AND ").replaceAll(`$${startIdx + params.length}`, `$${startIdx + params.length}`), params };
}

export async function adminRoutes(app: FastifyInstance) {
  app.post("/login", async (req, reply) => {
    const body = z.object({ username: z.string(), password: z.string() }).parse(req.body);
    const a = await one(`SELECT * FROM admins WHERE username=$1`, [body.username]);
    if (!a || !verifySecret(body.password, a.password_hash)) return reply.code(401).send({ error: "Nama pengguna atau kata sandi salah" });
    return { token: await issueToken({ sub: a.username, kind: "admin", name: a.display_name, role: a.role }), admin: { username: a.username, name: a.display_name, role: a.role } };
  });

  app.register(async (priv) => {
    priv.addHook("preHandler", requireKind("admin"));

    priv.get("/overview", async () => {
      const farmers = await one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status='active')::int AS active FROM farmers`);
      const merchants = await one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status='active')::int AS active, count(*) FILTER (WHERE kind='kdmp')::int AS kdmp FROM merchants`);
      const sums = async (name: string) => Number((await q(`SELECT coalesce(sum((args->>'amount')::bigint),0) AS s FROM chain_events WHERE name=$1`, [name]))[0].s);
      const [issued, spent, redeemed, clawback, expired] = await Promise.all(["Issued", "Spent", "Redeemed", "Clawback", "Expired"].map(sums));
      const activated = await one(`SELECT count(DISTINCT farmer_id)::int AS n FROM invoices WHERE status='paid'`);
      const issuedFarmers = await one(`SELECT count(DISTINCT args->>'farmer')::int AS n FROM chain_events WHERE name='Issued'`);
      const daily = await q(`SELECT (paid_at AT TIME ZONE 'Asia/Jakarta')::date AS day, count(*)::int AS invoices, sum(total) AS total FROM invoices WHERE status='paid' AND paid_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`);
      const byCategory = await q(`SELECT k AS category, sum(v::bigint) AS total, count(*)::int AS invoices FROM invoices i, jsonb_each_text(i.category_totals) AS kv(k, v) WHERE i.status='paid' GROUP BY k ORDER BY total DESC`);
      const issuedByCategory = await q(`SELECT vt.category, sum((e.args->>'amount')::bigint) AS issued FROM chain_events e JOIN voucher_types vt ON vt.type_id=(e.args->>'typeId')::int WHERE e.name='Issued' GROUP BY vt.category`);
      const byProvince = await q(`SELECT m.province, count(*)::int AS invoices, sum(i.total) AS total, count(DISTINCT i.farmer_id)::int AS farmers FROM invoices i JOIN merchants m ON m.id=i.merchant_id WHERE i.status='paid' GROUP BY 1 ORDER BY total DESC`);
      const issuedByProvince = await q(`SELECT f.province, sum((e.args->>'amount')::bigint) AS issued, count(DISTINCT f.id)::int AS farmers FROM chain_events e JOIN farmers f ON lower(f.address)=lower(e.args->>'farmer') WHERE e.name='Issued' GROUP BY 1`);
      const topMerchants = await q(`SELECT m.id, m.name, m.kind, m.regency, m.province, count(*)::int AS invoices, sum(i.total) AS total FROM invoices i JOIN merchants m ON m.id=i.merchant_id WHERE i.status='paid' GROUP BY m.id ORDER BY total DESC LIMIT 8`);
      const topProducts = await q(`SELECT l->>'sku' AS sku, l->>'name' AS name, l->>'category' AS category, sum((l->>'qty')::int)::int AS qty, sum((l->>'lineTotal')::bigint) AS total FROM invoices i, jsonb_array_elements(i.lines) AS l WHERE i.status='paid' GROUP BY 1,2,3 ORDER BY total DESC LIMIT 8`);
      const alerts = await q(`SELECT severity, count(*)::int AS n FROM fraud_alerts WHERE status='open' GROUP BY severity`);
      const recentEvents = await q(`SELECT block_number AS "blockNumber", block_time AS "blockTime", tx_hash AS "txHash", name, args FROM chain_events ORDER BY block_number DESC, log_index DESC LIMIT 12`);
      const ledger = { ...(await ledgerStatus()), indexedBlock: await getIndexedBlock() };
      return {
        farmers, merchants,
        budget: { issued, spent, redeemed, clawback, expired, outstanding: issued - spent - clawback - expired, merchantReceivable: spent - redeemed, utilisation: issued ? spent / issued : 0 },
        activation: { farmersIssued: issuedFarmers?.n ?? 0, farmersSpent: activated?.n ?? 0, rate: issuedFarmers?.n ? (activated?.n ?? 0) / issuedFarmers.n : 0 },
        daily, byCategory, issuedByCategory, byProvince, issuedByProvince, topMerchants, topProducts, alerts, recentEvents, ledger,
      };
    });

    priv.get("/spend", async (req) => {
      const query = z.object({ by: z.enum(["day", "week", "category", "province", "regency", "merchant", "product", "commodity", "kind", "mode"]).default("day"), from: z.string().optional(), to: z.string().optional(), province: z.string().optional(), regency: z.string().optional() }).parse(req.query);
      const { where, params } = invoiceFilter({ ...query, status: "paid" }, 0);
      const dim: Record<string, string> = {
        day: `(i.paid_at AT TIME ZONE 'Asia/Jakarta')::date::text`, week: `date_trunc('week', i.paid_at AT TIME ZONE 'Asia/Jakarta')::date::text`,
        province: "m.province", regency: "m.regency || ', ' || m.province", merchant: "m.name", commodity: "f.commodity", kind: "m.kind", mode: "i.mode",
      };
      if (query.by === "category") {
        return { by: query.by, rows: await q(`SELECT k AS key, sum(v::bigint) AS total, count(*)::int AS invoices FROM invoices i JOIN merchants m ON m.id=i.merchant_id LEFT JOIN farmers f ON f.id=i.farmer_id, jsonb_each_text(i.category_totals) AS kv(k, v) WHERE ${where} GROUP BY 1 ORDER BY total DESC`, params) };
      }
      if (query.by === "product") {
        return { by: query.by, rows: await q(`SELECT l->>'name' AS key, l->>'category' AS category, l->>'unit' AS unit, sum((l->>'qty')::int)::int AS qty, sum((l->>'lineTotal')::bigint) AS total, count(DISTINCT i.id)::int AS invoices FROM invoices i JOIN merchants m ON m.id=i.merchant_id LEFT JOIN farmers f ON f.id=i.farmer_id, jsonb_array_elements(i.lines) AS l WHERE ${where} GROUP BY 1,2,3 ORDER BY total DESC LIMIT 50`, params) };
      }
      return { by: query.by, rows: await q(`SELECT ${dim[query.by]} AS key, sum(i.total) AS total, count(*)::int AS invoices, count(DISTINCT i.farmer_id)::int AS farmers FROM invoices i JOIN merchants m ON m.id=i.merchant_id LEFT JOIN farmers f ON f.id=i.farmer_id WHERE ${where} GROUP BY 1 ORDER BY ${query.by === "day" || query.by === "week" ? "1" : "total DESC"} LIMIT 200`, params) };
    });

    priv.get("/regions", async () => ({
      provinces: await q(`SELECT province, count(*)::int AS farmers FROM farmers GROUP BY 1 ORDER BY 1`),
      regencies: await q(`SELECT province, regency, count(*)::int AS farmers FROM farmers GROUP BY 1,2 ORDER BY 1,2`),
    }));

    priv.get("/farmers", async (req) => {
      const query = z.object({ q: z.string().optional(), province: z.string().optional(), regency: z.string().optional(), status: z.string().optional(), page: z.coerce.number().default(1), limit: z.coerce.number().max(200).default(50) }).parse(req.query);
      const params: unknown[] = []; const where: string[] = ["1=1"];
      const add = (c: string, v: unknown) => { params.push(v); where.push(c.replace("?", `$${params.length}`)); };
      if (query.q) add("(f.name ILIKE '%' || ? || '%' OR f.id ILIKE '%' || ? || '%' OR f.village ILIKE '%' || ? || '%')", query.q);
      if (query.province) add("f.province = ?", query.province);
      if (query.regency) add("f.regency = ?", query.regency);
      if (query.status) add("f.status = ?", query.status);
      const w = where.join(" AND ").replace(/\?/g, () => `$${params.length}`);
      const total = (await one(`SELECT count(*)::int AS n FROM farmers f WHERE ${w}`, params))!.n;
      params.push(query.limit, (query.page - 1) * query.limit);
      const rows = await q(`SELECT f.*, coalesce(s.spent,0) AS spent, coalesce(s.n,0) AS invoices, coalesce(iss.issued,0) AS issued FROM farmers f
        LEFT JOIN (SELECT farmer_id, sum(total) AS spent, count(*)::int AS n FROM invoices WHERE status='paid' GROUP BY farmer_id) s ON s.farmer_id=f.id
        LEFT JOIN (SELECT lower(args->>'farmer') AS addr, sum((args->>'amount')::bigint) AS issued FROM chain_events WHERE name='Issued' GROUP BY 1) iss ON iss.addr=lower(f.address)
        WHERE ${w} ORDER BY f.province, f.regency, f.name LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
      return { total, page: query.page, farmers: rows.map((f) => ({ ...farmerDTO(f), spent: f.spent, invoices: f.invoices, issued: f.issued })) };
    });

    priv.get<{ Params: { id: string } }>("/farmers/:id", async (req, reply) => {
      const f = await one(`SELECT * FROM farmers WHERE id=$1`, [req.params.id]);
      if (!f) return reply.code(404).send({ error: "Petani tidak ditemukan" });
      const invoices = await q(`SELECT i.*, m.name AS merchant_name, m.city AS merchant_city, m.kind AS merchant_kind, m.address AS merchant_address FROM invoices i JOIN merchants m ON m.id=i.merchant_id WHERE i.farmer_id=$1 AND i.status='paid' ORDER BY paid_at DESC`, [f.id]);
      const events = await q(`SELECT block_number AS "blockNumber", block_time AS "blockTime", tx_hash AS "txHash", name, args FROM chain_events WHERE lower(args->>'farmer')=lower($1) OR lower(args->>'account')=lower($1) ORDER BY block_number DESC, log_index DESC LIMIT 100`, [f.address]);
      const alerts = await q(`SELECT * FROM fraud_alerts WHERE (subject_kind='farmer' AND subject_id=$1) OR (subject_kind='invoice' AND subject_id IN (SELECT id FROM invoices WHERE farmer_id=$1)) ORDER BY created_at DESC`, [f.id]);
      const notifications = await q(`SELECT id, body, created_at AS "createdAt" FROM notifications WHERE farmer_id=$1 ORDER BY created_at DESC LIMIT 20`, [f.id]);
      return { farmer: { ...farmerDTO(f), frozenOnChain: await voucherRead.frozen(f.address) }, balances: await farmerBalances(f), invoices: invoices.map((r) => toDTO(r)), events, alerts, notifications };
    });

    priv.post<{ Params: { id: string } }>("/farmers/:id/freeze", async (req, reply) => {
      const body = z.object({ frozen: z.boolean(), reason: z.string().min(3) }).parse(req.body);
      const f = await one(`SELECT * FROM farmers WHERE id=$1`, [req.params.id]);
      if (!f) return reply.code(404).send({ error: "Petani tidak ditemukan" });
      try {
        const rc = await confirm(voucher.setFrozen(f.address, body.frozen, reasonHash(body.reason), TX));
        await q(`UPDATE farmers SET status=$2 WHERE id=$1`, [f.id, body.frozen ? "frozen" : "active"]);
        await audit(req.principal!.sub, body.frozen ? "farmer.freeze" : "farmer.unfreeze", f.id, { reason: body.reason, txHash: rc.hash });
        return { ok: true, txHash: rc.hash };
      } catch (e) { return reply.code(400).send({ error: revertReason(e) }); }
    });

    priv.get("/merchants", async () => {
      const rows = await q(`SELECT m.*, coalesce(s.total,0) AS spent, coalesce(s.n,0) AS invoices, coalesce(s.farmers,0) AS farmers, coalesce(a.n,0) AS open_alerts FROM merchants m
        LEFT JOIN (SELECT merchant_id, sum(total) AS total, count(*)::int AS n, count(DISTINCT farmer_id)::int AS farmers FROM invoices WHERE status='paid' GROUP BY merchant_id) s ON s.merchant_id=m.id
        LEFT JOIN (SELECT subject_id, count(*)::int AS n FROM fraud_alerts WHERE subject_kind='merchant' AND status='open' GROUP BY subject_id) a ON a.subject_id=m.id
        ORDER BY m.province, m.regency, m.name`);
      const types = await q(`SELECT type_id FROM voucher_types ORDER BY type_id`);
      const out = [];
      for (const m of rows) {
        const bal = await balancesOf(m.address, types.map((t) => t.type_id));
        out.push({ ...merchantDTO(m), spent: m.spent, invoices: m.invoices, farmers: m.farmers, openAlerts: m.open_alerts, receivable: bal.reduce((a, b) => a + b, 0) });
      }
      return { merchants: out };
    });

    priv.get<{ Params: { id: string } }>("/merchants/:id", async (req, reply) => {
      const m = await one(`SELECT * FROM merchants WHERE id=$1`, [req.params.id]);
      if (!m) return reply.code(404).send({ error: "Merchant tidak ditemukan" });
      const invoices = await q(`SELECT i.*, m.name AS merchant_name, m.city AS merchant_city, m.kind AS merchant_kind, m.address AS merchant_address, f.name AS farmer_name FROM invoices i JOIN merchants m ON m.id=i.merchant_id LEFT JOIN farmers f ON f.id=i.farmer_id WHERE i.merchant_id=$1 ORDER BY i.created_at DESC LIMIT 200`, [m.id]);
      const byDay = await q(`SELECT (paid_at AT TIME ZONE 'Asia/Jakarta')::date::text AS day, count(*)::int AS invoices, sum(total) AS total FROM invoices WHERE merchant_id=$1 AND status='paid' GROUP BY 1 ORDER BY 1`, [m.id]);
      const byProduct = await q(`SELECT l->>'name' AS name, l->>'category' AS category, sum((l->>'qty')::int)::int AS qty, sum((l->>'lineTotal')::bigint) AS total FROM invoices i, jsonb_array_elements(i.lines) AS l WHERE i.merchant_id=$1 AND i.status='paid' GROUP BY 1,2 ORDER BY total DESC`, [m.id]);
      const payouts = await q(`SELECT id, amount, by_type AS "byType", tx_hashes AS "txHashes", bank_ref AS "bankRef", status, created_at AS "createdAt" FROM payouts WHERE merchant_id=$1 ORDER BY created_at DESC`, [m.id]);
      const alerts = await q(`SELECT * FROM fraud_alerts WHERE (subject_kind='merchant' AND subject_id=$1) OR (subject_kind='invoice' AND subject_id IN (SELECT id FROM invoices WHERE merchant_id=$1)) ORDER BY created_at DESC`, [m.id]);
      const types = await q(`SELECT type_id, category FROM voucher_types ORDER BY type_id`);
      const bal = await balancesOf(m.address, types.map((t) => t.type_id));
      const receivable: Record<string, number> = {};
      types.forEach((t, i) => { if (bal[i] > 0) receivable[t.category] = (receivable[t.category] ?? 0) + bal[i]; });
      return { merchant: { ...merchantDTO(m), frozenOnChain: await voucherRead.frozen(m.address) }, receivable, invoices: invoices.map((r) => toDTO(r)), byDay, byProduct, payouts, alerts };
    });

    priv.post<{ Params: { id: string } }>("/merchants/:id/status", async (req, reply) => {
      const body = z.object({ active: z.boolean(), reason: z.string().min(3) }).parse(req.body);
      const m = await one(`SELECT * FROM merchants WHERE id=$1`, [req.params.id]);
      if (!m) return reply.code(404).send({ error: "Merchant tidak ditemukan" });
      try {
        const rc = await confirm(registry.setMerchantStatus(m.address, body.active, reasonHash(body.reason), TX));
        await q(`UPDATE merchants SET status=$2 WHERE id=$1`, [m.id, body.active ? "active" : "suspended"]);
        await audit(req.principal!.sub, body.active ? "merchant.activate" : "merchant.suspend", m.id, { reason: body.reason, txHash: rc.hash });
        return { ok: true, txHash: rc.hash };
      } catch (e) { return reply.code(400).send({ error: revertReason(e) }); }
    });

    priv.get("/invoices", async (req) => {
      const query = z.object({ status: z.string().optional(), merchantId: z.string().optional(), farmerId: z.string().optional(), province: z.string().optional(), regency: z.string().optional(), from: z.string().optional(), to: z.string().optional(), q: z.string().optional(), page: z.coerce.number().default(1), limit: z.coerce.number().max(200).default(50) }).parse(req.query);
      const { where, params } = invoiceFilter(query, 0);
      const total = (await one(`SELECT count(*)::int AS n FROM invoices i JOIN merchants m ON m.id=i.merchant_id WHERE ${where}`, params))!.n;
      const rows = await q(`SELECT i.*, m.name AS merchant_name, m.city AS merchant_city, m.kind AS merchant_kind, m.address AS merchant_address, m.province, m.regency, f.name AS farmer_name FROM invoices i JOIN merchants m ON m.id=i.merchant_id LEFT JOIN farmers f ON f.id=i.farmer_id WHERE ${where} ORDER BY coalesce(i.paid_at, i.created_at) DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, query.limit, (query.page - 1) * query.limit]);
      return { total, page: query.page, invoices: rows.map((r) => ({ ...toDTO(r), province: r.province, regency: r.regency })) };
    });

    priv.get<{ Params: { id: string } }>("/invoices/:id", async (req, reply) => {
      const r = await loadInvoice(req.params.id);
      if (!r) return reply.code(404).send({ error: "Invoice tidak ditemukan" });
      const doc = readDocument(r.hash);
      const recomputed = doc ? await sha256Hex(canonicalize(doc)) : null;
      const events = r.tx_hash ? await q(`SELECT block_number AS "blockNumber", block_time AS "blockTime", tx_hash AS "txHash", log_index AS "logIndex", name, args FROM chain_events WHERE tx_hash=$1 ORDER BY log_index`, [r.tx_hash]) : [];
      const onChainParts = await q(`SELECT block_number AS "blockNumber", tx_hash AS "txHash", args FROM chain_events WHERE name='Spent' AND lower(args->>'invoiceHash')=lower($1)`, [r.hash]);
      const alerts = await q(`SELECT * FROM fraud_alerts WHERE subject_kind='invoice' AND subject_id=$1`, [r.id]);
      return {
        invoice: toDTO(r), document: doc,
        verification: { documentFound: !!doc, documentIntact: doc ? recomputed === r.hash : null, recomputedHash: recomputed, onChain: onChainParts.length > 0, onChainAmount: onChainParts.reduce((a, e) => a + Number(e.args.amount), 0), amountMatches: onChainParts.length > 0 && onChainParts.reduce((a, e) => a + Number(e.args.amount), 0) === r.total },
        events, alerts,
        farmer: r.farmer_id ? farmerDTO(await one(`SELECT * FROM farmers WHERE id=$1`, [r.farmer_id])) : null,
      };
    });

    priv.get("/events", async (req) => {
      const query = z.object({ name: z.string().optional(), q: z.string().optional(), page: z.coerce.number().default(1), limit: z.coerce.number().max(200).default(50) }).parse(req.query);
      const params: unknown[] = []; const where: string[] = ["1=1"];
      if (query.name) { params.push(query.name); where.push(`name=$${params.length}`); }
      if (query.q) { params.push(`%${query.q}%`); where.push(`(tx_hash ILIKE $${params.length} OR args::text ILIKE $${params.length})`); }
      const w = where.join(" AND ");
      const total = (await one(`SELECT count(*)::int AS n FROM chain_events WHERE ${w}`, params))!.n;
      const rows = await q(`SELECT id, block_number AS "blockNumber", block_time AS "blockTime", tx_hash AS "txHash", log_index AS "logIndex", contract, name, args FROM chain_events WHERE ${w} ORDER BY block_number DESC, log_index DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, query.limit, (query.page - 1) * query.limit]);
      // resolve addresses to names for display, without leaking anything not already in the operator DB
      const farmers = await q(`SELECT lower(address) AS a, id, name FROM farmers`);
      const merchants = await q(`SELECT lower(address) AS a, id, name FROM merchants`);
      const names: Record<string, { kind: string; id: string; name: string }> = {};
      for (const f of farmers) names[f.a] = { kind: "farmer", id: f.id, name: f.name };
      for (const m of merchants) names[m.a] = { kind: "merchant", id: m.id, name: m.name };
      const counts = await q(`SELECT name, count(*)::int AS n FROM chain_events GROUP BY name ORDER BY n DESC`);
      return { total, page: query.page, events: rows, names, counts };
    });

    priv.get("/alerts", async (req) => {
      const query = z.object({ status: z.string().optional() }).parse(req.query);
      const rows = await q(`SELECT a.*, CASE a.subject_kind WHEN 'merchant' THEN (SELECT name FROM merchants WHERE id=a.subject_id) WHEN 'farmer' THEN (SELECT name FROM farmers WHERE id=a.subject_id) WHEN 'invoice' THEN (SELECT invoice_no FROM invoices WHERE id=a.subject_id) END AS subject_name FROM fraud_alerts a ${query.status ? "WHERE a.status=$1" : ""} ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'serious' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, a.created_at DESC`, query.status ? [query.status] : []);
      return { alerts: rows.map((a) => ({ id: a.id, severity: a.severity, rule: a.rule, subjectKind: a.subject_kind, subjectId: a.subject_id, subjectName: a.subject_name, detail: a.detail, evidence: a.evidence, status: a.status, createdAt: a.created_at })) };
    });

    priv.post<{ Params: { id: string } }>("/alerts/:id", async (req) => {
      const body = z.object({ status: z.enum(["open", "reviewing", "closed"]), note: z.string().optional() }).parse(req.body);
      await q(`UPDATE fraud_alerts SET status=$2 WHERE id=$1`, [req.params.id, body.status]);
      await audit(req.principal!.sub, "alert.status", req.params.id, body);
      return { ok: true };
    });

    priv.post("/alerts/run", async () => ({ updated: await runFraudRules() }));

    priv.get("/reconciliation", async () => reconciliationReport());

    priv.get("/payouts", async () => ({
      payouts: await q(`SELECT p.id, p.merchant_id AS "merchantId", m.name AS "merchantName", m.bank_account AS "bankAccount", p.amount, p.by_type AS "byType", p.tx_hashes AS "txHashes", p.bank_ref AS "bankRef", p.status, p.created_at AS "createdAt" FROM payouts p JOIN merchants m ON m.id=p.merchant_id ORDER BY p.created_at DESC LIMIT 200`),
    }));

    priv.post("/payouts/run", async (req, reply) => {
      try { return { payouts: await runPayouts(req.principal!.sub) }; } catch (e) { return reply.code(400).send({ error: revertReason(e) }); }
    });

    priv.get("/voucher-types", async () => ({
      types: await q(`SELECT vt.type_id AS "typeId", vt.category, vt.season, vt.valid_from AS "validFrom", vt.valid_until AS "validUntil", vt.per_farmer_cap AS "perFarmerCap", vt.tx_hash AS "txHash",
        coalesce((SELECT sum((args->>'amount')::bigint) FROM chain_events WHERE name='Issued' AND (args->>'typeId')::int=vt.type_id),0) AS issued,
        coalesce((SELECT sum((args->>'amount')::bigint) FROM chain_events WHERE name='Spent' AND (args->>'typeId')::int=vt.type_id),0) AS spent
        FROM voucher_types vt ORDER BY vt.type_id`),
    }));

    priv.post("/voucher-types", async (req, reply) => {
      const body = z.object({ category: z.enum(["PUPUK", "BENIH", "ALSINTAN", "PESTISIDA"]), season: z.string().min(3).max(31), validFrom: z.string(), validUntil: z.string(), perFarmerCap: z.number().int().nonnegative() }).parse(req.body);
      try {
        const from = Math.floor(new Date(body.validFrom).getTime() / 1000), until = Math.floor(new Date(body.validUntil).getTime() / 1000);
        const rc = await confirm(voucher.createVoucherType(b32(body.category), b32(body.season), from, until, body.perFarmerCap, TX));
        const typeId = Number(await voucherRead.typeCount());
        await q(`INSERT INTO voucher_types (type_id, category, season, valid_from, valid_until, per_farmer_cap, tx_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [typeId, body.category, body.season, new Date(body.validFrom), new Date(body.validUntil), body.perFarmerCap, rc.hash]);
        await audit(req.principal!.sub, "voucherType.create", String(typeId), body);
        return { typeId, txHash: rc.hash };
      } catch (e) { return reply.code(400).send({ error: revertReason(e) }); }
    });

    priv.get("/allocations", async () => ({
      allocations: await q(`SELECT a.id, a.title, a.type_id AS "typeId", vt.category, vt.season, a.farmer_count AS "farmerCount", a.total_amount AS "totalAmount", a.tx_hashes AS "txHashes", a.created_by AS "createdBy", a.created_at AS "createdAt" FROM allocations a JOIN voucher_types vt ON vt.type_id=a.type_id ORDER BY a.created_at DESC`),
    }));

    /** Government allocation: mint entitlement to every eligible farmer (flat or per hectare), respecting the on-chain cap. */
    priv.post("/allocations", async (req, reply) => {
      const body = z.object({ title: z.string().min(3), typeId: z.number().int(), amountPerFarmer: z.number().int().nonnegative().optional(), amountPerHa: z.number().int().nonnegative().optional(), province: z.string().optional(), regency: z.string().optional() }).parse(req.body);
      const vt = await one(`SELECT * FROM voucher_types WHERE type_id=$1`, [body.typeId]);
      if (!vt) return reply.code(404).send({ error: "Jenis voucher tidak ada" });
      const params: unknown[] = []; const where = ["status='active'"];
      if (body.province) { params.push(body.province); where.push(`province=$${params.length}`); }
      if (body.regency) { params.push(body.regency); where.push(`regency=$${params.length}`); }
      const farmers = await q(`SELECT * FROM farmers WHERE ${where.join(" AND ")} ORDER BY id`, params);
      const targets: { address: string; amount: number }[] = [];
      for (const f of farmers) {
        const desired = body.amountPerHa ? Math.round(body.amountPerHa * Number(f.land_ha)) : (body.amountPerFarmer ?? 0);
        const already = Number(await voucherRead.issuedTo(vt.type_id, f.address));
        const room = vt.per_farmer_cap > 0 ? Math.max(0, vt.per_farmer_cap - already) : desired;
        const amount = Math.min(desired, room);
        if (amount > 0) targets.push({ address: f.address, amount });
      }
      if (targets.length === 0) return reply.code(400).send({ error: "Tidak ada petani yang memenuhi syarat (semua sudah mencapai plafon)" });
      const seq = (await one(`SELECT count(*)::int AS n FROM allocations`))!.n + 1;
      const id = `ALLOC-${vt.season.replace(/[^A-Za-z0-9]/g, "")}-${String(seq).padStart(3, "0")}`;
      const txHashes: string[] = [];
      try {
        for (let i = 0; i < targets.length; i += 40) {
          const chunk = targets.slice(i, i + 40);
          txHashes.push((await confirm(voucher.issueBatch(chunk.map((t) => t.address), vt.type_id, chunk.map((t) => t.amount), b32(id), TX))).hash);
        }
      } catch (e) { return reply.code(400).send({ error: revertReason(e) }); }
      const total = targets.reduce((a, t) => a + t.amount, 0);
      await q(`INSERT INTO allocations (id, title, type_id, farmer_count, total_amount, tx_hashes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, body.title, vt.type_id, targets.length, total, txHashes, req.principal!.sub]);
      await audit(req.principal!.sub, "allocation.issue", id, { ...body, farmers: targets.length, total });
      return { id, farmers: targets.length, total, txHashes };
    });

    priv.get("/products", async () => ({ products: await q(`SELECT sku, name, brand, category, unit, het_price AS "hetPrice", active FROM products ORDER BY category, name`) }));
    priv.post("/products", async (req) => {
      const body = z.object({ sku: z.string().min(2), name: z.string().min(2), brand: z.string().optional(), category: z.enum(["PUPUK", "BENIH", "ALSINTAN", "PESTISIDA"]), unit: z.string(), hetPrice: z.number().int().positive(), active: z.boolean().default(true) }).parse(req.body);
      await q(`INSERT INTO products (sku, name, brand, category, unit, het_price, active) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (sku) DO UPDATE SET name=EXCLUDED.name, brand=EXCLUDED.brand, category=EXCLUDED.category, unit=EXCLUDED.unit, het_price=EXCLUDED.het_price, active=EXCLUDED.active`, [body.sku, body.name, body.brand ?? null, body.category, body.unit, body.hetPrice, body.active]);
      await audit(req.principal!.sub, "product.upsert", body.sku, body);
      return { ok: true };
    });

    priv.get("/audit", async () => ({ entries: await q(`SELECT id, actor, action, target, detail, created_at AS "createdAt" FROM audit_log ORDER BY created_at DESC LIMIT 200`) }));
  });
}
