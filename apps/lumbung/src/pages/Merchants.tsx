import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Merchant, type Alert, type Payout } from "../api";
import type { InvoiceDTO } from "@tandur/shared";
import { useFetch } from "../lib/hooks";
import { Card, DataTable, StatusPill, ErrorBox, Loading, Filters, Field, HashChip, EmptyState, SeverityBadge, CategoryTag, KindBadge, StatTile, toast } from "../components/ui";
import { ReasonModal } from "../components/ReasonModal";
import { TimeSeriesChart, BalanceBars } from "../charts/charts";
import { categoryColor, CATEGORY_ORDER } from "../charts/palette";
import { num, idr, idrCompact, int, catLabel, fmtDateTime, fmtDate, ruleLabel, dayKey, KIND_LABEL } from "../lib/format";

export function Merchants() {
  const [q, setQ] = useState(""); const [kind, setKind] = useState(""); const [status, setStatus] = useState(""); const [province, setProvince] = useState("");
  const nav = useNavigate();
  const { data, error } = useFetch(() => api.get<{ merchants: Merchant[] }>("/admin/merchants"), []);
  const provinces = useMemo(() => Array.from(new Set((data?.merchants ?? []).map((m) => m.province))).sort(), [data]);
  const rows = (data?.merchants ?? []).filter((m) => (!q || m.name.toLowerCase().includes(q.toLowerCase()) || m.id.toLowerCase().includes(q.toLowerCase())) && (!kind || m.kind === kind) && (!status || m.status === status) && (!province || m.province === province));
  const totRecv = rows.reduce((s, m) => s + num(m.receivable), 0), totSpent = rows.reduce((s, m) => s + num(m.spent), 0);
  return (
    <div className="stack">
      <div className="page-head"><div><h2>Merchant</h2><div className="sub">KDMP, kios, dan distributor penerima voucher{data ? ` · ${int(data.merchants.length)} merchant` : ""}</div></div></div>
      <Filters>
        <div className="field wide"><label>Cari</label><input className="input" placeholder="Nama atau ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Field label="Jenis"><select className="select" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Semua</option>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Provinsi"><select className="select" value={province} onChange={(e) => setProvince(e.target.value)}><option value="">Semua</option>{provinces.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
        <Field label="Status"><select className="select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Semua</option><option value="active">Aktif</option><option value="suspended">Ditangguhkan</option></select></Field>
      </Filters>
      <ErrorBox error={error} />
      <Card flush>
        {!data ? <Loading /> : (
          <DataTable rows={rows} rowKey={(r) => r.id} onRow={(r) => nav(`/merchant/${r.id}`)} tall defaultSort={{ key: "spent", dir: "desc" }} columns={[
            { key: "name", label: "Merchant", render: (r) => <><Link className="link" to={`/merchant/${r.id}`}>{r.name}</Link><div className="muted mono">{r.id}</div></>, sort: (r) => r.name },
            { key: "kind", label: "Jenis", render: (r) => <KindBadge kind={r.kind} />, sort: (r) => r.kind },
            { key: "loc", label: "Kabupaten / Provinsi", render: (r) => <>{r.regency}<div className="muted">{r.province}</div></>, sort: (r) => `${r.province} ${r.regency}` },
            { key: "invoices", label: "Invoice", align: "r", render: (r) => int(r.invoices), sort: (r) => num(r.invoices) },
            { key: "farmers", label: "Petani", align: "r", render: (r) => int(r.farmers), sort: (r) => num(r.farmers) },
            { key: "spent", label: "Belanja", align: "r", render: (r) => idr(r.spent), sort: (r) => num(r.spent) },
            { key: "receivable", label: "Piutang", align: "r", render: (r) => idr(r.receivable), sort: (r) => num(r.receivable) },
            { key: "openAlerts", label: "Peringatan", align: "r", render: (r) => num(r.openAlerts) > 0 ? <span className="pill warn">{r.openAlerts}</span> : <span className="muted">0</span>, sort: (r) => num(r.openAlerts) },
            { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
          ]} footer={["Total", "", "", int(rows.reduce((s, m) => s + num(m.invoices), 0)), "", idr(totSpent), idr(totRecv), "", ""]} />
        )}
      </Card>
    </div>
  );
}

type MerchantDetailT = { merchant: Merchant; receivable: Record<string, number>; invoices: InvoiceDTO[]; byDay: { day: string; invoices: number; total: string | number }[]; byProduct: { name: string; category: string; qty: number; total: string | number }[]; payouts: Payout[]; alerts: Alert[] };

export function MerchantDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data, error, reload } = useFetch(() => api.get<MerchantDetailT>(`/admin/merchants/${encodeURIComponent(id)}`), [id]);
  const [modal, setModal] = useState(false);
  if (error && !data) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const m = data.merchant;
  const active = m.status === "active";
  const recvTotal = Object.values(data.receivable).reduce((s, v) => s + v, 0);
  const paid = data.invoices.filter((i) => i.status === "paid");
  const spentTotal = paid.reduce((s, i) => s + i.total, 0);
  const paidOut = data.payouts.reduce((s, p) => s + num(p.amount), 0);
  const recvByCat = CATEGORY_ORDER.filter((c) => data.receivable[c]).map((c) => ({ key: c, label: catLabel(c), issued: recvTotal, spent: data.receivable[c], color: categoryColor(c) }));
  return (
    <div className="stack">
      <div className="page-head">
        <div><div className="small"><Link className="link" to="/merchant">Merchant</Link> / <span className="mono">{m.id}</span></div><h2>{m.name} <KindBadge kind={m.kind} /> <StatusPill status={m.status} /></h2><div className="sub">{m.address ? "" : ""}{m.city}, {m.district}, {m.regency}, {m.province}</div></div>
        <div className="page-actions"><button className={`btn ${active ? "danger" : "primary"}`} onClick={() => setModal(true)}>{active ? "Tangguhkan" : "Aktifkan"}</button></div>
      </div>
      <ErrorBox error={error} />
      <div className="grid g-4">
        <StatTile label="Belanja diterima" value={idrCompact(spentTotal)} hint={`${int(paid.length)} invoice dibayar (200 terakhir)`} />
        <StatTile label="Piutang (belum di-settle)" value={idrCompact(recvTotal)} hint="Saldo voucher di akun merchant pada ledger" />
        <StatTile label="Sudah dibayar (settlement)" value={idrCompact(paidOut)} hint={`${int(data.payouts.length)} settlement`} />
        <StatTile label="Peringatan" value={int(data.alerts.filter((a) => a.status === "open").length)} hint={`${int(data.alerts.length)} total, termasuk yang ditutup`} />
      </div>
      <div className="grid g-3">
        <Card title="Profil & rekening">
          <dl className="kv">
            <dt>ID</dt><dd className="mono">{m.id}</dd>
            <dt>Jenis</dt><dd>{KIND_LABEL[m.kind] ?? m.kind}</dd>
            <dt>Kode wilayah</dt><dd className="mono">{m.regionCode}</dd>
            <dt>Rekening bank</dt><dd className="mono">{m.bankAccount ?? "–"}</dd>
            <dt>Akun ledger</dt><dd><HashChip value={m.address} head={8} tail={6} /></dd>
            <dt>Status ledger</dt><dd>{m.frozenOnChain ? <span className="pill bad">Dibekukan di ledger</span> : <span className="pill ok">Aktif di ledger</span>}</dd>
            <dt>Koordinat</dt><dd className="mono">{m.lat != null && m.lng != null ? `${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}` : "–"}</dd>
            <dt>Login POS</dt><dd className="mono">{m.username}</dd>
            <dt>Terdaftar</dt><dd>{fmtDate(m.createdAt)}</dd>
          </dl>
        </Card>
        <Card className="span-2" title="Belanja harian" sub="Invoice dibayar per hari (WIB)">
          {data.byDay.length === 0 ? <EmptyState /> : <TimeSeriesChart data={data.byDay.map((r) => ({ day: dayKey(r.day), total: num(r.total), invoices: r.invoices }))} height={220} />}
        </Card>
      </div>
      <div className="grid g-2">
        <Card title="Piutang per kategori" sub="Voucher diterima namun belum ditebus">
          {recvByCat.length === 0 ? <EmptyState title="Tidak ada piutang" /> : <BalanceBars rows={recvByCat} />}
        </Card>
        <Card title="Per produk" flush>
          <DataTable rows={data.byProduct} rowKey={(r) => r.name + r.category} maxHeight={280} columns={[
            { key: "name", label: "Produk", render: (r) => <>{r.name}<div className="muted"><CategoryTag code={r.category} short /></div></> },
            { key: "qty", label: "Jumlah", align: "r", render: (r) => int(r.qty), sort: (r) => num(r.qty) },
            { key: "total", label: "Nilai", align: "r", render: (r) => idr(r.total), sort: (r) => num(r.total) },
          ]} />
        </Card>
      </div>
      <Card title="Settlement (penyaluran dana)" flush>
        <DataTable rows={data.payouts} rowKey={(p) => p.id} columns={[
          { key: "id", label: "ID", render: (p) => <span className="mono small">{p.id}</span> }, { key: "createdAt", label: "Tanggal", render: (p) => fmtDateTime(p.createdAt) },
          { key: "amount", label: "Jumlah", align: "r", render: (p) => idr(p.amount) },
          { key: "byType", label: "Per kategori", render: (p) => <span className="row" style={{ gap: 8 }}>{Object.entries(p.byType).map(([c, v]) => <span key={c} className="cat"><i style={{ background: categoryColor(c) }} />{idrCompact(v)}</span>)}</span> },
          { key: "bankRef", label: "Ref. bank", render: (p) => <span className="mono small">{p.bankRef ?? "–"}</span> },
          { key: "tx", label: "Tx ledger", render: (p) => <span className="tx-list">{p.txHashes.map((h) => <HashChip key={h} value={h} />)}</span> },
          { key: "status", label: "Status", render: (p) => <StatusPill status={p.status} /> },
        ]} />
      </Card>
      <Card title="Invoice" sub="200 terakhir" flush>
        <DataTable rows={data.invoices} rowKey={(i) => i.id} onRow={(i) => nav(`/invoice/${i.id}`)} columns={[
          { key: "invoiceNo", label: "No. invoice", render: (i) => <Link className="link mono small" to={`/invoice/${i.id}`}>{i.invoiceNo}</Link> },
          { key: "date", label: "Waktu", render: (i) => fmtDateTime(i.paidAt ?? i.createdAt) },
          { key: "farmer", label: "Petani", render: (i) => i.farmerId ? <Link className="link" to={`/petani/${i.farmerId}`} onClick={(e) => e.stopPropagation()}>{i.farmerName ?? i.farmerId}</Link> : <span className="muted">–</span> },
          { key: "total", label: "Total", align: "r", render: (i) => idr(i.total) },
          { key: "mode", label: "Mode", render: (i) => i.mode === "assisted" ? "Dibantu" : "Pindai" },
          { key: "status", label: "Status", render: (i) => <StatusPill status={i.status} /> },
          { key: "tx", label: "Tx", render: (i) => <HashChip value={i.txHash} /> },
        ]} />
      </Card>
      <Card title="Peringatan">
        {data.alerts.length === 0 ? <EmptyState title="Tidak ada peringatan" /> : data.alerts.map((a) => (
          <div className="check" key={a.id}><SeverityBadge severity={a.severity} /><div><div className="lbl">{ruleLabel(a.rule)} <StatusPill status={a.status} /></div><div className="desc">{a.detail}</div></div></div>
        ))}
      </Card>
      <ReasonModal open={modal} onClose={() => { setModal(false); reload(); }} title={active ? "Tangguhkan merchant" : "Aktifkan merchant"} danger={active} confirmLabel={active ? "Tangguhkan" : "Aktifkan"}
        desc={active ? `${m.name} akan dinonaktifkan pada registri ledger; POS tidak dapat menerima voucher.` : `${m.name} akan diaktifkan kembali pada registri ledger.`}
        onConfirm={async (reason) => { const r = await api.post<{ ok: boolean; txHash: string }>(`/admin/merchants/${encodeURIComponent(m.id)}/status`, { active: !active, reason }); toast(active ? "Merchant ditangguhkan" : "Merchant diaktifkan", "ok"); return r; }} />
    </div>
  );
}
