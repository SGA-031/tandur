import { useState, type FormEvent } from "react";
import { CATEGORIES } from "@tandur/shared";
import { api, type Product } from "../api";
import { useFetch } from "../lib/hooks";
import { Card, DataTable, ErrorBox, Loading, Modal, CategoryTag, Filters, Field, toast } from "../components/ui";
import { num, idr, int } from "../lib/format";

const empty = { sku: "", name: "", brand: "", category: "PUPUK", unit: "", hetPrice: "", active: true };

export function Catalog() {
  const { data, error, reload } = useFetch(() => api.get<{ products: Product[] }>("/admin/products"), []);
  const [q, setQ] = useState(""); const [cat, setCat] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState<string | null>(null);
  const rows = (data?.products ?? []).filter((p) => (!cat || p.category === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.toLowerCase().includes(q.toLowerCase()) || (p.brand ?? "").toLowerCase().includes(q.toLowerCase())));

  const upsert = async (p: Product) => {
    await api.post("/admin/products", { sku: p.sku, name: p.name, brand: p.brand ?? undefined, category: p.category, unit: p.unit, hetPrice: Math.round(num(p.hetPrice)), active: p.active });
  };
  const saveHet = async (p: Product) => {
    const v = Math.round(num(draft)); if (v <= 0) { toast("HET harus lebih dari 0", "bad"); return; }
    setBusy(true);
    try { await upsert({ ...p, hetPrice: v }); toast(`HET ${p.name} → ${idr(v)}`, "ok"); setEditing(null); reload(); } catch (e) { toast((e as Error).message, "bad"); } finally { setBusy(false); }
  };
  const toggleActive = async (p: Product) => {
    setBusy(true);
    try { await upsert({ ...p, active: !p.active }); toast(`${p.name} ${p.active ? "dinonaktifkan" : "diaktifkan"}`, "ok"); reload(); } catch (e) { toast((e as Error).message, "bad"); } finally { setBusy(false); }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await upsert({ ...form, brand: form.brand || null, hetPrice: num(form.hetPrice) }); toast(`Produk ${form.sku} disimpan`, "ok"); setModal(false); setForm(empty); reload(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Katalog & HET</h2><div className="sub">Harga Eceran Tertinggi: harga jual di POS tidak boleh melampaui HET{data ? ` · ${int(data.products.length)} produk` : ""}</div></div>
        <div className="page-actions"><button className="btn primary" onClick={() => { setErr(null); setForm(empty); setModal(true); }}>Produk baru</button></div>
      </div>
      <Filters>
        <div className="field wide"><label>Cari</label><input className="input" placeholder="Nama, SKU, atau merek" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Field label="Kategori"><select className="select" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Semua</option>{CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.id}</option>)}</select></Field>
      </Filters>
      <ErrorBox error={error} />
      <Card flush>
        {!data ? <Loading /> : <DataTable rows={rows} rowKey={(p) => p.sku} tall columns={[
          { key: "sku", label: "SKU", render: (p) => <span className="mono small">{p.sku}</span>, sort: (p) => p.sku },
          { key: "name", label: "Produk", render: (p) => <>{p.name}{p.brand && <div className="muted">{p.brand}</div>}</>, sort: (p) => p.name },
          { key: "category", label: "Kategori", render: (p) => <CategoryTag code={p.category} short />, sort: (p) => p.category },
          { key: "unit", label: "Satuan" },
          { key: "hetPrice", label: "HET", align: "r", sort: (p) => num(p.hetPrice), render: (p) => editing === p.sku ? (
            <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
              <input className="input" type="number" min={1} step={100} style={{ width: 140, minHeight: 32, padding: "4px 8px" }} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveHet(p); if (e.key === "Escape") setEditing(null); }} />
              <button className="btn sm primary" disabled={busy} onClick={() => saveHet(p)}>Simpan</button>
              <button className="btn sm ghost" onClick={() => setEditing(null)}>Batal</button>
            </span>
          ) : <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}><b>{idr(p.hetPrice)}</b><button className="btn sm ghost" onClick={() => { setEditing(p.sku); setDraft(String(num(p.hetPrice))); }}>Ubah HET</button></span> },
          { key: "active", label: "Status", render: (p) => <button className={`pill ${p.active ? "ok" : "neutral"}`} style={{ border: "none", cursor: "pointer" }} disabled={busy} onClick={() => toggleActive(p)} title="Klik untuk mengubah">{p.active ? "Aktif" : "Nonaktif"}</button> },
        ]} />}
      </Card>
      <Modal open={modal} title="Produk baru" onClose={() => setModal(false)} footer={<><button className="btn" onClick={() => setModal(false)}>Batal</button><button className="btn primary" form="prod-form" type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button></>}>
        <form id="prod-form" onSubmit={submit} className="form-grid">
          <Field label="SKU"><input className="input mono" required minLength={2} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} /></Field>
          <Field label="Kategori"><select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.id}</option>)}</select></Field>
          <div className="full"><Field label="Nama produk"><input className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field></div>
          <Field label="Merek (opsional)"><input className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
          <Field label="Satuan (mis. karung 50kg)"><input className="input" required value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
          <div className="full"><Field label="HET (Rp)"><input className="input" type="number" min={1} step={100} required value={form.hetPrice} onChange={(e) => setForm({ ...form, hetPrice: e.target.value })} /></Field></div>
          <div className="full small muted">SKU yang sudah ada akan diperbarui (upsert). Perubahan dicatat pada jejak audit.</div>
          <div className="full"><ErrorBox error={err} /></div>
        </form>
      </Modal>
    </div>
  );
}
