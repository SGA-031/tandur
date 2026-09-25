import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { categoryColor } from "../charts/palette";
import { catLabel, catShort, shortHash, SEVERITY_LABEL, INVOICE_STATUS_LABEL, ALERT_STATUS_LABEL, KIND_LABEL } from "../lib/format";

/* ---------- Card ---------- */
export function Card({ title, sub, actions, children, flush, className }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) {
  return (
    <section className={`card ${className ?? ""}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>{title && <h3>{title}</h3>}{sub && <div className="sub">{sub}</div>}</div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      <div className={`card-body ${flush ? "flush" : ""}`}>{children}</div>
    </section>
  );
}

/* ---------- StatTile ---------- */
export function StatTile({ label, value, hint, hero, accent, meter, delta, deltaTone }: { label: string; value: ReactNode; hint?: ReactNode; hero?: boolean; accent?: boolean; meter?: number; delta?: ReactNode; deltaTone?: "ok" | "bad" | "neutral" }) {
  return (
    <div className={`stat ${accent ? "accent" : ""}`}>
      <div className="label">{label}</div>
      <div className={`value ${hero ? "hero" : ""}`}>{value}</div>
      {delta && <div className="delta" style={{ color: deltaTone === "ok" ? "var(--ok)" : deltaTone === "bad" ? "var(--critical)" : "var(--ink-3)" }}>{delta}</div>}
      {typeof meter === "number" && <div className="meter" role="img" aria-label={`${Math.round(meter * 100)}%`}><i style={{ width: `${Math.min(100, Math.max(0, meter * 100))}%` }} /></div>}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

/* ---------- Pills & badges ---------- */
export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    active: { cls: "ok", label: "Aktif" }, frozen: { cls: "bad", label: "Dibekukan" }, suspended: { cls: "bad", label: "Ditangguhkan" },
    paid: { cls: "ok", label: INVOICE_STATUS_LABEL.paid }, pending: { cls: "warn", label: INVOICE_STATUS_LABEL.pending }, expired: { cls: "neutral", label: INVOICE_STATUS_LABEL.expired },
    cancelled: { cls: "neutral", label: INVOICE_STATUS_LABEL.cancelled }, failed: { cls: "bad", label: INVOICE_STATUS_LABEL.failed },
    settled: { cls: "ok", label: "Selesai" }, open: { cls: "warn", label: ALERT_STATUS_LABEL.open }, reviewing: { cls: "info", label: ALERT_STATUS_LABEL.reviewing }, closed: { cls: "neutral", label: ALERT_STATUS_LABEL.closed },
  };
  const m = map[status] ?? { cls: "neutral", label: status };
  return <span className={`pill ${m.cls}`}>{m.label}</span>;
}

const SevIcon = ({ s }: { s: string }) => s === "critical" || s === "serious"
  ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 2.5 14 13H2L8 2.5Z" /><path d="M8 6.5v3M8 11.2v.3" /></svg>
  : s === "warning" ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="6" /><path d="M8 5v3.5M8 11v.3" /></svg>
  : <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="6" /><path d="M8 7.5V11M8 5v.3" /></svg>;

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`sev ${severity}`}><SevIcon s={severity} />{SEVERITY_LABEL[severity] ?? severity}</span>;
}

export function CategoryTag({ code, short }: { code: string; short?: boolean }) {
  return <span className="cat"><i style={{ background: categoryColor(code) }} />{short ? catShort(code) : catLabel(code)}</span>;
}

export function KindBadge({ kind }: { kind: string }) { return <span className="kind">{KIND_LABEL[kind] ?? kind}</span>; }

/* ---------- HashChip ---------- */
export function HashChip({ value, head = 6, tail = 4, to }: { value: string | null | undefined; head?: number; tail?: number; to?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="muted">–</span>;
  const copy = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ }
  };
  const text = <span className="t">{shortHash(value, head, tail)}</span>;
  return (
    <span className="hash" title={value}>
      {to ? <Link to={to} className="t" style={{ color: "inherit", textDecoration: "none" }}>{shortHash(value, head, tail)}</Link> : text}
      <button className="icon-btn" onClick={copy} aria-label="Salin" title={copied ? "Tersalin" : "Salin"}>
        {copied ? <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8.5 6.5 12 13 4.5" /></svg>
          : <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></svg>}
      </button>
    </span>
  );
}

/* ---------- EmptyState ---------- */
export function EmptyState({ title = "Belum ada data", desc }: { title?: string; desc?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{desc}</div>;
}
export function Loading({ text = "Memuat…" }: { text?: string }) { return <div className="loading">{text}</div>; }
export function ErrorBox({ error }: { error: string | null | undefined }) { return error ? <div className="err" role="alert">{error}</div> : null; }

/* ---------- Modal ---------- */
export function Modal({ open, title, onClose, children, footer }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Tutup">✕</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Toast ---------- */
type Toast = { id: number; text: string; tone: "ok" | "bad" | "neutral" };
const toastListeners = new Set<(t: Toast) => void>();
let toastId = 0;
export function toast(text: string, tone: Toast["tone"] = "neutral") { const t = { id: ++toastId, text, tone }; toastListeners.forEach((l) => l(t)); }
export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const l = (t: Toast) => { setItems((x) => [...x, t]); setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 4500); };
    toastListeners.add(l); return () => { toastListeners.delete(l); };
  }, []);
  return <div className="toasts">{items.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}</div>;
}

/* ---------- DataTable ---------- */
export interface Column<T> { key: string; label: ReactNode; render?: (row: T) => ReactNode; sort?: (row: T) => number | string; align?: "r"; width?: string | number; wrap?: boolean }
export function DataTable<T>({ columns, rows, rowKey, onRow, empty, footer, tall, defaultSort, maxHeight }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string | number; onRow?: (r: T) => void; empty?: ReactNode; footer?: ReactNode[]; tall?: boolean; defaultSort?: { key: string; dir: "asc" | "desc" }; maxHeight?: number }) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(defaultSort ?? null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const f = col.sort;
    return [...rows].sort((a, b) => { const x = f(a), y = f(b); const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "id"); return sort.dir === "asc" ? c : -c; });
  }, [rows, sort, columns]);
  const toggle = (c: Column<T>) => { if (!c.sort) return; setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: "desc" })); };
  return (
    <div className={`table-wrap ${tall ? "tall" : ""}`} style={maxHeight ? { maxHeight } : undefined}>
      <table className="dt">
        <thead><tr>{columns.map((c) => (
          <th key={c.key} className={`${c.align ?? ""} ${c.sort ? "sortable" : ""}`} style={c.width ? { width: c.width } : undefined} onClick={() => toggle(c)}>
            {c.label}{sort?.key === c.key && <span className="arrow">{sort.dir === "asc" ? "▲" : "▼"}</span>}
          </th>
        ))}</tr></thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={columns.length}>{empty ?? <EmptyState />}</td></tr>}
          {sorted.map((r) => (
            <tr key={rowKey(r)} className={onRow ? "clickable" : ""} onClick={onRow ? () => onRow(r) : undefined}>
              {columns.map((c) => <td key={c.key} className={`${c.align ?? ""} ${c.wrap ? "wrap" : ""}`}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot><tr>{footer.map((f, i) => <td key={i} className={columns[i]?.align ?? ""}>{f}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

export function Pager({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1, to = Math.min(total, page * limit);
  return (
    <div className="pager">
      <span>{from}–{to} dari {new Intl.NumberFormat("id-ID").format(total)}</span>
      <div className="pages">
        <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Sebelumnya</button>
        <span style={{ padding: "0 8px" }}>Hal. {page} / {pages}</span>
        <button className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Berikutnya ›</button>
      </div>
    </div>
  );
}

/* ---------- Filters row ---------- */
export function Filters({ children }: { children: ReactNode }) { return <div className="filters">{children}</div>; }
export function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="field"><label>{label}</label>{children}</div>; }

/* ---------- Check row (verification) ---------- */
export function CheckRow({ ok, label, desc }: { ok: boolean | null; label: ReactNode; desc?: ReactNode }) {
  return (
    <div className="check">
      <span className={`ind ${ok === null ? "na" : ok ? "ok" : "bad"}`}>
        {ok === null ? "–" : ok ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 8.5 6.5 12 13 4.5" /></svg> : <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 4l8 8M12 4l-8 8" /></svg>}
      </span>
      <div><div className="lbl">{label}</div>{desc && <div className="desc">{desc}</div>}</div>
    </div>
  );
}

/* ---------- Region select hook ---------- */
export function useRegions() {
  const [regions, setRegions] = useState<{ provinces: { province: string; farmers: number }[]; regencies: { province: string; regency: string; farmers: number }[] }>({ provinces: [], regencies: [] });
  useEffect(() => { api.get<typeof regions>("/admin/regions").then(setRegions).catch(() => {}); }, []);
  return regions;
}
