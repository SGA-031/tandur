import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { api, cacheScan } from "../api";
import { useT } from "../i18n";
import { Page, TopBar } from "../components/Shell";
import { CameraIcon } from "../components/Icons";
import { useToast } from "../components/Toast";

const READER_ID = "qr-reader";

export default function Scan() {
  const { t } = useT();
  const nav = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<"camera" | "paste">("camera");
  const [camErr, setCamErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scanner = useRef<Html5Qrcode | null>(null);
  const handled = useRef(false);

  const submit = useCallback(async (qr: string) => {
    const code = qr.trim();
    if (!code || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.scan(code);
      cacheScan(r);
      nav(`/pay/${r.invoice.id}`, { state: r });
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      toast(msg, "error");
      handled.current = false;
    } finally { setBusy(false); }
  }, [busy, nav, toast]);

  useEffect(() => {
    if (mode !== "camera") return;
    let cancelled = false;
    const el = document.getElementById(READER_ID);
    if (!el) return;
    const h = new Html5Qrcode(READER_ID, { verbose: false });
    scanner.current = h;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-media");
        await h.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 250, aspectRatio: 1 },
          (decoded) => {
            if (handled.current) return;
            handled.current = true;
            submit(decoded);
          },
          () => { /* per-frame miss: ignore */ },
        );
        if (cancelled) { await h.stop().catch(() => {}); }
      } catch {
        if (!cancelled) { setCamErr(t("scan_no_camera")); setMode("paste"); }
      }
    };
    start();
    return () => {
      cancelled = true;
      const s = scanner.current;
      scanner.current = null;
      if (s) {
        const finish = () => { try { s.clear(); } catch { /* ignore */ } };
        if (s.isScanning) s.stop().then(finish).catch(finish); else finish();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <Page nav={false}>
      <TopBar title={t("scan_title")} back="/" />
      {mode === "camera" ? (
        <>
          <p className="muted center" style={{ margin: 0 }}>{t("scan_hint")}</p>
          <div className="scanner">
            <div id={READER_ID} />
            <div className="corner tl" /><div className="corner tr" /><div className="corner bl" /><div className="corner br" />
            <div className="scanline" />
          </div>
          {busy && <div className="banner info">{t("scan_checking")}</div>}
          {err && <div className="banner critical" role="alert">{err}</div>}
          <button type="button" className="btn btn-secondary" onClick={() => setMode("paste")}>{t("scan_use_paste")}</button>
        </>
      ) : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
          {camErr && <div className="banner warn">{camErr}</div>}
          <div className="field">
            <label htmlFor="qr">{t("scan_paste_label")}</label>
            <textarea id="qr" className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("scan_paste_placeholder")} autoFocus />
          </div>
          {err && <div className="banner critical" role="alert">{err}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy || text.trim().length < 20}>{busy ? t("scan_checking") : t("scan_paste_btn")}</button>
          {!camErr && (
            <button type="button" className="btn btn-secondary" onClick={() => { setErr(null); setMode("camera"); }}>
              <CameraIcon /> {t("scan_use_camera")}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => nav("/")}>{t("scan_cancel")}</button>
        </form>
      )}
    </Page>
  );
}
