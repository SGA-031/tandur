import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatIDR, type InvoiceDTO } from "@tandur/shared";
import { api, copyText, fmtDateTime, MODE_LABEL, shortHash } from "../api";
import { useAuth } from "../components/Auth";
import { useToast } from "../components/Toast";
import { QRCanvas } from "../components/QRCanvas";
import { StatusPill } from "../components/StatusPill";
import { PinPad } from "../components/PinPad";
import { CategoryBreakdown, InvoiceLines } from "../components/InvoiceLines";
import { Receipt } from "../components/Receipt";

const POLL_MS = 1500;

function useCountdown(expiresAt?: string) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const end = new Date(expiresAt).getTime();
    const tick = () => setLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    tick();
    const t = window.setInterval(tick, 500);
    return () => window.clearInterval(t);
  }, [expiresAt]);
  return left;
}

export function InvoicePage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { merchant } = useAuth();
  const [invoice, setInvoice] = useState<InvoiceDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assist, setAssist] = useState(false);
  const [nik, setNik] = useState("");
  const [pin, setPin] = useState("");
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const qrRef = useRef<string | undefined>(undefined);
  const announcedRef = useRef(false);
  const sawPendingRef = useRef(false);

  const load = useCallback(async () => {
    const r = await api.getInvoice(id);
    // Keep the QR string once received: the server omits it for non-pending invoices.
    if (r.invoice.qr) qrRef.current = r.invoice.qr;
    if (r.invoice.status === "pending") sawPendingRef.current = true;
    setInvoice(r.invoice);
    return r.invoice;
  }, [id]);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const loop = async () => {
      try {
        const inv = await load();
        if (!alive) return;
        if (inv.status === "pending") timer = window.setTimeout(loop, POLL_MS);
      } catch (e) {
        if (!alive) return;
        setError((e as Error).message);
        timer = window.setTimeout(loop, POLL_MS * 3);
      }
    };
    loop();
    return () => { alive = false; if (timer) window.clearTimeout(timer); };
  }, [load]);

  useEffect(() => {
    if (invoice?.status === "paid" && sawPendingRef.current && !announcedRef.current) {
      announcedRef.current = true;
      toast.ok(`Pembayaran ${formatIDR(invoice.total)} diterima`);
    }
  }, [invoice, toast]);

  const left = useCountdown(invoice?.expiresAt);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  const copyQr = async () => {
    const q = invoice?.qr ?? qrRef.current;
    if (!q) return toast.err("Kode QR belum tersedia");
    if (await copyText(q)) toast.ok("Kode QR disalin ke papan klip");
    else toast.err("Gagal menyalin. Buka \"Tampilkan teks QR\" dan salin manual.");
  };

  const cancel = async () => {
    if (!invoice || !window.confirm("Batalkan invoice ini? QR tidak bisa dipakai lagi.")) return;
    setCancelling(true);
    try {
      const r = await api.cancelInvoice(invoice.id);
      setInvoice(r.invoice);
      toast.show("Invoice dibatalkan");
    } catch (e) { toast.err((e as Error).message); } finally { setCancelling(false); }
  };

  const submitAssisted = async () => {
    if (!invoice) return;
    if (!/^\d{16}$/.test(nik)) return toast.err("NIK harus 16 digit angka");
    if (!/^\d{6}$/.test(pin)) return toast.err("PIN harus 6 digit");
    setPaying(true);
    try {
      const r = await api.assistedPay(invoice.id, nik, pin);
      setInvoice(r.invoice);
      setAssist(false); setPin(""); setNik("");
    } catch (e) {
      toast.err((e as Error).message);
      setPin("");
    } finally { setPaying(false); }
  };

  if (error && !invoice) {
    return (
      <main className="page">
        <div className="card card-pad stack">
          <div className="form-error">{error}</div>
          <Link className="btn" to="/">Kembali ke kasir</Link>
        </div>
      </main>
    );
  }
  if (!invoice) return <main className="page"><div className="center"><span className="spinner" />Memuat invoice…</div></main>;

  const pending = invoice.status === "pending";
  const paid = invoice.status === "paid";
  const qr = invoice.qr ?? qrRef.current;

  return (
    <main className="page">
      <div className="page-title">
        <div>
          <h1>{paid ? "Pembayaran berhasil" : pending ? "Menunggu pembayaran" : "Invoice"}</h1>
          <p className="inv-no">{invoice.invoiceNo}</p>
        </div>
        <StatusPill status={invoice.status} large />
      </div>

      <div className="pay">
        <section className="card qr-card">
          {paid ? (
            <div className="success">
              <svg className="check" viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="46" />
                <path d="M30 52l13 13 27-30" />
              </svg>
              <h2>{formatIDR(invoice.total)}</h2>
              {invoice.farmerName && <div className="farmer">{invoice.farmerName}</div>}
              <dl className="kv">
                <dt>Metode</dt><dd>{invoice.mode ? MODE_LABEL[invoice.mode] ?? invoice.mode : "–"}</dd>
                <dt>Waktu</dt><dd>{fmtDateTime(invoice.paidAt)}</dd>
                <dt>Bukti ledger</dt>
                <dd>
                  <span className="mono" title={invoice.txHash}>{shortHash(invoice.txHash, 8)}</span>
                  {invoice.txHash && <button className="copy-btn" onClick={async () => { await copyText(invoice.txHash!); toast.ok("Hash disalin"); }}>Salin</button>}
                </dd>
                <dt>Blok</dt><dd className="mono">{invoice.blockNumber ?? "–"}</dd>
              </dl>
              <div className="pay-actions" style={{ marginTop: 16 }}>
                <button className="btn btn-primary btn-lg full" onClick={() => nav("/")}>Transaksi baru</button>
                <button className="btn full" onClick={() => window.print()}>Cetak struk</button>
              </div>
            </div>
          ) : (
            <>
              {qr ? <QRCanvas value={qr} size={380} dim={!pending} /> : <div className="skeleton" style={{ width: 300, height: 300 }} />}
              {pending ? (
                <>
                  <div className={`countdown${left < 120 ? " urgent" : ""}`}>{mm}:{ss}</div>
                  <div className="countdown-label">Minta petani memindai QR dengan aplikasi Tandur, lalu memasukkan PIN.</div>
                  {qr && (
                    <details className="qr-raw">
                      <summary>Tampilkan teks QR</summary>
                      <textarea readOnly value={qr} rows={4} onFocus={(e) => e.currentTarget.select()} />
                    </details>
                  )}
                </>
              ) : (
                <div className="muted">Invoice ini {invoice.status === "expired" ? "sudah kedaluwarsa" : invoice.status === "cancelled" ? "dibatalkan" : "gagal"}. Buat transaksi baru dari kasir.</div>
              )}
              <div className="pay-actions">
                {pending ? (
                  <>
                    <button className="btn" onClick={copyQr}>Salin kode QR</button>
                    <button className={`btn ${assist ? "btn-primary" : "btn-gold"}`} onClick={() => setAssist((a) => !a)}>{assist ? "Tutup Mode Bantuan" : "Mode Bantuan (KTP)"}</button>
                    <button className="btn btn-danger full" onClick={cancel} disabled={cancelling}>{cancelling ? <span className="spinner" /> : "Batalkan"}</button>
                  </>
                ) : (
                  <button className="btn btn-primary btn-lg full" onClick={() => nav("/")}>Transaksi baru</button>
                )}
              </div>
            </>
          )}
        </section>

        <section className="pay-summary">
          {pending && assist && (
            <div className="card card-pad assist">
              <h3>Mode Bantuan: petani tanpa ponsel</h3>
              <div className="steps"><b>1.</b> Kasir memasukkan NIK dari KTP <b>2.</b> Petani sendiri yang menekan PIN</div>
              <div className="field">
                <label htmlFor="nik">NIK (16 digit)</label>
                <input
                  id="nik" className="input input-mono" inputMode="numeric" pattern="\d*" maxLength={16} placeholder="33XXXXXXXXXXXXXX"
                  value={nik} onChange={(e) => setNik(e.target.value.replace(/\D/g, "").slice(0, 16))} disabled={paying} autoFocus
                />
              </div>
              <div className="privacy-note">Serahkan tablet ke petani untuk memasukkan PIN. Kasir tidak boleh melihat atau meminta PIN.</div>
              <PinPad value={pin} onChange={setPin} disabled={paying || nik.length !== 16} />
              <button className="btn btn-primary btn-lg btn-block" onClick={submitAssisted} disabled={paying || nik.length !== 16 || pin.length !== 6}>
                {paying ? <span className="spinner light" /> : `Bayar ${formatIDR(invoice.total)}`}
              </button>
            </div>
          )}

          <div className="card card-pad stack">
            <div className="row between wrap">
              <div>
                <div className="muted small">Total tagihan</div>
                <div className="big-total">{formatIDR(invoice.total)}</div>
              </div>
              <div className="muted small" style={{ textAlign: "right" }}>
                Dibuat {fmtDateTime(invoice.createdAt)}<br />
                Berlaku s/d {fmtDateTime(invoice.expiresAt)}
              </div>
            </div>
            <CategoryBreakdown totals={invoice.categoryTotals} />
          </div>
          <div className="card card-pad">
            <InvoiceLines invoice={invoice} />
          </div>
          <div className="muted small mono" style={{ wordBreak: "break-all" }}>Hash invoice {invoice.hash}</div>
        </section>
      </div>

      <Receipt invoice={invoice} merchant={merchant} />
    </main>
  );
}
