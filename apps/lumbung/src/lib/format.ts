import { formatIDR, CATEGORY_BY_CODE, type CategoryCode } from "@tandur/shared";

export const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const idr = (v: unknown) => formatIDR(num(v));
export const idrCompact = (v: unknown) => formatIDR(num(v), { compact: true });
export const pct = (v: unknown, digits = 1) => `${(num(v) * 100).toFixed(digits)}%`;
export const int = (v: unknown) => new Intl.NumberFormat("id-ID").format(num(v));

const dtf = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const df = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const dfShort = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
export const fmtDateTime = (v: string | number | Date | null | undefined) => (v ? dtf.format(new Date(v)) : "–");
export const fmtDate = (v: string | number | Date | null | undefined) => (v ? df.format(new Date(v)) : "–");
export const fmtDayShort = (v: string | number | Date) => dfShort.format(new Date(v));
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Jakarta" });
/** "2026-09-25" (date-only string) passes through; an ISO timestamp (pg `date` serialised at WIB midnight) is keyed by its WIB calendar day. */
export const dayKey = (v: string | Date) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : dayKeyFmt.format(new Date(v)));
export const wibDay = (d: Date) => dayKeyFmt.format(d);

export const catLabel = (code: string) => CATEGORY_BY_CODE[code as CategoryCode]?.id ?? code;
export const catShort = (code: string) => CATEGORY_BY_CODE[code as CategoryCode]?.short ?? code;

export const shortHash = (h: string, head = 6, tail = 4) => (h && h.length > head + tail + 3 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h ?? "");

export const RULE_LABEL: Record<string, string> = {
  merchant_concentration: "Konsentrasi merchant",
  velocity: "Kecepatan transaksi tidak wajar",
  split_transactions: "Transaksi dipecah",
  same_day_full_drain: "Jatah dikuras dalam sehari",
  off_hours: "Transaksi di luar jam kerja",
  round_amounts: "Nominal bulat berulang",
  out_of_region: "Belanja di luar wilayah",
};
export const ruleLabel = (r: string) => RULE_LABEL[r] ?? r.replace(/_/g, " ");

export const SEVERITY_LABEL: Record<string, string> = { critical: "Kritis", serious: "Serius", warning: "Peringatan", info: "Info" };
export const ALERT_STATUS_LABEL: Record<string, string> = { open: "Terbuka", reviewing: "Ditinjau", closed: "Ditutup" };
export const INVOICE_STATUS_LABEL: Record<string, string> = { pending: "Menunggu", paid: "Dibayar", expired: "Kedaluwarsa", cancelled: "Dibatalkan", failed: "Gagal" };
export const KIND_LABEL: Record<string, string> = { kdmp: "KDMP", kios: "Kios", distributor: "Distributor" };
export const ROLE_LABEL: Record<string, string> = { ministry: "Kementerian", operator: "Operator", auditor: "Auditor" };
export const EVENT_LABEL: Record<string, string> = {
  Issued: "Penerbitan", Spent: "Pembelanjaan", Redeemed: "Penebusan", Clawback: "Penarikan", Expired: "Kedaluwarsa", Frozen: "Pembekuan",
  VoucherTypeCreated: "Jenis voucher dibuat", FarmerRegistered: "Petani terdaftar", FarmerStatusChanged: "Status petani", MerchantRegistered: "Merchant terdaftar", MerchantStatusChanged: "Status merchant",
  TransferSingle: "Mutasi saldo", TransferBatch: "Mutasi saldo (batch)", ApprovalForAll: "Persetujuan operator", RoleGranted: "Peran diberikan", RoleRevoked: "Peran dicabut", RoleAdminChanged: "Admin peran diubah", URI: "URI metadata",
};
/** ERC-1155 / access-control mirror events: kept in the explorer, hidden from the headline feed. */
export const MIRROR_EVENTS = new Set(["TransferSingle", "TransferBatch", "ApprovalForAll", "URI"]);
export const ACTION_LABEL: Record<string, string> = {
  "farmer.freeze": "Bekukan petani", "farmer.unfreeze": "Buka blokir petani", "merchant.activate": "Aktifkan merchant", "merchant.suspend": "Tangguhkan merchant",
  "alert.status": "Ubah status peringatan", "payout.run": "Settlement merchant", "voucherType.create": "Buat jenis voucher", "allocation.issue": "Terbitkan alokasi", "product.upsert": "Ubah katalog/HET",
  "device.rebind": "Ganti perangkat dompet", "farmer.login": "Login dompet", "merchant.login": "Login POS",
};

export function toCSV(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [columns.map((c) => esc(c.label)).join(","), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(","))].join("\n");
}
export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
