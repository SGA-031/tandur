/** Nightly-style three-way reconciliation: chain supply vs indexed events vs operator ledger vs payouts. */
import { q } from "../db/index.ts";
import { voucherRead } from "./chain.ts";
import { getIndexedBlock } from "./indexer.ts";

export async function reconciliationReport() {
  const types = await q(`SELECT * FROM voucher_types ORDER BY type_id`);
  const rows = [];
  for (const t of types) {
    const supply = Number(await voucherRead["totalSupply(uint256)"](t.type_id));
    const ev = async (name: string) => Number((await q(`SELECT coalesce(sum((args->>'amount')::bigint),0) AS s FROM chain_events WHERE name=$1 AND (args->>'typeId')::int=$2`, [name, t.type_id]))[0].s);
    const issued = await ev("Issued"), spent = await ev("Spent"), redeemed = await ev("Redeemed"), clawback = await ev("Clawback"), expired = await ev("Expired");
    const expectedSupply = issued - redeemed - clawback - expired;
    rows.push({ typeId: t.type_id, category: t.category, season: t.season, onChainSupply: supply, issued, spent, redeemed, clawback, expired, expectedSupply, supplyOk: supply === expectedSupply });
  }
  const invoicesPaid = Number((await q(`SELECT coalesce(sum(total),0) AS s FROM invoices WHERE status='paid'`))[0].s);
  const spentEvents = rows.reduce((a, r) => a + r.spent, 0);
  const payouts = Number((await q(`SELECT coalesce(sum(amount),0) AS s FROM payouts`))[0].s);
  const redeemedEvents = rows.reduce((a, r) => a + r.redeemed, 0);
  const merchantReceivable = spentEvents - redeemedEvents;
  return {
    checkedAt: new Date().toISOString(), indexedBlock: await getIndexedBlock(), rows,
    ledger: { invoicesPaid, spentEvents, ok: invoicesPaid === spentEvents },
    settlement: { payouts, redeemedEvents, ok: payouts === redeemedEvents, merchantReceivable },
    allOk: rows.every((r) => r.supplyOk) && invoicesPaid === spentEvents && payouts === redeemedEvents,
  };
}
