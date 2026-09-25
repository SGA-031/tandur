import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatIDR, type InvoiceDTO, type InvoiceStatus } from "@tandur/shared";
import { api, copyText, fmtDateTime, fmtTime, isToday, MODE_LABEL, shortHash, STATUS_LABEL } from "../api";
import { StatusPill } from "../components/StatusPill";
import { CategoryBreakdown, InvoiceLines } from "../components/InvoiceLines";
import { useToast } from "../components/Toast";

const FILTERS: { key: InvoiceStatus | ""; label: string }[] = [
  { key: "", label: "Semua" },
  { key: "paid", label: "Dibayar" },
  { key: "pending", label: "Menunggu" },
  { key: "expired", label: "Kedaluwarsa" },
  { key: "cancelled", label: "Dibatalkan" },
];

export function TransactionsPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [status, setStatus] = useState<InvoiceStatus | "">("");
  const [items, setItems] = useState<InvoiceDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<InvoiceDTO | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setItems(null);
    try {
      const r = await api.listInvoices({ status, limit: 200 });
      setItems(r.invoices); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = window.setInterval(() => load(true), 10_000);
    return () => window.clearInterval(t);
  }, [load]);

  const groups = useMemo(() => {
    const today = (items ?? []).filter((i) => isToday(i.createdAt));
    const older = (items ?? []).filter((i) => !isToday(i.createdAt));
    return { today, older };
  }, [items]);

  const Row = ({ inv }: { inv: InvoiceDTO }) => (
    <button className="tx-row" onClick={() => (inv.status === "pending" ? nav(`/invoice/${inv.id}`) : setSelected(inv))}>
      <span className="t">{fmtTime(inv.createdAt)}</span>
      <span className="main">
        <span className="who">{inv.farmerName ?? (inv.status === "pending" ? "Menunggu petani…" : "–")}</span>
        <span className="no">{inv.invoiceNo}</span>
        <span className="meta">
          {inv.mode && <span>{MODE_LABEL[inv.mode] ?? inv.mode}</span>}
          {inv.txHash && <span className="mono">{shortHash(inv.txHash)}</span>}
          {inv.lines?.length ? <span>{inv.lines.length} barang</span> : null}
        </span>
      </span>
      <span className="amt">
        <strong>{formatIDR(inv.total)}</strong>
        <StatusPill status={inv.status} />
      </span>
    </button>
  );

  return (
    <main className="page">
      <div className="page-title">
        <div><h1>Transaksi</h1><p>Riwayat invoice merchant ini, diperbarui otomatis.</p></div>
        <button className="btn btn-sm" onClick={() => load()}>Muat ulang</button>
      </div>
      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f.key} className={`tab${status === f.key ? " active" : ""}`} onClick={() => setStatus(f.key)}>{f.label}</button>
        ))}
      </div>

      {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
      {!items ? (
        <div className="stack">{Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton" style={{ height: 64 }} />)}</div>
      ) : items.length === 0 ? (
        <div className="card empty"><strong>Belum ada transaksi</strong>Invoice yang dibuat dari kasir akan muncul di sini.</div>
      ) : (
        <>
          {groups.today.length > 0 && (
            <div className="tx-group">
              <h3>Hari ini · {groups.today.length}</h3>
              <div className="card tx-list">{groups.today.map((i) => <Row key={i.id} inv={i} />)}</div>
            </div>
          )}
          {groups.older.length > 0 && (
            <div className="tx-group">
              <h3>Sebelumnya · {groups.older.length}</h3>
              <div className="card tx-list">{groups.older.map((i) => <Row key={i.id} inv={i} />)}</div>
            </div>
          )}
        </>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-head">
              <div>
                <h2>{formatIDR(selected.total)}</h2>
                <div className="inv-no">{selected.invoiceNo}</div>
              </div>
              <StatusPill status={selected.status} />
            </div>
            <dl className="kv" style={{ maxWidth: "none", marginBottom: 14 }}>
              <dt>Status</dt><dd>{STATUS_LABEL[selected.status]}</dd>
              <dt>Dibuat</dt><dd>{fmtDateTime(selected.createdAt)}</dd>
              {selected.paidAt && <><dt>Dibayar</dt><dd>{fmtDateTime(selected.paidAt)}</dd></>}
              {selected.farmerName && <><dt>Petani</dt><dd>{selected.farmerName}</dd></>}
              {selected.mode && <><dt>Metode</dt><dd>{MODE_LABEL[selected.mode] ?? selected.mode}</dd></>}
              {selected.txHash && (
                <><dt>Bukti ledger</dt>
                <dd><span className="mono" title={selected.txHash}>{shortHash(selected.txHash, 8)}</span>
                  <button className="copy-btn" onClick={async () => { await copyText(selected.txHash!); toast.ok("Hash disalin"); }}>Salin</button></dd></>
              )}
              {selected.blockNumber != null && <><dt>Blok</dt><dd className="mono">{selected.blockNumber}</dd></>}
            </dl>
            <div className="stack">
              <CategoryBreakdown totals={selected.categoryTotals} />
              <InvoiceLines invoice={selected} />
            </div>
            <div className="row" style={{ marginTop: 16, justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => nav(`/invoice/${selected.id}`)}>Buka halaman invoice</button>
              <button className="btn btn-primary" onClick={() => setSelected(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
