import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CATEGORIES, CATEGORY_BY_CODE, formatIDR, type CategoryCode } from "@tandur/shared";
import { api, type CatalogProduct } from "../api";
import { useToast } from "../components/Toast";

type CartMap = Record<string, number>; // sku -> qty
const CART_KEY = "tandur.pos.cart";

function loadCart(): CartMap {
  try { return JSON.parse(localStorage.getItem(CART_KEY) ?? "{}") as CartMap; } catch { return {}; }
}

export function KasirPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [cat, setCat] = useState<CategoryCode | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartMap>(loadCart);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    api.catalog().then((r) => { if (alive) setProducts(r.products); }).catch((e: Error) => { if (alive) setLoadErr(e.message); });
    return () => { alive = false; };
  }, []);

  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* ignore */ } }, [cart]);

  const bySku = useMemo(() => new Map((products ?? []).map((p) => [p.sku, p])), [products]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: products?.length ?? 0 };
    for (const p of products ?? []) c[p.category] = (c[p.category] ?? 0) + 1;
    return c;
  }, [products]);

  const visible = useMemo(() => {
    const qn = query.trim().toLowerCase();
    return (products ?? []).filter((p) =>
      (cat === "ALL" || p.category === cat) &&
      (!qn || p.name.toLowerCase().includes(qn) || (p.brand ?? "").toLowerCase().includes(qn) || p.sku.toLowerCase().includes(qn)),
    );
  }, [products, cat, query]);

  const lines = useMemo(() =>
    Object.entries(cart)
      .map(([sku, qty]) => ({ p: bySku.get(sku), qty }))
      .filter((x): x is { p: CatalogProduct; qty: number } => !!x.p && x.qty > 0)
      .map(({ p, qty }) => ({ p, qty, total: p.hetPrice * qty })),
  [cart, bySku]);

  const catTotals = useMemo(() => {
    const t: Partial<Record<CategoryCode, number>> = {};
    for (const l of lines) t[l.p.category] = (t[l.p.category] ?? 0) + l.total;
    return t;
  }, [lines]);
  const grand = lines.reduce((a, l) => a + l.total, 0);
  const itemCount = lines.reduce((a, l) => a + l.qty, 0);

  const setQty = (sku: string, qty: number) => {
    setCart((c) => {
      const n = { ...c };
      if (qty <= 0) delete n[sku]; else n[sku] = Math.min(500, qty);
      return n;
    });
  };
  const clear = () => { setCart({}); setSheetOpen(false); };

  const createInvoice = async () => {
    if (!lines.length) return;
    setCreating(true);
    try {
      const r = await api.createInvoice(lines.map((l) => ({ sku: l.p.sku, qty: l.qty })));
      setCart({});
      setSheetOpen(false);
      nav(`/invoice/${r.invoice.id}`);
    } catch (e) {
      toast.err((e as Error).message);
    } finally { setCreating(false); }
  };

  const cartPanel = (
    <aside className={`card cart-panel${sheetOpen ? " open" : ""}`} aria-label="Keranjang">
      <div className="cart-head">
        <h2>Keranjang <span className="muted small">({itemCount} barang)</span></h2>
        <div className="row">
          {lines.length > 0 && <button className="btn btn-sm btn-ghost" onClick={clear}>Kosongkan</button>}
          <button className="btn btn-sm btn-ghost cart-close" onClick={() => setSheetOpen(false)} style={{ display: sheetOpen ? undefined : "none" }}>Tutup</button>
        </div>
      </div>
      <div className="cart-lines">
        {lines.length === 0 ? (
          <div className="empty"><strong>Keranjang kosong</strong>Pilih barang dari katalog untuk mulai transaksi.</div>
        ) : lines.map((l) => (
          <div className="cart-line" key={l.p.sku}>
            <div>
              <div className="cl-name">{l.p.name}</div>
              <div className="cl-meta">{formatIDR(l.p.hetPrice)} × {l.qty} {l.p.unit}</div>
            </div>
            <div className="cl-total">{formatIDR(l.total)}</div>
            <div className="stepper stepper-sm">
              <button onClick={() => setQty(l.p.sku, l.qty - 1)} aria-label="Kurangi" className={l.qty === 1 ? "rm" : ""}>{l.qty === 1 ? "×" : "−"}</button>
              <span className="q">{l.qty}</span>
              <button onClick={() => setQty(l.p.sku, l.qty + 1)} aria-label="Tambah">+</button>
            </div>
          </div>
        ))}
      </div>
      <div className="cart-foot">
        {Object.keys(catTotals).length > 0 && (
          <div className="cart-cats">
            {(Object.entries(catTotals) as [CategoryCode, number][]).map(([c, v]) => (
              <span key={c} className={`cat-chip cat-${c}`}>{CATEGORY_BY_CODE[c].short} <b>{formatIDR(v)}</b></span>
            ))}
          </div>
        )}
        <div className="total-row"><span>Total</span><strong>{formatIDR(grand)}</strong></div>
        <div className="cart-actions">
          <button className="btn btn-primary btn-lg" disabled={!lines.length || creating} onClick={createInvoice}>
            {creating ? <span className="spinner light" /> : "Buat QR pembayaran"}
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <main className="page kasir-page">
      <div className="kasir">
        <section>
          <div className="catalog-toolbar">
            <div className="row wrap">
              <div className="search">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                <input className="input" placeholder="Cari nama, merek, atau SKU…" value={query} onChange={(e) => setQuery(e.target.value)} inputMode="search" />
              </div>
              {query && <button className="btn btn-ghost" onClick={() => setQuery("")}>Bersihkan</button>}
            </div>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={cat === "ALL"} className={`tab${cat === "ALL" ? " active" : ""}`} onClick={() => setCat("ALL")}>Semua<span className="cnt">{counts.ALL ?? 0}</span></button>
              {CATEGORIES.map((c) => (
                <button key={c.code} role="tab" aria-selected={cat === c.code} className={`tab${cat === c.code ? " active" : ""}`} onClick={() => setCat(c.code)}>
                  {c.icon} {c.short}<span className="cnt">{counts[c.code] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          {loadErr ? (
            <div className="card card-pad"><div className="form-error">{loadErr}</div><button className="btn" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>Muat ulang</button></div>
          ) : !products ? (
            <div className="products">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ height: 150 }} />)}</div>
          ) : visible.length === 0 ? (
            <div className="card empty"><strong>Tidak ada barang</strong>Coba kata kunci atau kategori lain.</div>
          ) : (
            <div className="products">
              {visible.map((p) => {
                const qty = cart[p.sku] ?? 0;
                return (
                  <article key={p.sku} className={`card product${qty ? " in-cart" : ""}`}>
                    <div className="p-head">
                      <div>
                        <div className="p-name">{p.name}</div>
                        <div className="p-meta">{[p.brand, CATEGORY_BY_CODE[p.category]?.short].filter(Boolean).join(" · ")}</div>
                      </div>
                    </div>
                    <div className="p-price">
                      <div>
                        <div className="p-het">HET</div>
                        <div className="p-amount">{formatIDR(p.hetPrice)}</div>
                        <div className="p-unit">per {p.unit}</div>
                      </div>
                      {qty === 0 ? (
                        <button className="add-btn" onClick={() => setQty(p.sku, 1)} aria-label={`Tambah ${p.name}`}>+</button>
                      ) : (
                        <div className="stepper">
                          <button onClick={() => setQty(p.sku, qty - 1)} aria-label="Kurangi" className={qty === 1 ? "rm" : ""}>{qty === 1 ? "×" : "−"}</button>
                          <span className="q">{qty}</span>
                          <button onClick={() => setQty(p.sku, qty + 1)} aria-label="Tambah">+</button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {cartPanel}
      </div>

      {sheetOpen && <div className="cart-sheet-backdrop" onClick={() => setSheetOpen(false)} />}
      <div className="cart-toggle-bar">
        <div className="ct-sum">
          <small>{itemCount} barang</small>
          <strong>{formatIDR(grand)}</strong>
        </div>
        <button className="btn btn-gold" onClick={() => setSheetOpen(true)}>Lihat keranjang</button>
      </div>
    </main>
  );
}
