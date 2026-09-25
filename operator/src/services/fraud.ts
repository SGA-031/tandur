/**
 * Fraud analytics over settled invoices. Patterns come from USDA SNAP trafficking detection and the
 * Zambia/Kenya/Nigeria e-voucher post-mortems: merchant concentration, velocity, split transactions,
 * same-day full drains, off-hours activity, round amounts, and out-of-region purchases.
 */
import { q } from "../db/index.ts";

type Alert = { severity: "info" | "warning" | "serious" | "critical"; rule: string; subject_kind: string; subject_id: string; detail: string; evidence?: unknown };

async function upsert(a: Alert) {
  await q(
    `INSERT INTO fraud_alerts (severity, rule, subject_kind, subject_id, detail, evidence)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (rule, subject_kind, subject_id) DO UPDATE SET severity=EXCLUDED.severity, detail=EXCLUDED.detail, evidence=EXCLUDED.evidence`,
    [a.severity, a.rule, a.subject_kind, a.subject_id, a.detail, JSON.stringify(a.evidence ?? null)],
  );
}

export async function runFraudRules(): Promise<number> {
  let n = 0;
  // 1. Merchant concentration: > 60% of its regency's volume with at least 10 invoices.
  for (const r of await q(`
    WITH reg AS (SELECT m.regency, sum(i.total) AS vol FROM invoices i JOIN merchants m ON m.id=i.merchant_id WHERE i.status='paid' GROUP BY m.regency),
    mer AS (SELECT m.id, m.name, m.regency, sum(i.total) AS vol, count(*) AS n FROM invoices i JOIN merchants m ON m.id=i.merchant_id WHERE i.status='paid' GROUP BY m.id, m.name, m.regency)
    SELECT mer.*, reg.vol AS regency_vol, round(100.0*mer.vol/NULLIF(reg.vol,0),1) AS share FROM mer JOIN reg USING (regency)
    WHERE mer.n >= 10 AND mer.vol > 0.6*reg.vol AND (SELECT count(*) FROM merchants x WHERE x.regency=mer.regency) > 1`)) {
    await upsert({ severity: "warning", rule: "merchant_concentration", subject_kind: "merchant", subject_id: r.id, detail: `${r.name} menyerap ${r.share}% volume subsidi di ${r.regency} (${r.n} transaksi)`, evidence: { share: r.share, volume: r.vol, invoices: r.n } }); n++;
  }
  // 2. Velocity: > 25 paid invoices within any 60-minute window.
  for (const r of await q(`
    SELECT a.merchant_id, m.name, a.paid_at AS window_start, count(*) AS n FROM invoices a JOIN invoices b ON b.merchant_id=a.merchant_id AND b.status='paid' AND b.paid_at >= a.paid_at AND b.paid_at < a.paid_at + interval '60 minutes'
    JOIN merchants m ON m.id=a.merchant_id WHERE a.status='paid' GROUP BY a.merchant_id, m.name, a.paid_at HAVING count(*) > 25 ORDER BY n DESC`)) {
    await upsert({ severity: "serious", rule: "velocity", subject_kind: "merchant", subject_id: r.merchant_id, detail: `${r.name}: ${r.n} transaksi dalam 60 menit (mulai ${new Date(r.window_start).toLocaleString("id-ID")})`, evidence: { count: r.n, windowStart: r.window_start } }); n++;
  }
  // 3. Split transactions: same farmer + merchant, >= 3 paid invoices within any 30-minute window.
  for (const r of await q(`
    WITH w AS (
      SELECT a.farmer_id, a.merchant_id, a.paid_at,
        (SELECT count(*) FROM invoices b WHERE b.farmer_id=a.farmer_id AND b.merchant_id=a.merchant_id AND b.status='paid' AND b.paid_at BETWEEN a.paid_at AND a.paid_at + interval '30 minutes') AS n
      FROM invoices a WHERE a.status='paid' AND a.farmer_id IS NOT NULL)
    SELECT w.farmer_id, w.merchant_id, f.name AS farmer, m.name AS merchant, max(w.n) AS n, min(w.paid_at) AS first_at
    FROM w JOIN farmers f ON f.id=w.farmer_id JOIN merchants m ON m.id=w.merchant_id WHERE w.n >= 3 GROUP BY 1,2,3,4`)) {
    await upsert({ severity: "warning", rule: "split_transactions", subject_kind: "farmer", subject_id: r.farmer_id, detail: `${r.farmer}: ${r.n} invoice terpisah di ${r.merchant} dalam 30 menit`, evidence: { merchantId: r.merchant_id, count: r.n, firstAt: r.first_at } }); n++;
  }
  // 4. Same-day full drain: >= 5 farmers spent >= 95% of their fertilizer entitlement at one merchant on one day.
  for (const r of await q(`
    WITH iss AS (SELECT (args->>'farmer') AS addr, sum((args->>'amount')::bigint) AS issued FROM chain_events WHERE name='Issued' GROUP BY 1)
    SELECT i.merchant_id, m.name, i.paid_at::date AS day, count(DISTINCT i.farmer_id) AS n
    FROM invoices i JOIN farmers f ON f.id=i.farmer_id JOIN iss ON lower(iss.addr)=lower(f.address) JOIN merchants m ON m.id=i.merchant_id
    WHERE i.status='paid' AND i.total >= 0.95*iss.issued GROUP BY 1,2,3 HAVING count(DISTINCT i.farmer_id) >= 5`)) {
    await upsert({ severity: "serious", rule: "same_day_full_drain", subject_kind: "merchant", subject_id: r.merchant_id, detail: `${r.name}: ${r.n} petani menghabiskan >=95% jatah dalam satu hari (${r.day})`, evidence: { day: r.day, farmers: r.n } }); n++;
  }
  // 5. Off-hours: paid between 22:00 and 05:00 WIB.
  for (const r of await q(`
    SELECT i.id, i.invoice_no, m.name, to_char(i.paid_at AT TIME ZONE 'Asia/Jakarta','HH24:MI') AS t FROM invoices i JOIN merchants m ON m.id=i.merchant_id
    WHERE i.status='paid' AND (extract(hour FROM i.paid_at AT TIME ZONE 'Asia/Jakarta') >= 22 OR extract(hour FROM i.paid_at AT TIME ZONE 'Asia/Jakarta') < 5)`)) {
    await upsert({ severity: "info", rule: "off_hours", subject_kind: "invoice", subject_id: r.id, detail: `${r.invoice_no} dibayar pukul ${r.t} WIB di ${r.name}`, evidence: { time: r.t } }); n++;
  }
  // 6. Round amounts: >70% of a merchant's invoices are exact multiples of Rp100.000 (>= 10 invoices).
  for (const r of await q(`
    SELECT m.id, m.name, count(*) AS n, sum(CASE WHEN i.total % 100000 = 0 THEN 1 ELSE 0 END) AS round_n FROM invoices i JOIN merchants m ON m.id=i.merchant_id
    WHERE i.status='paid' GROUP BY m.id, m.name HAVING count(*) >= 10 AND sum(CASE WHEN i.total % 100000 = 0 THEN 1 ELSE 0 END) > 0.7*count(*)`)) {
    await upsert({ severity: "info", rule: "round_amounts", subject_kind: "merchant", subject_id: r.id, detail: `${r.name}: ${r.round_n} dari ${r.n} invoice bernilai kelipatan Rp100.000 persis`, evidence: { n: r.n, round: r.round_n } }); n++;
  }
  // 7. Out-of-region: farmer bought outside their home regency.
  for (const r of await q(`
    SELECT i.id, i.invoice_no, f.name AS farmer, f.regency AS home, m.name AS merchant, m.regency AS there FROM invoices i JOIN farmers f ON f.id=i.farmer_id JOIN merchants m ON m.id=i.merchant_id
    WHERE i.status='paid' AND f.regency <> m.regency`)) {
    await upsert({ severity: "warning", rule: "out_of_region", subject_kind: "invoice", subject_id: r.id, detail: `${r.farmer} (${r.home}) berbelanja di ${r.merchant} (${r.there})`, evidence: { home: r.home, there: r.there } }); n++;
  }
  return n;
}
