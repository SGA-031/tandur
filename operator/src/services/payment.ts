import { formatIDR, CATEGORY_BY_CODE, type CategoryCode } from "@tandur/shared";
import { q, one } from "../db/index.ts";
import { balancesOf, confirm, provider, revertReason, signSpend, voucher, voucherRead, TX, type SpendAuth } from "./chain.ts";
import { unlockWallet } from "./vault.ts";
import { loadInvoice, toDTO } from "./invoices.ts";
import { notifyFarmer } from "./notify.ts";

export interface Coverage { category: CategoryCode; label: string; needed: number; available: number; ok: boolean }

export async function activeVoucherTypes(at = new Date()) {
  return q(`SELECT * FROM voucher_types WHERE valid_from <= $1 AND valid_until >= $1 ORDER BY valid_until ASC, type_id ASC`, [at]);
}

/** Which voucher balances would cover this invoice, per category. */
export async function coverageFor(farmerAddress: string, categoryTotals: Record<string, number>): Promise<{ coverage: Coverage[]; canPay: boolean; plan: { typeId: number; category: CategoryCode; amount: number }[] }> {
  const types = await activeVoucherTypes();
  const balances = await balancesOf(farmerAddress, types.map((t) => t.type_id));
  const coverage: Coverage[] = [];
  const plan: { typeId: number; category: CategoryCode; amount: number }[] = [];
  for (const [cat, needed] of Object.entries(categoryTotals)) {
    if (!needed) continue;
    let remaining = needed;
    let available = 0;
    types.forEach((t, i) => {
      if (t.category !== cat) return;
      available += balances[i];
      if (remaining > 0 && balances[i] > 0) {
        const take = Math.min(remaining, balances[i]);
        plan.push({ typeId: t.type_id, category: cat as CategoryCode, amount: take });
        remaining -= take;
      }
    });
    coverage.push({ category: cat as CategoryCode, label: CATEGORY_BY_CODE[cat as CategoryCode]?.id ?? cat, needed, available, ok: remaining === 0 });
  }
  return { coverage, canPay: coverage.every((c) => c.ok), plan };
}

export async function payInvoice(opts: { invoiceId: string; farmer: any; pin: string; mode: "scan" | "assisted"; paidAt?: Date }) {
  const inv = await loadInvoice(opts.invoiceId);
  if (!inv) throw new Error("Invoice tidak ditemukan");
  if (inv.status !== "pending") throw new Error(`Invoice sudah ${inv.status === "paid" ? "dibayar" : inv.status}`);
  if (new Date(inv.expires_at) < new Date() && !opts.paidAt) throw new Error("Invoice kedaluwarsa, minta kasir membuat ulang");
  if (opts.farmer.status !== "active") throw new Error("Akun dibekukan. Hubungi penyuluh.");

  const wallet = unlockWallet(opts.farmer.enc_key, opts.pin, provider); // throws "PIN salah"
  const { coverage, canPay, plan } = await coverageFor(opts.farmer.address, inv.category_totals);
  if (!canPay) {
    const short = coverage.filter((c) => !c.ok).map((c) => `${c.label}: kurang ${formatIDR(c.needed - c.available)}`).join("; ");
    throw new Error(`Saldo tidak cukup. ${short}`);
  }
  const nonce = Number(await voucherRead.nonces(opts.farmer.address));
  const deadline = Math.floor(Date.now() / 1000) + 300;
  const auths: SpendAuth[] = plan.map((p, i) => ({
    farmer: opts.farmer.address, merchant: inv.merchant_address, typeId: p.typeId, amount: p.amount, invoiceHash: inv.hash, nonce: nonce + i, deadline,
  }));
  const sigs = await Promise.all(auths.map((a) => signSpend(wallet, a)));
  let receipt;
  try {
    receipt = await confirm(voucher.spendMulti(auths, sigs, TX));
  } catch (e) {
    const reason = revertReason(e);
    await q(`UPDATE invoices SET error=$2 WHERE id=$1`, [inv.id, reason]);
    throw new Error(`Ledger menolak: ${reason}`);
  }
  const paidAt = opts.paidAt ?? new Date();
  await q(`UPDATE invoices SET status='paid', farmer_id=$2, mode=$3, tx_hash=$4, block_number=$5, paid_at=$6, error=NULL WHERE id=$1`,
    [inv.id, opts.farmer.id, opts.mode, receipt.hash, receipt.blockNumber, paidAt]);
  const after = await coverageFor(opts.farmer.address, inv.category_totals);
  const remaining = after.coverage.map((c) => `${c.label} ${formatIDR(c.available)}`).join(", ");
  await notifyFarmer(opts.farmer.id, `TANDUR: Pembayaran ${formatIDR(inv.total)} di ${inv.merchant_name} berhasil (${inv.invoice_no}). Sisa saldo: ${remaining}. Bukti: ${receipt.hash.slice(0, 10)}…`, paidAt);
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber, invoice: toDTO(await loadInvoice(inv.id)) };
}

export async function farmerBalances(farmer: any) {
  const types = await q(`SELECT * FROM voucher_types ORDER BY valid_until ASC, type_id ASC`);
  const balances = await balancesOf(farmer.address, types.map((t) => t.type_id));
  const issued = await Promise.all(types.map((t) => voucherRead.issuedTo(t.type_id, farmer.address).then(Number)));
  const spent = await Promise.all(types.map((t) => voucherRead.spentBy(t.type_id, farmer.address).then(Number)));
  return types.map((t, i) => ({
    typeId: t.type_id, category: t.category as CategoryCode, season: t.season, balance: balances[i], issued: issued[i], spent: spent[i],
    validUntil: new Date(t.valid_until).toISOString(),
  })).filter((b) => b.issued > 0 || b.balance > 0);
}

export async function findFarmerByNikHash(nikHash: string) {
  return one(`SELECT * FROM farmers WHERE nik_hash=$1`, [nikHash]);
}
