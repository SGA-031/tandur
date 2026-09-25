/** All amounts are integer rupiah (no decimals). On-chain unit = 1 IDR. */
export function formatIDR(amount: number | bigint | string, opts: { compact?: boolean } = {}): string {
  const n = typeof amount === "bigint" ? Number(amount) : Number(amount);
  if (opts.compact) {
    if (Math.abs(n) >= 1e12) return `Rp ${(n / 1e12).toFixed(2)} T`;
    if (Math.abs(n) >= 1e9) return `Rp ${(n / 1e9).toFixed(2)} M`;
    if (Math.abs(n) >= 1e6) return `Rp ${(n / 1e6).toFixed(1)} jt`;
    if (Math.abs(n) >= 1e3) return `Rp ${(n / 1e3).toFixed(0)} rb`;
  }
  return "Rp " + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
}
