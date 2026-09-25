import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_BY_CODE, formatIDR, type CategoryCode } from "@tandur/shared";
import { api, copyText, fmtDate, shortHash, type SummaryDTO } from "../api";
import { useAuth } from "../components/Auth";
import { useToast } from "../components/Toast";

const num = (v: number | string | null | undefined) => Number(v ?? 0);

const jakartaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });

function last30Days(): string[] {
  const out: string[] = [];
  for (let i = 29; i >= 0; i--) out.push(jakartaDay.format(new Date(Date.now() - i * 86_400_000)));
  return out;
}

export function SettlementPage() {
  const toast = useToast();
  const { merchant } = useAuth();
  const [data, setData] = useState<SummaryDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.summary().then((r) => { if (alive) { setData(r); setError(null); } }).catch((e: Error) => { if (alive) setError(e.message); });
    load();
    const t = window.setInterval(load, 30_000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  const days = useMemo(() => {
    const byDay = new Map<string, { n: number; total: number }>();
    for (const d of data?.byDay ?? []) {
      // pg DATE arrives as a JS timestamp at Jakarta midnight (prev day 17:00Z): re-read it in WIB.
      const key = /^\d{4}-\d{2}-\d{2}$/.test(d.day) ? d.day : jakartaDay.format(new Date(d.day));
      byDay.set(key, { n: d.n, total: num(d.total) });
    }
    const keys = last30Days();
    const rows = keys.map((k) => ({ day: k, ...(byDay.get(k) ?? { n: 0, total: 0 }) }));
    const max = Math.max(1, ...rows.map((r) => r.total));
    return { rows, max, today: keys[keys.length - 1] };
  }, [data]);

  if (error && !data) return <main className="page"><div className="form-error">{error}</div></main>;
  if (!data) return <main className="page"><div className="center"><span className="spinner" />Memuat ringkasan…</div></main>;

  const recvEntries = CATEGORIES.map((c) => [c.code, data.receivable[c.code] ?? 0] as [CategoryCode, number]).filter(([, v]) => v > 0);
  const recvMax = Math.max(1, ...recvEntries.map(([, v]) => v));

  return (
    <main className="page">
      <div className="page-title">
        <div><h1>Penyaluran dana</h1><p>Penjualan yang dibayar dengan voucher subsidi dicairkan operator ke rekening {merchant?.bankAccount ?? "merchant"}.</p></div>
      </div>

      <div className="stats">
        <div className="card stat">
          <div className="lbl">Hari ini</div>
          <div className="val">{formatIDR(num(data.today.total))}</div>
          <div className="sub">{data.today.n} transaksi dibayar</div>
        </div>
        <div className="card stat">
          <div className="lbl">Sepanjang waktu</div>
          <div className="val">{formatIDR(num(data.all.total))}</div>
          <div className="sub">{data.all.n} transaksi dibayar</div>
        </div>
        <div className="card stat hero">
          <div className="lbl">Piutang ke operator</div>
          <div className="val">{formatIDR(data.receivableTotal)}</div>
          <div className="sub">{data.unsettled ? `${data.unsettled.n} transaksi belum dicairkan` : "Saldo di ledger yang belum dicairkan"}</div>
        </div>
      </div>

      <div className="settle-grid">
        <section className="card card-pad">
          <div className="section-h"><h2>Piutang per kategori</h2></div>
          {recvEntries.length === 0 ? (
            <div className="empty"><strong>Tidak ada piutang</strong>Semua penjualan sudah dicairkan.</div>
          ) : (
            <div className="recv-rows">
              {recvEntries.map(([c, v]) => (
                <div className="recv-row" key={c}>
                  <span className={`cat-chip cat-${c}`}>{CATEGORY_BY_CODE[c].icon} {CATEGORY_BY_CODE[c].short}</span>
                  <div className="bar"><i style={{ width: `${(v / recvMax) * 100}%` }} /></div>
                  <strong>{formatIDR(v)}</strong>
                </div>
              ))}
            </div>
          )}
          <div className="recv-total"><span className="muted">Total piutang</span><strong>{formatIDR(data.receivableTotal)}</strong></div>
        </section>

        <section className="card card-pad">
          <div className="section-h"><h2>Penjualan 30 hari</h2><span className="muted small">per hari, WIB</span></div>
          {days.rows.every((r) => r.total === 0) ? (
            <div className="bars-empty">Belum ada penjualan dalam 30 hari terakhir.</div>
          ) : (
            <div className="bars" role="img" aria-label="Grafik penjualan harian 30 hari">
              {days.rows.map((r, i) => (
                <div key={r.day} className={`bar-col${r.day === days.today ? " today" : ""}`}>
                  <span className="tip">{r.day.slice(8, 10)}/{r.day.slice(5, 7)} · {r.n} trx · {formatIDR(r.total)}</span>
                  <i style={{ height: `${Math.max(2, (r.total / days.max) * 100)}%` }} />
                  {(i % 7 === 0 || i === 29) && <span>{r.day.slice(8, 10)}/{r.day.slice(5, 7)}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <div className="section-h"><h2>Pencairan dari operator</h2><span className="muted small">{data.payouts.length} terakhir</span></div>
        {data.payouts.length === 0 ? (
          <div className="empty"><strong>Belum ada pencairan</strong>Operator mencairkan piutang secara berkala ke rekening merchant.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>ID</th><th>Tanggal</th><th className="r">Jumlah</th><th>Per kategori</th><th>Ref. bank</th><th>Bukti ledger</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{shortHash(p.id, 4)}</td>
                    <td>{fmtDate(p.createdAt)}</td>
                    <td className="r"><strong>{formatIDR(num(p.amount))}</strong></td>
                    <td>
                      <div className="row wrap" style={{ gap: 4 }}>
                        {Object.entries(p.byType ?? {}).map(([k, v]) => (
                          <span key={k} className={`cat-chip cat-${k}`} style={{ fontSize: 12 }}>{CATEGORY_BY_CODE[k as CategoryCode]?.short ?? k} <b>{formatIDR(num(v))}</b></span>
                        ))}
                      </div>
                    </td>
                    <td className="mono">{p.bankRef ?? "–"}</td>
                    <td>
                      {(p.txHashes ?? []).length === 0 ? "–" : (p.txHashes ?? []).map((h) => (
                        <button key={h} className="copy-btn mono" title={h} onClick={async () => { await copyText(h); toast.ok("Hash disalin"); }} style={{ marginRight: 4, marginBottom: 4 }}>{shortHash(h, 5)}</button>
                      ))}
                    </td>
                    <td><span className={`pill ${p.status === "paid" || p.status === "settled" ? "pill-paid" : "pill-pending"}`}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
