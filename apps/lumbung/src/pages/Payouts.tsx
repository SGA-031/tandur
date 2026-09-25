import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type Payout } from "../api";
import { useFetch } from "../lib/hooks";
import { Card, DataTable, ErrorBox, Loading, HashChip, StatusPill, Modal, StatTile, toast } from "../components/ui";
import { categoryColor } from "../charts/palette";
import { num, idr, idrCompact, int, fmtDateTime } from "../lib/format";

export function Payouts() {
  const { data, error, reload } = useFetch(() => api.get<{ payouts: Payout[] }>("/admin/payouts"), []);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Payout[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try { const r = await api.post<{ payouts: Payout[] }>("/admin/payouts/run"); setResult(r.payouts); toast(`Settlement selesai · ${r.payouts.length} merchant`, "ok"); reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const rows = data?.payouts ?? [];
  const total = rows.reduce((s, p) => s + num(p.amount), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayTotal = rows.filter((p) => p.createdAt.slice(0, 10) === today).reduce((s, p) => s + num(p.amount), 0);
  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Penyaluran dana</h2><div className="sub">Settlement T+1: voucher di akun merchant ditebus (dibakar) pada ledger, lalu dana fiat ditransfer ke rekening merchant</div></div>
        <div className="page-actions"><button className="btn gold" onClick={() => { setResult(null); setErr(null); setConfirm(true); }}>Jalankan settlement T+1</button></div>
      </div>
      <ErrorBox error={error} />
      <div className="grid g-3">
        <StatTile label="Total disalurkan" value={idrCompact(total)} hint={`${int(rows.length)} settlement (200 terakhir)`} />
        <StatTile label="Disalurkan hari ini" value={idrCompact(todayTotal)} />
        <StatTile label="Merchant menerima" value={int(new Set(rows.map((p) => p.merchantId)).size)} />
      </div>
      <Card flush>
        {!data ? <Loading /> : (
          <DataTable rows={rows} rowKey={(p) => p.id} tall columns={[
            { key: "id", label: "ID", render: (p) => <span className="mono small">{p.id}</span> },
            { key: "createdAt", label: "Tanggal", render: (p) => fmtDateTime(p.createdAt), sort: (p) => p.createdAt },
            { key: "merchant", label: "Merchant", render: (p) => <><Link className="link" to={`/merchant/${p.merchantId}`}>{p.merchantName ?? p.merchantId}</Link><div className="muted mono">{p.bankAccount ?? "–"}</div></>, sort: (p) => p.merchantName ?? "" },
            { key: "amount", label: "Jumlah", align: "r", render: (p) => idr(p.amount), sort: (p) => num(p.amount) },
            { key: "byType", label: "Per kategori", render: (p) => <span className="row" style={{ gap: 8 }}>{Object.entries(p.byType).map(([c, v]) => <span key={c} className="cat" title={c}><i style={{ background: categoryColor(c) }} />{idrCompact(v)}</span>)}</span> },
            { key: "bankRef", label: "Ref. bank", render: (p) => <span className="mono small">{p.bankRef ?? "–"}</span> },
            { key: "tx", label: "Tx penebusan", render: (p) => <span className="tx-list">{p.txHashes.map((h) => <HashChip key={h} value={h} />)}</span> },
            { key: "status", label: "Status", render: (p) => <StatusPill status={p.status} /> },
          ]} />
        )}
      </Card>
      <Modal open={confirm} title="Jalankan settlement T+1" onClose={() => setConfirm(false)} footer={result ? <button className="btn primary" onClick={() => setConfirm(false)}>Tutup</button> : <><button className="btn" onClick={() => setConfirm(false)}>Batal</button><button className="btn gold" disabled={busy} onClick={run}>{busy ? "Memproses…" : "Ya, jalankan"}</button></>}>
        {!result ? (
          <>
            <p style={{ margin: 0 }}>Seluruh saldo voucher di akun merchant aktif akan <b>ditebus pada ledger</b> (peristiwa Penebusan) dan instruksi transfer bank dibuat untuk masing-masing merchant. Tindakan ini tidak dapat dibatalkan.</p>
            <ErrorBox error={err} />
          </>
        ) : result.length === 0 ? <div className="banner info">Tidak ada saldo merchant yang perlu di-settle.</div> : (
          <div className="stack" style={{ gap: 8 }}>
            <div className="banner ok"><span className="big">{result.length} merchant</span><span className="small">total {idr(result.reduce((s, p) => s + num(p.amount), 0))}</span></div>
            {result.map((p) => <div className="check" key={p.id}><div><div className="lbl">{p.merchantName} · {idr(p.amount)}</div><div className="desc mono">{p.id} · {p.bankRef}</div><div className="tx-list" style={{ marginTop: 4 }}>{p.txHashes.map((h) => <HashChip key={h} value={h} head={10} tail={6} />)}</div></div></div>)}
          </div>
        )}
      </Modal>
    </div>
  );
}
