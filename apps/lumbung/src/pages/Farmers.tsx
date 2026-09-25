import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, qs, type Farmer, type ChainEvent, type Alert } from "../api";
import type { InvoiceDTO, BalanceDTO } from "@tandur/shared";
import { useFetch, useDebounced } from "../lib/hooks";
import { Card, DataTable, Pager, StatusPill, ErrorBox, Loading, Filters, Field, useRegions, HashChip, EmptyState, SeverityBadge, CategoryTag, toast } from "../components/ui";
import { ReasonModal } from "../components/ReasonModal";
import { BalanceBars } from "../charts/charts";
import { categoryColor } from "../charts/palette";
import { num, idr, int, catLabel, fmtDateTime, fmtDate, ruleLabel, EVENT_LABEL } from "../lib/format";
import { eventSummary } from "./Overview";

const LIMIT = 50;

export function Farmers() {
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [province, setProvince] = useState(""); const [regency, setRegency] = useState(""); const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const regions = useRegions();
  const nav = useNavigate();
  const { data, error, loading } = useFetch(() => api.get<{ total: number; page: number; farmers: Farmer[] }>(`/admin/farmers${qs({ q: dq, province, regency, status, page, limit: LIMIT })}`), [dq, province, regency, status, page]);
  const reset = () => setPage(1);
  return (
    <div className="stack">
      <div className="page-head"><div><h2>Petani</h2><div className="sub">Penerima entitlement voucher subsidi{data ? ` · ${int(data.total)} petani` : ""}</div></div></div>
      <Filters>
        <div className="field wide"><label>Cari</label><input className="input" placeholder="Nama, ID, atau desa" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} /></div>
        <Field label="Provinsi"><select className="select" value={province} onChange={(e) => { setProvince(e.target.value); setRegency(""); reset(); }}><option value="">Semua</option>{regions.provinces.map((p) => <option key={p.province} value={p.province}>{p.province} ({p.farmers})</option>)}</select></Field>
        <Field label="Kabupaten/Kota"><select className="select" value={regency} onChange={(e) => { setRegency(e.target.value); reset(); }}><option value="">Semua</option>{regions.regencies.filter((r) => !province || r.province === province).map((r) => <option key={`${r.province}-${r.regency}`} value={r.regency}>{r.regency}</option>)}</select></Field>
        <Field label="Status"><select className="select" value={status} onChange={(e) => { setStatus(e.target.value); reset(); }}><option value="">Semua</option><option value="active">Aktif</option><option value="frozen">Dibekukan</option></select></Field>
      </Filters>
      <ErrorBox error={error} />
      <Card flush className={loading && data ? "skeleton-hold" : ""}>
        {!data ? <Loading /> : (
          <>
            <DataTable rows={data.farmers} rowKey={(r) => r.id} onRow={(r) => nav(`/petani/${r.id}`)} columns={[
              { key: "id", label: "ID", render: (r) => <span className="mono small">{r.id}</span> },
              { key: "name", label: "Nama", render: (r) => <Link className="link" to={`/petani/${r.id}`}>{r.name}</Link>, sort: (r) => r.name },
              { key: "loc", label: "Desa / Kecamatan / Kabupaten", render: (r) => <>{r.village}<div className="muted">{r.district}, {r.regency}</div></> },
              { key: "landHa", label: "Lahan (ha)", align: "r", render: (r) => num(r.landHa).toFixed(2), sort: (r) => num(r.landHa) },
              { key: "commodity", label: "Komoditas", render: (r) => r.commodity },
              { key: "issued", label: "Tersalurkan", align: "r", render: (r) => idr(r.issued), sort: (r) => num(r.issued) },
              { key: "spent", label: "Terpakai", align: "r", render: (r) => idr(r.spent), sort: (r) => num(r.spent) },
              { key: "invoices", label: "Invoice", align: "r", render: (r) => int(r.invoices), sort: (r) => num(r.invoices) },
              { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
            ]} />
            <Pager page={data.page} total={data.total} limit={LIMIT} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

type FarmerDetailT = { farmer: Farmer; balances: BalanceDTO[]; invoices: InvoiceDTO[]; events: ChainEvent[]; alerts: (Alert & { subject_kind?: string; created_at?: string })[]; notifications: { id: number; body: string; createdAt: string }[] };

export function FarmerDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data, error, reload } = useFetch(() => api.get<FarmerDetailT>(`/admin/farmers/${encodeURIComponent(id)}`), [id]);
  const [modal, setModal] = useState(false);
  if (error && !data) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const f = data.farmer;
  const frozen = f.status === "frozen";
  const totalIssued = data.balances.reduce((s, b) => s + b.issued, 0), totalSpent = data.balances.reduce((s, b) => s + b.spent, 0);
  return (
    <div className="stack">
      <div className="page-head">
        <div><div className="small"><Link className="link" to="/petani">Petani</Link> / <span className="mono">{f.id}</span></div><h2>{f.name} <StatusPill status={f.status} /></h2><div className="sub">{f.village}, {f.district}, {f.regency}, {f.province}</div></div>
        <div className="page-actions"><button className={`btn ${frozen ? "primary" : "danger"}`} onClick={() => setModal(true)}>{frozen ? "Buka blokir" : "Bekukan akun"}</button></div>
      </div>
      <ErrorBox error={error} />
      <div className="grid g-3">
        <Card title="Profil">
          <dl className="kv">
            <dt>ID</dt><dd className="mono">{f.id}</dd>
            <dt>NIK</dt><dd className="mono">{f.nikMasked}</dd>
            <dt>Telepon</dt><dd>{f.phone ?? "–"}</dd>
            <dt>Lahan</dt><dd>{num(f.landHa).toFixed(2)} ha · {f.commodity}</dd>
            <dt>Kode wilayah</dt><dd className="mono">{f.regionCode}</dd>
            <dt>Akun ledger</dt><dd><HashChip value={f.address} head={8} tail={6} /></dd>
            <dt>ID pseudonim</dt><dd><HashChip value={f.pseudoId} head={8} tail={6} /></dd>
            <dt>Status ledger</dt><dd>{f.frozenOnChain ? <span className="pill bad">Dibekukan di ledger</span> : <span className="pill ok">Aktif di ledger</span>}{f.frozenOnChain !== frozen && <span className="pill warn" style={{ marginLeft: 6 }}>Tidak sinkron dengan basis data</span>}</dd>
            <dt>Terdaftar</dt><dd>{fmtDate(f.createdAt)}</dd>
          </dl>
        </Card>
        <Card className="span-2" title="Saldo entitlement per kategori" sub={`Terpakai ${idr(totalSpent)} dari ${idr(totalIssued)} tersalurkan`}>
          {data.balances.length === 0 ? <EmptyState title="Belum ada alokasi" /> : (
            <>
              <BalanceBars rows={data.balances.map((b) => ({ key: `${b.typeId}`, label: `${catLabel(b.category)} · ${b.season}`, issued: b.issued, spent: b.spent, color: categoryColor(b.category) }))} />
              <div style={{ marginTop: 14 }}>
                <DataTable rows={data.balances} rowKey={(b) => b.typeId} columns={[
                  { key: "category", label: "Kategori", render: (b) => <CategoryTag code={b.category} /> }, { key: "season", label: "Musim" },
                  { key: "issued", label: "Tersalurkan", align: "r", render: (b) => idr(b.issued) }, { key: "spent", label: "Terpakai", align: "r", render: (b) => idr(b.spent) }, { key: "balance", label: "Sisa", align: "r", render: (b) => idr(b.balance) }, { key: "validUntil", label: "Berlaku s.d.", render: (b) => fmtDate(b.validUntil) },
                ]} />
              </div>
            </>
          )}
        </Card>
      </div>
      <Card title="Riwayat pembelian" sub={`${int(data.invoices.length)} invoice dibayar`} flush>
        <DataTable rows={data.invoices} rowKey={(i) => i.id} onRow={(i) => nav(`/invoice/${i.id}`)} columns={[
          { key: "invoiceNo", label: "No. invoice", render: (i) => <Link className="link mono small" to={`/invoice/${i.id}`}>{i.invoiceNo}</Link> },
          { key: "paidAt", label: "Dibayar", render: (i) => fmtDateTime(i.paidAt ?? i.createdAt) },
          { key: "merchant", label: "Merchant", render: (i) => <Link className="link" to={`/merchant/${i.merchant.id}`} onClick={(e) => e.stopPropagation()}>{i.merchant.name}</Link> },
          { key: "cats", label: "Kategori", render: (i) => <span className="row" style={{ gap: 8 }}>{Object.keys(i.categoryTotals).map((c) => <CategoryTag key={c} code={c} short />)}</span> },
          { key: "total", label: "Total", align: "r", render: (i) => idr(i.total) },
          { key: "tx", label: "Tx ledger", render: (i) => <HashChip value={i.txHash} /> },
        ]} />
      </Card>
      <div className="grid g-2">
        <Card title="Peristiwa ledger" sub="Semua peristiwa untuk akun ini" flush>
          <DataTable rows={data.events.map((e, i) => ({ ...e, _k: i }))} rowKey={(e) => `${e.txHash}-${e._k}`} columns={[
            { key: "blockNumber", label: "Blok", align: "r", render: (e) => int(e.blockNumber) },
            { key: "name", label: "Peristiwa", render: (e) => <span className="evname">{EVENT_LABEL[e.name] ?? e.name}</span> },
            { key: "args", label: "Rincian", wrap: true, render: (e) => <span className="small">{eventSummary(e)}</span> },
            { key: "blockTime", label: "Waktu", render: (e) => <span className="small">{fmtDateTime(e.blockTime)}</span> },
            { key: "txHash", label: "Tx", render: (e) => <HashChip value={e.txHash} /> },
          ]} />
        </Card>
        <div className="stack">
          <Card title="Peringatan" sub={`${data.alerts.length} terkait petani atau invoicenya`}>
            {data.alerts.length === 0 ? <EmptyState title="Tidak ada peringatan" /> : data.alerts.map((a) => (
              <div className="check" key={a.id}><SeverityBadge severity={a.severity} /><div><div className="lbl">{ruleLabel(a.rule)} <StatusPill status={a.status} /></div><div className="desc">{a.detail}</div></div></div>
            ))}
          </Card>
          <Card title="Notifikasi (log SMS)" sub="20 pesan terakhir">
            {data.notifications.length === 0 ? <EmptyState title="Belum ada pesan" /> : data.notifications.map((n) => (
              <div className="check" key={n.id}><div><div className="small">{n.body}</div><div className="desc">{fmtDateTime(n.createdAt)}</div></div></div>
            ))}
          </Card>
        </div>
      </div>
      <ReasonModal open={modal} onClose={() => { setModal(false); reload(); }} title={frozen ? "Buka blokir akun" : "Bekukan akun petani"} danger={!frozen} confirmLabel={frozen ? "Buka blokir" : "Bekukan"}
        desc={frozen ? `Akun ${f.name} akan diaktifkan kembali di ledger sehingga voucher bisa dibelanjakan.` : `Akun ${f.name} akan dibekukan di ledger; seluruh transaksi voucher akan ditolak sampai dibuka kembali.`}
        onConfirm={async (reason) => { const r = await api.post<{ ok: boolean; txHash: string }>(`/admin/farmers/${encodeURIComponent(f.id)}/freeze`, { frozen: !frozen, reason }); toast(frozen ? "Akun dibuka kembali" : "Akun dibekukan", "ok"); return r; }} />
    </div>
  );
}
