import { useState, type FormEvent } from "react";
import { CATEGORIES } from "@tandur/shared";
import { api, type VoucherType, type Allocation } from "../api";
import { useFetch } from "../lib/hooks";
import { Card, DataTable, ErrorBox, Loading, HashChip, Modal, CategoryTag, useRegions, toast, Field } from "../components/ui";
import { num, idr, int, fmtDate, fmtDateTime, catLabel } from "../lib/format";

export function Allocations() {
  const types = useFetch(() => api.get<{ types: VoucherType[] }>("/admin/voucher-types"), []);
  const allocs = useFetch(() => api.get<{ allocations: Allocation[] }>("/admin/allocations"), []);
  const regions = useRegions();
  const [typeModal, setTypeModal] = useState(false);
  const [allocModal, setAllocModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tf, setTf] = useState({ category: "PUPUK", season: "", validFrom: "", validUntil: "", perFarmerCap: "" });
  const [af, setAf] = useState({ title: "", typeId: "", mode: "flat" as "flat" | "ha", amount: "", province: "", regency: "" });
  const [typeResult, setTypeResult] = useState<{ typeId: number; txHash: string } | null>(null);
  const [allocResult, setAllocResult] = useState<{ id: string; farmers: number; total: number; txHashes: string[] } | null>(null);

  const submitType = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api.post<{ typeId: number; txHash: string }>("/admin/voucher-types", { category: tf.category, season: tf.season, validFrom: new Date(tf.validFrom).toISOString(), validUntil: new Date(tf.validUntil + "T23:59:59").toISOString(), perFarmerCap: Math.round(num(tf.perFarmerCap)) });
      setTypeResult(r); toast(`Jenis voucher #${r.typeId} dibuat`, "ok"); types.reload();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const submitAlloc = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { title: af.title, typeId: Number(af.typeId), province: af.province || undefined, regency: af.regency || undefined };
      if (af.mode === "flat") body.amountPerFarmer = Math.round(num(af.amount)); else body.amountPerHa = Math.round(num(af.amount));
      const r = await api.post<{ id: string; farmers: number; total: number; txHashes: string[] }>("/admin/allocations", body);
      setAllocResult(r); toast(`Alokasi ${r.id} diterbitkan ke ${int(r.farmers)} petani`, "ok"); allocs.reload(); types.reload();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const openType = () => { setErr(null); setTypeResult(null); setTypeModal(true); };
  const openAlloc = () => { setErr(null); setAllocResult(null); setAf((a) => ({ ...a, typeId: a.typeId || String(types.data?.types[0]?.typeId ?? "") })); setAllocModal(true); };
  const selType = types.data?.types.find((t) => String(t.typeId) === af.typeId);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Alokasi</h2><div className="sub">Jenis voucher per musim tanam dan penerbitan entitlement ke petani (dicatat di ledger per batch)</div></div>
        <div className="page-actions"><button className="btn" onClick={openType}>Jenis voucher baru</button><button className="btn primary" onClick={openAlloc} disabled={!types.data?.types.length}>Terbitkan alokasi</button></div>
      </div>
      <ErrorBox error={types.error ?? allocs.error} />
      <Card title="Jenis voucher" sub="Kategori, musim, masa berlaku, dan plafon per petani" flush>
        {!types.data ? <Loading /> : <DataTable rows={types.data.types} rowKey={(t) => t.typeId} tall columns={[
          { key: "typeId", label: "Tipe", render: (t) => <span className="mono">#{t.typeId}</span> },
          { key: "category", label: "Kategori", render: (t) => <CategoryTag code={t.category} /> },
          { key: "season", label: "Musim" },
          { key: "window", label: "Masa berlaku", render: (t) => `${fmtDate(t.validFrom)} – ${fmtDate(t.validUntil)}` },
          { key: "perFarmerCap", label: "Plafon/petani", align: "r", render: (t) => num(t.perFarmerCap) ? idr(t.perFarmerCap) : "Tanpa plafon" },
          { key: "issued", label: "Diterbitkan", align: "r", render: (t) => idr(t.issued), sort: (t) => num(t.issued) },
          { key: "spent", label: "Dibelanjakan", align: "r", render: (t) => idr(t.spent), sort: (t) => num(t.spent) },
          { key: "util", label: "Utilisasi", align: "r", render: (t) => num(t.issued) ? `${((num(t.spent) / num(t.issued)) * 100).toFixed(1)}%` : "–" },
          { key: "txHash", label: "Tx", render: (t) => <HashChip value={t.txHash} /> },
        ]} />}
      </Card>
      <Card title="Alokasi diterbitkan" sub="Setiap alokasi = satu atau lebih transaksi penerbitan batch (40 petani per batch)" flush>
        {!allocs.data ? <Loading /> : <DataTable rows={allocs.data.allocations} rowKey={(a) => a.id} tall columns={[
          { key: "id", label: "ID", render: (a) => <span className="mono small">{a.id}</span> },
          { key: "title", label: "Judul", wrap: true },
          { key: "type", label: "Jenis", render: (a) => <><CategoryTag code={a.category} short /> <span className="muted small">#{a.typeId} · {a.season}</span></> },
          { key: "farmerCount", label: "Petani", align: "r", render: (a) => int(a.farmerCount), sort: (a) => a.farmerCount },
          { key: "totalAmount", label: "Total", align: "r", render: (a) => idr(a.totalAmount), sort: (a) => num(a.totalAmount) },
          { key: "createdBy", label: "Oleh" },
          { key: "createdAt", label: "Waktu", render: (a) => fmtDateTime(a.createdAt) },
          { key: "tx", label: "Tx", render: (a) => <span className="tx-list">{a.txHashes.map((h) => <HashChip key={h} value={h} />)}</span> },
        ]} />}
      </Card>

      <Modal open={typeModal} title="Jenis voucher baru" onClose={() => setTypeModal(false)} footer={typeResult ? <button className="btn primary" onClick={() => setTypeModal(false)}>Selesai</button> : <><button className="btn" onClick={() => setTypeModal(false)}>Batal</button><button className="btn primary" form="type-form" type="submit" disabled={busy}>{busy ? "Mengirim ke ledger…" : "Buat"}</button></>}>
        {typeResult ? <div className="banner ok"><div>Jenis voucher <b>#{typeResult.typeId}</b> dibuat.<div className="small" style={{ marginTop: 6 }}>Tx: <HashChip value={typeResult.txHash} head={10} tail={8} /></div></div></div> : (
          <form id="type-form" onSubmit={submitType} className="form-grid">
            <Field label="Kategori"><select className="select" value={tf.category} onChange={(e) => setTf({ ...tf, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.id}</option>)}</select></Field>
            <Field label="Musim (mis. MT1 2026/27)"><input className="input" required minLength={3} maxLength={31} value={tf.season} onChange={(e) => setTf({ ...tf, season: e.target.value })} /></Field>
            <Field label="Berlaku dari"><input className="input" type="date" required value={tf.validFrom} onChange={(e) => setTf({ ...tf, validFrom: e.target.value })} /></Field>
            <Field label="Berlaku sampai"><input className="input" type="date" required value={tf.validUntil} onChange={(e) => setTf({ ...tf, validUntil: e.target.value })} /></Field>
            <div className="full"><Field label="Plafon per petani (Rp, 0 = tanpa plafon)"><input className="input" type="number" min={0} step={1} required value={tf.perFarmerCap} onChange={(e) => setTf({ ...tf, perFarmerCap: e.target.value })} /></Field></div>
            <div className="full"><ErrorBox error={err} /></div>
          </form>
        )}
      </Modal>

      <Modal open={allocModal} title="Terbitkan alokasi" onClose={() => setAllocModal(false)} footer={allocResult ? <button className="btn primary" onClick={() => setAllocModal(false)}>Selesai</button> : <><button className="btn" onClick={() => setAllocModal(false)}>Batal</button><button className="btn primary" form="alloc-form" type="submit" disabled={busy}>{busy ? "Menerbitkan di ledger…" : "Terbitkan"}</button></>}>
        {allocResult ? (
          <div className="banner ok"><div>Alokasi <b>{allocResult.id}</b> diterbitkan ke <b>{int(allocResult.farmers)}</b> petani, total <b>{idr(allocResult.total)}</b>.<div className="tx-list small" style={{ marginTop: 6 }}>{allocResult.txHashes.map((h) => <HashChip key={h} value={h} head={10} tail={8} />)}</div></div></div>
        ) : (
          <form id="alloc-form" onSubmit={submitAlloc} className="form-grid">
            <div className="full"><Field label="Judul"><input className="input" required minLength={3} placeholder="Mis. Subsidi pupuk MT1 Jawa Tengah" value={af.title} onChange={(e) => setAf({ ...af, title: e.target.value })} /></Field></div>
            <div className="full"><Field label="Jenis voucher"><select className="select" required value={af.typeId} onChange={(e) => setAf({ ...af, typeId: e.target.value })}>{(types.data?.types ?? []).map((t) => <option key={t.typeId} value={t.typeId}>#{t.typeId} · {catLabel(t.category)} · {t.season}{num(t.perFarmerCap) ? ` · plafon ${idr(t.perFarmerCap)}` : ""}</option>)}</select></Field></div>
            <Field label="Dasar perhitungan"><div className="seg"><button type="button" className={af.mode === "flat" ? "on" : ""} onClick={() => setAf({ ...af, mode: "flat" })}>Per petani</button><button type="button" className={af.mode === "ha" ? "on" : ""} onClick={() => setAf({ ...af, mode: "ha" })}>Per hektar</button></div></Field>
            <Field label={af.mode === "flat" ? "Jumlah per petani (Rp)" : "Jumlah per hektar (Rp)"}><input className="input" type="number" min={1} step={1} required value={af.amount} onChange={(e) => setAf({ ...af, amount: e.target.value })} /></Field>
            <Field label="Provinsi (opsional)"><select className="select" value={af.province} onChange={(e) => setAf({ ...af, province: e.target.value, regency: "" })}><option value="">Semua provinsi</option>{regions.provinces.map((p) => <option key={p.province} value={p.province}>{p.province} ({p.farmers} petani)</option>)}</select></Field>
            <Field label="Kabupaten/Kota (opsional)"><select className="select" value={af.regency} onChange={(e) => setAf({ ...af, regency: e.target.value })}><option value="">Semua</option>{regions.regencies.filter((r) => !af.province || r.province === af.province).map((r) => <option key={`${r.province}-${r.regency}`} value={r.regency}>{r.regency} ({r.farmers})</option>)}</select></Field>
            <div className="full small muted">Hanya petani berstatus aktif yang menerima. Jika jenis voucher memiliki plafon, jumlah dipotong hingga sisa plafon masing-masing petani.{selType && num(selType.perFarmerCap) > 0 && <> Plafon jenis ini: <b>{idr(selType.perFarmerCap)}</b>.</>}</div>
            <div className="full"><ErrorBox error={err} /></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
