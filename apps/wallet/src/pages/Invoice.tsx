import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CATEGORY_BY_CODE, formatIDR, type CategoryCode } from "@tandur/shared";
import { api, type InvoiceDetail, type VerifyResult } from "../api";
import { fmtDate, merchantTypeLabel, useT } from "../i18n";
import { Page, Skeleton, TopBar, shortHash } from "../components/Shell";
import { PrintIcon, ShareIcon, ShieldIcon } from "../components/Icons";
import { useToast } from "../components/Toast";

export default function Invoice() {
  const { t, lang } = useT();
  const toast = useToast();
  const { id = "" } = useParams();
  const [d, setD] = useState<InvoiceDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [v, setV] = useState<VerifyResult | null | "loading">("loading");

  useEffect(() => {
    api.invoice(id).then(setD).catch((e) => setErr((e as Error).message));
  }, [id]);
  useEffect(() => {
    if (!d?.invoice.hash) return;
    setV("loading");
    api.verify(d.invoice.hash).then(setV).catch(() => setV(null));
  }, [d?.invoice.hash]);

  const inv = d?.invoice;
  const verified = v !== "loading" && v !== null && v.onChain && v.documentIntact === true;

  const shareText = () => {
    if (!inv) return "";
    return [
      `TANDUR · ${t("inv_title")}`,
      `${inv.invoiceNo} · ${fmtDate(inv.paidAt ?? inv.createdAt, { time: true })}`,
      `${inv.merchant.name}, ${inv.merchant.city}`,
      ...inv.lines.map((l) => `- ${l.name} ${l.qty}×${l.unit} = ${formatIDR(l.lineTotal)}`),
      `${t("inv_total")}: ${formatIDR(inv.total)}`,
      `${t("inv_hash")}: ${inv.hash}`,
      inv.txHash ? `${t("inv_tx")}: ${inv.txHash} (${t("inv_block")} ${inv.blockNumber ?? "-"})` : "",
      verified ? `✔ ${t("inv_verified")}` : "",
    ].filter(Boolean).join("\n");
  };
  const share = async () => {
    const text = shareText();
    try {
      if (navigator.share) { await navigator.share({ title: `Tandur ${inv?.invoiceNo}`, text }); return; }
      await navigator.clipboard.writeText(text);
      toast(t("inv_copied"), "ok");
    } catch { /* user cancelled */ }
  };

  return (
    <Page>
      <TopBar title={t("inv_title")} back={true} />
      {err && <div className="banner critical" role="alert">{err}</div>}
      {!inv && !err && <div className="card"><Skeleton h={28} w="60%" /><Skeleton h={20} style={{ marginTop: 10 }} /><Skeleton h={120} style={{ marginTop: 16 }} /></div>}
      {inv && (
        <>
          <section className="card">
            <div className="center" style={{ paddingBottom: 8 }}>
              <div className="bold" style={{ fontSize: 20 }}>{inv.merchant.name}</div>
              <div className="muted small">{merchantTypeLabel(inv.merchant.type)} · {inv.merchant.city}</div>
            </div>
            <div className="kv"><span className="k">{t("pay_invoice")}</span><span className="v mono small">{inv.invoiceNo}</span></div>
            <div className="kv"><span className="k">{t("inv_date")}</span><span className="v">{fmtDate(inv.paidAt ?? inv.createdAt, { time: true })}</span></div>
            <div className="kv"><span className="k">{t("inv_mode")}</span><span className="v">{inv.mode === "assisted" ? t("inv_mode_assisted") : t("inv_mode_scan")}</span></div>
          </section>

          <section className="card">
            <div className="card-title">{t("inv_lines")}</div>
            {inv.lines.map((l, i) => (
              <div className="line" key={`${l.sku}-${i}`}>
                <div className="n">{l.name}</div>
                <div className="lt num">{formatIDR(l.lineTotal)}</div>
                <div className="q">{l.qty} × {l.unit} · {formatIDR(l.unitPrice)}</div>
              </div>
            ))}
            <div className="card-title" style={{ marginTop: 16 }}>{t("inv_cat_totals")}</div>
            {(Object.entries(inv.categoryTotals) as [CategoryCode, number][]).map(([c, amt]) => (
              <div className="kv" key={c}><span className="k">{CATEGORY_BY_CODE[c]?.icon} {lang === "en" ? CATEGORY_BY_CODE[c]?.en : CATEGORY_BY_CODE[c]?.id ?? c}</span><span className="v num">{formatIDR(amt)}</span></div>
            ))}
            <div className="total"><span className="bold">{t("inv_total")}</span><span className="v num">{formatIDR(inv.total)}</span></div>
          </section>

          <section className="card">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>{t("inv_proof")}</div>
              {v === "loading" ? <span className="badge neutral">{t("inv_verifying")}</span>
                : verified ? <span className="badge ok"><ShieldIcon width={18} height={18} /> {t("inv_verified")}</span>
                : <span className="badge warn">{t("inv_unverified")}</span>}
            </div>
            <div className="kv" style={{ flexDirection: "column", gap: 4 }}>
              <span className="k">{t("inv_hash")}</span>
              <span className="mono small wrap" style={{ textAlign: "left" }}>{inv.hash}</span>
            </div>
            <div className="kv" style={{ flexDirection: "column", gap: 4 }}>
              <span className="k">{t("inv_tx")}</span>
              <span className="mono small wrap" style={{ textAlign: "left" }} title={inv.txHash}>{inv.txHash ?? "—"}</span>
            </div>
            <div className="kv"><span className="k">{t("inv_block")}</span><span className="v mono">{inv.blockNumber ?? "—"}</span></div>
            {v !== "loading" && v && v.events.length > 0 && (
              <div className="tiny muted" style={{ marginTop: 8 }}>{v.events.length} Spent · {shortHash(v.events[0].tx_hash)} · {fmtDate(v.events[0].block_time, { time: true, short: true })}</div>
            )}
          </section>

          <div className="btn-row no-print">
            <button className="btn btn-secondary" onClick={share}><ShareIcon /> {t("inv_share")}</button>
            <button className="btn btn-secondary" onClick={() => window.print()}><PrintIcon /> {t("inv_print")}</button>
          </div>
        </>
      )}
    </Page>
  );
}
