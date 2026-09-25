import { CATEGORY_BY_CODE, formatIDR, type InvoiceDTO, type CategoryCode } from "@tandur/shared";

export function InvoiceLines({ invoice }: { invoice: InvoiceDTO }) {
  return (
    <table className="lines-table">
      <thead>
        <tr><th>Barang</th><th className="r">Jml</th><th className="r">Subtotal</th></tr>
      </thead>
      <tbody>
        {invoice.lines.map((l, i) => (
          <tr key={`${l.sku}-${i}`}>
            <td>
              <div>{l.name}</div>
              <div className="ln-meta">{formatIDR(l.unitPrice)} / {l.unit} · {CATEGORY_BY_CODE[l.category]?.short ?? l.category}</div>
            </td>
            <td className="r">{l.qty}</td>
            <td className="r"><strong>{formatIDR(l.lineTotal)}</strong></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CategoryBreakdown({ totals }: { totals: Partial<Record<CategoryCode, number>> }) {
  const entries = Object.entries(totals).filter(([, v]) => (v ?? 0) > 0) as [CategoryCode, number][];
  if (!entries.length) return null;
  return (
    <div className="cat-rows">
      {entries.map(([c, v]) => (
        <div className="cat-row" key={c}>
          <span className={`cat-chip cat-${c}`}>{CATEGORY_BY_CODE[c]?.icon} {CATEGORY_BY_CODE[c]?.id ?? c}</span>
          <strong>{formatIDR(v)}</strong>
        </div>
      ))}
    </div>
  );
}
