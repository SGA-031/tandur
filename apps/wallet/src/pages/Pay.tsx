import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { CATEGORY_BY_CODE, formatIDR } from "@tandur/shared";
import { api, cachedScan, dropScan, type PayResult, type ScanResult } from "../api";
import { merchantTypeLabel, useT } from "../i18n";
import { Countdown, Page, Sheet, TopBar, shortHash } from "../components/Shell";
import { PinPad } from "../components/PinPad";
import { ShieldIcon, StoreIcon } from "../components/Icons";

export default function Pay() {
  const { t, lang } = useT();
  const { invoiceId = "" } = useParams();
  const loc = useLocation();
  const state = (loc.state as ScanResult | null) ?? cachedScan(invoiceId);

  const [scan] = useState<ScanResult | null>(state && state.invoice?.id === invoiceId ? state : null);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState<PayResult | null>(null);

  useEffect(() => { if (scan) setExpired(new Date(scan.invoice.expiresAt).getTime() <= Date.now()); }, [scan]);
  const onExpire = useCallback(() => setExpired(true), []);

  const pay = async (pin: string) => {
    if (!scan) return;
    setBusy(true); setPinErr(null);
    try {
      const r = await api.pay(scan.invoice.id, pin);
      dropScan(scan.invoice.id);
      setSheet(false);
      setDone(r);
    } catch (e) {
      setPinErr((e as Error).message);
      setReset((k) => k + 1);
    } finally { setBusy(false); }
  };

  if (done) {
    const inv = done.invoice;
    return (
      <Page nav={false}>
        <div className="success">
          <div className="check" aria-hidden><svg viewBox="0 0 72 72"><path d="M18 38l12 12 24-28" /></svg></div>
          <h1 style={{ fontSize: 26 }}>{t("pay_success")}</h1>
          <div className="amt num">{formatIDR(inv.total)}</div>
          <div className="bold">{inv.merchant.name}</div>
          <div className="muted small">{inv.invoiceNo}</div>
          <span className="badge ok" style={{ marginTop: 8 }}><ShieldIcon width={18} height={18} /> {t("pay_ledger")} · <span className="mono">{shortHash(done.txHash)}</span></span>
        </div>
        <div className="stack">
          <Link to={`/invoice/${inv.id}`} className="btn btn-secondary">{t("pay_view")}</Link>
          <Link to="/" replace className="btn btn-primary">{t("pay_done")}</Link>
        </div>
      </Page>
    );
  }

  if (!scan) {
    return (
      <Page nav={false}>
        <TopBar title={t("pay_title")} back="/" />
        <div className="banner warn" role="alert">{t("pay_missing")}</div>
        <Link to="/scan" className="btn btn-primary">{t("pay_back_scan")}</Link>
      </Page>
    );
  }

  const inv = scan.invoice;
  const canPay = scan.canPay && !scan.frozen && !expired;

  return (
    <Page nav={false} className="has-cta">
      <TopBar title={t("pay_title")} back="/scan" />

      <section className="card">
        <div className="row">
          <div className="item-lead" style={{ width: 48, height: 48, borderRadius: 14, background: "var(--sawah-50)", display: "grid", placeItems: "center", flexShrink: 0 }}><StoreIcon /></div>
          <div className="grow">
            <div className="bold" style={{ fontSize: 18 }}>{inv.merchant.name}</div>
            <div className="muted small">{merchantTypeLabel(inv.merchant.type)} · {inv.merchant.city}</div>
          </div>
        </div>
        <div className="kv" style={{ marginTop: 8 }}><span className="k">{t("pay_invoice")}</span><span className="v mono small">{inv.invoiceNo}</span></div>
        <div className="kv"><span className="k">{t("pay_expires")}</span><span className="v"><Countdown until={inv.expiresAt} onExpire={onExpire} /></span></div>
      </section>

      {expired && <div className="banner critical" role="alert">{t("pay_expired")}</div>}
      {scan.frozen && <div className="banner critical" role="alert">{t("pay_frozen")}</div>}
      {!scan.canPay && !scan.frozen && <div className="banner critical" role="alert">{t("pay_cannot")}</div>}

      <section className="card">
        <div className="card-title">{t("pay_items")}</div>
        {inv.lines.map((l, i) => (
          <div className="line" key={`${l.sku}-${i}`}>
            <div className="n">{l.name}</div>
            <div className="lt num">{formatIDR(l.lineTotal)}</div>
            <div className="q">{l.qty} × {l.unit} · {formatIDR(l.unitPrice)}</div>
          </div>
        ))}
        <div className="total"><span className="bold">{t("pay_total")}</span><span className="v num">{formatIDR(inv.total)}</span></div>
      </section>

      <section className="card">
        <div className="card-title">{t("pay_coverage")}</div>
        {scan.coverage.map((c) => {
          const cat = CATEGORY_BY_CODE[c.category];
          return (
            <div key={c.category} className={`cov ${c.ok ? "ok" : "bad"}`}>
              <div className="ic" aria-hidden>{c.ok ? "✓" : "!"}</div>
              <div className="grow">
                <div className="bold">{cat?.icon} {lang === "en" ? cat?.en ?? c.label : c.label}</div>
                <div className="small muted">{t("pay_needed")} {formatIDR(c.needed)} · {t("pay_available")} {formatIDR(c.available)}</div>
                {!c.ok && <div className="short">{t("pay_short")} {formatIDR(c.needed - c.available)}</div>}
              </div>
            </div>
          );
        })}
      </section>

      <div className="cta no-nav">
        <div>
          <button className="btn btn-primary" disabled={!canPay} onClick={() => { setPinErr(null); setSheet(true); }}>
            🔒 {t("pay_btn")} · {formatIDR(inv.total)}
          </button>
        </div>
      </div>

      {sheet && (
        <Sheet onClose={() => { if (!busy) setSheet(false); }} title={t("pay_pin_title")}>
          <div className="center muted small" style={{ marginBottom: 8 }}>{formatIDR(inv.total)} → {inv.merchant.name}</div>
          <PinPad onComplete={pay} disabled={busy} error={pinErr} resetKey={reset} />
          {busy && <div className="banner info" style={{ marginTop: 12 }}>{t("pay_processing")}</div>}
          {!busy && <button type="button" className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setSheet(false)}>{t("cancel")}</button>}
        </Sheet>
      )}
    </Page>
  );
}
