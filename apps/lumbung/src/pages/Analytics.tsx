import { useMemo, useState } from "react";
import { api, qs } from "../api";
import { useFetch } from "../lib/hooks";
import { Card, DataTable, EmptyState, ErrorBox, Filters, Field, useRegions, CategoryTag } from "../components/ui";
import { TimeSeriesChart, HorizontalBars } from "../charts/charts";
import { categoryColor } from "../charts/palette";
import { num, idr, int, catLabel, dayKey, fmtDate, toCSV, downloadText, KIND_LABEL } from "../lib/format";

type Row = { key: string; total: string | number; invoices: number; farmers?: number; category?: string; unit?: string; qty?: number };
const DIMS: { by: string; label: string }[] = [
  { by: "day", label: "Per hari" }, { by: "week", label: "Per minggu" }, { by: "category", label: "Kategori" }, { by: "province", label: "Provinsi" }, { by: "regency", label: "Kabupaten" },
  { by: "merchant", label: "Merchant" }, { by: "product", label: "Produk" }, { by: "commodity", label: "Komoditas" }, { by: "kind", label: "Jenis merchant" }, { by: "mode", label: "Mode bayar" },
];
const PRESETS = [{ k: "30", label: "30 hari" }, { k: "90", label: "90 hari" }, { k: "all", label: "Semua" }, { k: "custom", label: "Kustom" }];
const MODE_LABEL: Record<string, string> = { scan: "Pindai QR", assisted: "Dibantu kasir" };

export function Analytics() {
  const [by, setBy] = useState("day");
  const [preset, setPreset] = useState("all");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [province, setProvince] = useState(""); const [regency, setRegency] = useState("");
  const regions = useRegions();
  const range = useMemo(() => {
    if (preset === "custom") return { from, to };
    if (preset === "all") return { from: "", to: "" };
    const d = new Date(Date.now() - Number(preset) * 864e5); return { from: d.toISOString().slice(0, 10), to: "" };
  }, [preset, from, to]);
  const { data, error, loading } = useFetch(() => api.get<{ by: string; rows: Row[] }>(`/admin/spend${qs({ by, from: range.from, to: range.to, province, regency })}`), [by, range.from, range.to, province, regency]);
  const rows = data?.rows ?? [];
  const total = rows.reduce((s, r) => s + num(r.total), 0);
  const invoices = rows.reduce((s, r) => s + num(r.invoices), 0);
  const isTime = by === "day" || by === "week";
  const keyLabel = (r: Row) => by === "category" ? catLabel(r.key) : by === "kind" ? (KIND_LABEL[r.key] ?? r.key) : by === "mode" ? (MODE_LABEL[r.key] ?? r.key) : isTime ? fmtDate(r.key) : r.key;

  const download = () => {
    const cols = [{ key: "key", label: DIMS.find((d) => d.by === by)?.label ?? by }, ...(by === "product" ? [{ key: "category", label: "Kategori" }, { key: "unit", label: "Satuan" }, { key: "qty", label: "Jumlah" }] : []), { key: "total", label: "Total (Rp)" }, { key: "invoices", label: "Invoice" }, ...(rows.some((r) => r.farmers !== undefined) ? [{ key: "farmers", label: "Petani" }] : [])];
    downloadText(`pengeluaran-${by}${province ? `-${province}` : ""}.csv`, toCSV(rows.map((r) => ({ ...r, key: keyLabel(r), total: num(r.total) })), cols));
  };

  const chart = rows.length === 0 ? <EmptyState desc="Tidak ada invoice dibayar pada rentang ini." /> : isTime
    ? <TimeSeriesChart data={rows.map((r) => ({ day: dayKey(r.key), total: num(r.total), invoices: r.invoices }))} height={300} fading={loading} />
    : <HorizontalBars rows={rows.slice(0, 25).map((r) => ({ key: r.key, label: keyLabel(r), value: num(r.total), count: r.invoices, color: by === "category" ? categoryColor(r.key) : by === "product" && r.category ? categoryColor(r.category) : undefined }))} byCategory={by === "category"} fading={loading} />;

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Pengeluaran</h2><div className="sub">Belanja voucher subsidi menurut dimensi, wilayah, dan waktu</div></div>
        <div className="page-actions"><button className="btn" onClick={download} disabled={rows.length === 0}>Unduh CSV</button></div>
      </div>
      <Filters>
        <Field label="Rentang waktu"><div className="seg">{PRESETS.map((p) => <button key={p.k} className={preset === p.k ? "on" : ""} onClick={() => setPreset(p.k)}>{p.label}</button>)}</div></Field>
        {preset === "custom" && <><Field label="Dari"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="Sampai"><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></>}
        <Field label="Provinsi"><select className="select" value={province} onChange={(e) => { setProvince(e.target.value); setRegency(""); }}><option value="">Semua provinsi</option>{regions.provinces.map((p) => <option key={p.province} value={p.province}>{p.province}</option>)}</select></Field>
        <Field label="Kabupaten/Kota"><select className="select" value={regency} onChange={(e) => setRegency(e.target.value)}><option value="">Semua</option>{regions.regencies.filter((r) => !province || r.province === province).map((r) => <option key={`${r.province}-${r.regency}`} value={r.regency}>{r.regency}</option>)}</select></Field>
        <Field label="Dimensi"><select className="select" value={by} onChange={(e) => setBy(e.target.value)}>{DIMS.map((d) => <option key={d.by} value={d.by}>{d.label}</option>)}</select></Field>
      </Filters>
      <ErrorBox error={error} />
      <Card title={`Pengeluaran ${DIMS.find((d) => d.by === by)?.label.toLowerCase()}`} sub={`${idr(total)} · ${int(invoices)} invoice${by !== "category" && by !== "product" ? "" : " (invoice multi-kategori dihitung per kategori)"}`}>
        {chart}
      </Card>
      <Card title="Tabel" flush>
        <DataTable rows={rows} rowKey={(r) => r.key + (r.category ?? "")} tall defaultSort={isTime ? undefined : { key: "total", dir: "desc" }} columns={[
          { key: "key", label: DIMS.find((d) => d.by === by)?.label ?? by, render: (r) => by === "category" ? <CategoryTag code={r.key} /> : keyLabel(r), sort: (r) => r.key },
          ...(by === "product" ? [{ key: "category", label: "Kategori", render: (r: Row) => <CategoryTag code={r.category ?? ""} short /> }, { key: "qty", label: "Jumlah", align: "r" as const, render: (r: Row) => `${int(r.qty)} ${r.unit ?? ""}`, sort: (r: Row) => num(r.qty) }] : []),
          { key: "total", label: "Total", align: "r", render: (r) => idr(r.total), sort: (r) => num(r.total) },
          { key: "share", label: "Porsi", align: "r", render: (r) => total ? `${((num(r.total) / total) * 100).toFixed(1)}%` : "–", sort: (r) => num(r.total) },
          { key: "invoices", label: "Invoice", align: "r", render: (r) => int(r.invoices), sort: (r) => num(r.invoices) },
          ...(rows.some((r) => r.farmers !== undefined) ? [{ key: "farmers", label: "Petani", align: "r" as const, render: (r: Row) => int(r.farmers), sort: (r: Row) => num(r.farmers) }] : []),
        ]} footer={["Total", ...(by === "product" ? ["", ""] : []), idr(total), "100%", int(invoices), ...(rows.some((r) => r.farmers !== undefined) ? [""] : [])]} />
      </Card>
    </div>
  );
}
