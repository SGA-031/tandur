import { CATEGORY_BY_CODE, formatIDR, type InvoiceDTO, type CategoryCode } from "@tandur/shared";
import { fmtDateTime, MODE_LABEL, type MerchantDTO } from "../api";

/** Print-only receipt (visible under @media print). */
export function Receipt({ invoice, merchant }: { invoice: InvoiceDTO; merchant: MerchantDTO | null }) {
  const cats = Object.entries(invoice.categoryTotals) as [CategoryCode, number][];
  return (
    <div className="receipt">
      <h1>{merchant?.name ?? invoice.merchant.name}</h1>
      <div className="c">{merchant?.address ?? ""}</div>
      <div className="c">{invoice.merchant.city}</div>
      <hr />
      <table>
        <tbody>
          <tr><td>No</td><td className="r">{invoice.invoiceNo}</td></tr>
          <tr><td>Waktu</td><td className="r">{fmtDateTime(invoice.paidAt ?? invoice.createdAt)}</td></tr>
          {invoice.farmerName && <tr><td>Petani</td><td className="r">{invoice.farmerName}</td></tr>}
          {invoice.mode && <tr><td>Metode</td><td className="r">{MODE_LABEL[invoice.mode] ?? invoice.mode}</td></tr>}
        </tbody>
      </table>
      <hr />
      <table>
        <tbody>
          {invoice.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.name}<br />{l.qty} x {formatIDR(l.unitPrice)}</td>
              <td className="r">{formatIDR(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      <table>
        <tbody>
          {cats.map(([c, v]) => <tr key={c}><td>{CATEGORY_BY_CODE[c]?.id ?? c}</td><td className="r">{formatIDR(v)}</td></tr>)}
          <tr className="tot"><td>TOTAL</td><td className="r">{formatIDR(invoice.total)}</td></tr>
        </tbody>
      </table>
      <hr />
      <div>Dibayar dengan voucher subsidi Tandur</div>
      <div>Status: {invoice.status === "paid" ? "LUNAS" : invoice.status.toUpperCase()}</div>
      {invoice.txHash && <div className="hash">Bukti: {invoice.txHash}{invoice.blockNumber ? ` (blok ${invoice.blockNumber})` : ""}</div>}
      <div className="hash">Hash invoice: {invoice.hash}</div>
      <hr />
      <div className="c">Terima kasih. Simpan struk ini.</div>
    </div>
  );
}
