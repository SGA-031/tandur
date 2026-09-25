import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, qs, type Farmer, type Merchant, type ChainEvent, type Alert } from "../api";
import type { InvoiceDTO } from "@tandur/shared";
import { useFetch, useDebounced } from "../lib/hooks";
import { Card, DataTable, Pager, StatusPill, ErrorBox, Loading, Filters, Field, useRegions, HashChip, EmptyState, SeverityBadge, CategoryTag, CheckRow, KindBadge } from "../components/ui";
import { num, idr, int, fmtDateTime, ruleLabel, EVENT_LABEL, INVOICE_STATUS_LABEL } from "../lib/format";
import { eventSummary } from "./Overview";

const LIMIT = 50;
type Row = InvoiceDTO & { province: string; regency: string };

export function Invoices() {
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [status, setStatus] = useState(""); const [province, setProvince] = useState(""); const [regency, setRegency] = useState(""); const [merchantId, setMerchantId] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const regions = useRegions();
  const nav = useNavigate();
  const merchants = useFetch(() => api.get<{ merchants: Merchant[] }>("/admin/merchants"), []);
  const { data, error, loading } = useFetch(() => api.get<{ total: number; page: number; invoices: Row[] }>(`/admin/invoices${qs({ q: dq, status, province, regency, merchantId, from, to, page, limit: LIMIT })}`), [dq, status, province, regency, merchantId, from, to, page]);
  const set = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };
  return (
    <div className="stack">
      <div className="page-head"><div><h2>Invoice</h2><div className="sub">Setiap invoice di-hash dan dicatat pada ledger saat dibayar{data ? ` · ${int(data.total)} invoice` : ""}</div></div></div>
      <Filters>
        <div className="field wide"><label>Cari</label><input className="input" placeholder="No. invoice atau hash" value={q} onChange={(e) => set(setQ)(e.target.value)} /></div>
        <Field label="Status"><select className="select" value={status} onChange={(e) => set(setStatus)(e.target.value)}><option value="">Semua</option>{Object.entries(INVOICE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Provinsi"><select className="select" value={province} onChange={(e) => { set(setProvince)(e.target.value); setRegency(""); }}><option value="">Semua</option>{regions.provinces.map((p) => <option key={p.province} value={p.province}>{p.province}</option>)}</select></Field>
        <Field label="Kabupaten/Kota"><select className="select" value={regency} onChange={(e) => set(setRegency)(e.target.value)}><option value="">Semua</option>{regions.regencies.filter((r) => !province || r.province === province).map((r) => <option key={`${r.province}-${r.regency}`} value={r.regency}>{r.regency}</option>)}</select></Field>
        <Field label="Merchant"><select className="select" value={merchantId} onChange={(e) => set(setMerchantId)(e.target.value)}><option value="">Semua</option>{(merchants.data?.merchants ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Dari"><input className="input" type="date" value={from} onChange={(e) => set(setFrom)(e.target.value)} /></Field>
        <Field label="Sampai"><input className="input" type="date" value={to} onChange={(e) => set(setTo)(e.target.value)} /></Field>
      </Filters>
      <ErrorBox error={error} />
      <Card flush className={loading && data ? "skeleton-hold" : ""}>
        {!data ? <Loading /> : (
          <>
            <DataTable rows={data.invoices} rowKey={(r) => r.id} onRow={(r) => nav(`/invoice/${r.id}`)} columns={[
              { key: "invoiceNo", label: "No. invoice", render: (r) => <Link className="link mono small" to={`/invoice/${r.id}`}>{r.invoiceNo}</Link> },
              { key: "date", label: "Waktu", render: (r) => fmtDateTime(r.paidAt ?? r.createdAt) },
              { key: "merchant", label: "Merchant", render: (r) => <>{r.merchant.name}<div className="muted">{r.regency}, {r.province}</div></> },
              { key: "farmer", label: "Petani", render: (r) => r.farmerId ? <Link className="link" to={`/petani/${r.farmerId}`} onClick={(e) => e.stopPropagation()}>{r.farmerName ?? r.farmerId}</Link> : <span className="muted">–</span> },
              { key: "cats", label: "Kategori", render: (r) => <span className="row" style={{ gap: 8 }}>{Object.keys(r.categoryTotals).map((c) => <CategoryTag key={c} code={c} short />)}</span> },
              { key: "total", label: "Total", align: "r", render: (r) => idr(r.total) },
              { key: "mode", label: "Mode", render: (r) => r.mode === "assisted" ? "Dibantu" : "Pindai" },
              { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
              { key: "tx", label: "Tx ledger", render: (r) => <HashChip value={r.txHash} /> },
            ]} />
            <Pager page={data.page} total={data.total} limit={LIMIT} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

type Detail = { invoice: InvoiceDTO; document: unknown | null; verification: { documentFound: boolean; documentIntact: boolean | null; recomputedHash: string | null; onChain: boolean; onChainAmount: number; amountMatches: boolean }; events: ChainEvent[]; alerts: Alert[]; farmer: Farmer | null };

export function InvoiceDetail() {
  const { id = "" } = useParams();
  const { data, error } = useFetch(() => api.get<Detail>(`/admin/invoices/${encodeURIComponent(id)}`), [id]);
  if (error && !data) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const inv = data.invoice, v = data.verification;
  const allOk = v.documentFound && v.documentIntact === true && v.onChain && v.amountMatches;
  const isPaid = inv.status === "paid";
  return (
    <div className="stack">
      <div className="page-head">
        <div><div className="small"><Link className="link" to="/invoice">Invoice</Link> / <span className="mono">{inv.invoiceNo}</span></div><h2>{inv.invoiceNo} <StatusPill status={inv.status} /></h2><div className="sub">Dibuat {fmtDateTime(inv.createdAt)}{inv.paidAt && <> · dibayar {fmtDateTime(inv.paidAt)}</>} · mode {inv.mode === "assisted" ? "dibantu kasir" : "pindai QR"}</div></div>
      </div>
      <ErrorBox error={error} />
      <div className={`banner ${!isPaid ? "info" : allOk ? "ok" : "bad"}`}>
        <span className="big">{!isPaid ? "Belum dibayar" : allOk ? "Terverifikasi" : "Perlu ditinjau"}</span>
        <span className="small" style={{ fontWeight: 500 }}>{!isPaid ? "Invoice ini belum dicatat pada ledger karena belum dibayar." : allOk ? "Dokumen utuh dan jumlahnya sama persis dengan yang tercatat pada ledger." : "Ada pemeriksaan yang tidak lolos; lihat panel verifikasi."}</span>
      </div>
      <div className="grid g-3">
        <Card className="span-2" title="Struk" sub={`${inv.lines.length} baris`} flush>
          <DataTable rows={inv.lines} rowKey={(l) => l.sku} tall columns={[
            { key: "name", label: "Produk", render: (l) => <>{l.name}<div className="muted mono">{l.sku}</div></> },
            { key: "category", label: "Kategori", render: (l) => <CategoryTag code={l.category} short /> },
            { key: "qty", label: "Jumlah", align: "r", render: (l) => `${int(l.qty)} ${l.unit}` },
            { key: "unitPrice", label: "Harga (≤ HET)", align: "r", render: (l) => idr(l.unitPrice) },
            { key: "lineTotal", label: "Subtotal", align: "r", render: (l) => idr(l.lineTotal) },
          ]} footer={["Total", "", "", "", idr(inv.total)]} />
          <div className="card-body">
            <div className="section-title">Total per kategori</div>
            <div className="row" style={{ gap: 18 }}>{Object.entries(inv.categoryTotals).map(([c, t]) => <span key={c} className="row" style={{ gap: 8 }}><CategoryTag code={c} /><b>{idr(t)}</b></span>)}</div>
          </div>
        </Card>
        <Card title="Verifikasi ledger" sub="Tiga-arah: dokumen, hash, dan peristiwa on-chain">
          <CheckRow ok={v.documentFound} label="Dokumen ditemukan" desc="Dokumen kanonik tersimpan di penyimpanan write-once operator" />
          <CheckRow ok={v.documentIntact} label="Dokumen utuh" desc={v.documentIntact === null ? "Tidak dapat diperiksa tanpa dokumen" : v.documentIntact ? "Hash dihitung ulang identik dengan hash tersimpan" : "Hash dihitung ulang BERBEDA dari yang tersimpan"} />
          <CheckRow ok={isPaid ? v.onChain : null} label="Tercatat pada ledger" desc={v.onChain ? `${data.events.filter((e) => e.name === "Spent").length || 1} peristiwa Pembelanjaan merujuk hash ini` : isPaid ? "Tidak ada peristiwa Pembelanjaan untuk hash ini" : "Belum dibayar"} />
          <CheckRow ok={isPaid ? v.amountMatches : null} label="Jumlah sesuai ledger" desc={isPaid ? `Ledger: ${idr(v.onChainAmount)} · invoice: ${idr(inv.total)}` : "Belum dibayar"} />
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>Hash invoice</dt><dd><HashChip value={inv.hash} head={10} tail={8} /></dd>
            <dt>Hash ulang</dt><dd>{v.recomputedHash ? <HashChip value={v.recomputedHash} head={10} tail={8} /> : "–"}</dd>
            <dt>Tx ledger</dt><dd><HashChip value={inv.txHash} head={10} tail={8} to={inv.txHash ? `/ledger?q=${inv.txHash}` : undefined} /></dd>
            <dt>Blok</dt><dd className="mono">{inv.blockNumber ?? "–"}</dd>
          </dl>
        </Card>
      </div>
      <div className="grid g-2">
        <Card title="Petani">
          {data.farmer ? (
            <dl className="kv">
              <dt>Nama</dt><dd><Link className="link" to={`/petani/${data.farmer.id}`}>{data.farmer.name}</Link> <StatusPill status={data.farmer.status} /></dd>
              <dt>ID</dt><dd className="mono">{data.farmer.id}</dd>
              <dt>Wilayah</dt><dd>{data.farmer.village}, {data.farmer.district}, {data.farmer.regency}, {data.farmer.province}</dd>
              <dt>Lahan</dt><dd>{num(data.farmer.landHa).toFixed(2)} ha · {data.farmer.commodity}</dd>
              <dt>Akun ledger</dt><dd><HashChip value={data.farmer.address} head={8} tail={6} /></dd>
            </dl>
          ) : <EmptyState title="Belum ada petani" desc="Identitas petani terikat saat pembayaran, bukan di dokumen." />}
        </Card>
        <Card title="Merchant">
          <dl className="kv">
            <dt>Nama</dt><dd><Link className="link" to={`/merchant/${inv.merchant.id}`}>{inv.merchant.name}</Link> <KindBadge kind={inv.merchant.type} /></dd>
            <dt>ID</dt><dd className="mono">{inv.merchant.id}</dd>
            <dt>Kota</dt><dd>{inv.merchant.city}</dd>
            <dt>Kedaluwarsa QR</dt><dd>{fmtDateTime(inv.expiresAt)}</dd>
          </dl>
        </Card>
      </div>
      <div className="grid g-2">
        <Card title="Peristiwa ledger" sub="Dalam transaksi yang sama" flush>
          <DataTable rows={data.events} rowKey={(e) => `${e.txHash}-${e.logIndex ?? e.name}`} columns={[
            { key: "name", label: "Peristiwa", render: (e) => <span className="evname">{EVENT_LABEL[e.name] ?? e.name}</span> },
            { key: "args", label: "Rincian", wrap: true, render: (e) => <span className="small">{eventSummary(e)}</span> },
            { key: "blockNumber", label: "Blok", align: "r", render: (e) => int(e.blockNumber) },
            { key: "blockTime", label: "Waktu", render: (e) => <span className="small">{fmtDateTime(e.blockTime)}</span> },
          ]} />
        </Card>
        <Card title="Peringatan">
          {data.alerts.length === 0 ? <EmptyState title="Tidak ada peringatan" /> : data.alerts.map((a) => (
            <div className="check" key={a.id}><SeverityBadge severity={a.severity} /><div><div className="lbl">{ruleLabel(a.rule)} <StatusPill status={a.status} /></div><div className="desc">{a.detail}</div></div></div>
          ))}
        </Card>
      </div>
      <Card title="Dokumen kanonik" sub="Bentuk persis yang di-hash (kunci terurut, tanpa spasi)">
        {data.document ? <details className="raw"><summary>Tampilkan dokumen mentah</summary><pre className="pre" style={{ marginTop: 10 }}>{JSON.stringify(data.document, null, 2)}</pre></details> : <EmptyState title="Dokumen tidak ditemukan" />}
      </Card>
    </div>
  );
}
