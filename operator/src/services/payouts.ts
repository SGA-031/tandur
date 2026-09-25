/** Merchant settlement: burn each merchant's received vouchers (Redeemed event) and pay fiat against that event. */
import { q } from "../db/index.ts";
import { b32, balancesOf, confirm, voucher, TX } from "./chain.ts";

/** Settles every paid, not-yet-settled invoice (optionally only those paid up to `upTo`). Each invoice is tagged with its payout. */
export async function runPayouts(actor: string, opts: { at?: Date; upTo?: Date } = {}) {
  const types = await q(`SELECT type_id, category FROM voucher_types ORDER BY valid_until ASC, type_id ASC`);
  const merchants = await q(`SELECT * FROM merchants WHERE status='active'`);
  const day = (opts.at ?? new Date()).toISOString().slice(0, 10).replace(/-/g, "");
  const results = [];
  for (const m of merchants) {
    const pending = await q(`SELECT id, category_totals FROM invoices WHERE merchant_id=$1 AND status='paid' AND payout_id IS NULL ${opts.upTo ? "AND paid_at <= $2" : ""}`, opts.upTo ? [m.id, opts.upTo] : [m.id]);
    if (pending.length === 0) continue;
    const byType: Record<string, number> = {};
    for (const inv of pending) for (const [cat, v] of Object.entries(inv.category_totals as Record<string, number>)) byType[cat] = (byType[cat] ?? 0) + Number(v);
    const bal = await balancesOf(m.address, types.map((t) => t.type_id));
    const seq = (await q(`SELECT count(*)::int AS n FROM payouts WHERE id LIKE $1`, [`PAYOUT-${day}-%`]))[0].n + 1;
    const id = `PAYOUT-${day}-${String(seq).padStart(3, "0")}`;
    const txHashes: string[] = [];
    let amount = 0;
    // burn per voucher type, oldest season first, never more than the on-chain balance
    for (const [cat, need] of Object.entries(byType)) {
      let remaining = need;
      for (let i = 0; i < types.length && remaining > 0; i++) {
        if (types[i].category !== cat || bal[i] === 0) continue;
        const take = Math.min(remaining, bal[i]);
        txHashes.push((await confirm(voucher.redeem(m.address, types[i].type_id, take, b32(id), TX))).hash);
        bal[i] -= take; remaining -= take; amount += take;
      }
    }
    await q(`UPDATE invoices SET payout_id=$2 WHERE id = ANY($1)`, [pending.map((p) => p.id), id]);
    const bankRef = `BRI-H2H-${day}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    await q(`INSERT INTO payouts (id, merchant_id, amount, by_type, tx_hashes, bank_ref, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,'settled',$7)`,
      [id, m.id, amount, JSON.stringify(byType), txHashes, bankRef, opts.at ?? new Date()]);
    await q(`INSERT INTO audit_log (actor, action, target, detail) VALUES ($1,'payout.run',$2,$3)`, [actor, m.id, JSON.stringify({ id, amount, bankRef })]);
    results.push({ id, merchantId: m.id, merchantName: m.name, amount, byType, txHashes, bankRef, invoices: pending.length });
  }
  return results;
}
