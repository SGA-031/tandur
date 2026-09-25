import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, session, type Farmer } from "../api";
import { useT } from "../i18n";
import { LangToggle, Page, Sheet, Skeleton, TopBar, shortHash } from "../components/Shell";
import { CopyIcon, HelpIcon, LogoutIcon } from "../components/Icons";
import { useToast } from "../components/Toast";

export default function Profile() {
  const { t } = useT();
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState<Farmer | null>(session.farmer());
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => { api.me().then((r) => { setF(r.farmer); session.setFarmer(r.farmer); }).catch(() => {}); }, []);

  const logout = () => {
    session.clear();
    nav("/login", { replace: true });
  };
  const copy = async (s: string) => { try { await navigator.clipboard.writeText(s); toast(t("prof_copied"), "ok"); } catch { /* ignore */ } };

  const land = f?.landHa != null && f.landHa !== "" ? `${Number(f.landHa).toLocaleString("id-ID", { maximumFractionDigits: 2 })} ha` : "—";
  const active = f?.status === "active";

  return (
    <Page>
      <TopBar title={t("prof_title")} right={<LangToggle />} />
      {!f ? <div className="card"><Skeleton h={28} w="50%" /><Skeleton h={120} style={{ marginTop: 12 }} /></div> : (
        <>
          <section className="card center">
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--sawah-100)", display: "grid", placeItems: "center", margin: "0 auto 8px", fontSize: 34 }} aria-hidden>👨🏽‍🌾</div>
            <div className="bold" style={{ fontSize: 22 }}>{f.name}</div>
            <span className={`badge ${active ? "ok" : "critical"}`} style={{ marginTop: 6 }}>{active ? t("prof_active") : t("prof_frozen")}</span>
          </section>

          <section className="card">
            <div className="kv"><span className="k">{t("prof_nik")}</span><span className="v mono">{f.nikMasked ?? "—"}</span></div>
            <div className="kv"><span className="k">{t("prof_phone")}</span><span className="v">{f.phone ?? "—"}</span></div>
            <div className="kv"><span className="k">{t("prof_address")}</span><span className="v">{[f.village, f.district, f.regency, f.province].filter(Boolean).join(", ")}</span></div>
            <div className="kv"><span className="k">{t("prof_land")}</span><span className="v">{land}</span></div>
            <div className="kv"><span className="k">{t("prof_commodity")}</span><span className="v">{f.commodity ?? "—"}</span></div>
            <div className="kv"><span className="k">{t("prof_status")}</span><span className="v">{active ? t("prof_active") : t("prof_frozen")}</span></div>
            <div className="kv" style={{ alignItems: "center" }}>
              <span className="k">{t("prof_account")}</span>
              <span className="v row" style={{ gap: 6 }}>
                <span className="mono small" title={f.address}>{shortHash(f.address, 12)}</span>
                <button className="icon-btn" style={{ width: 44, height: 44 }} onClick={() => copy(f.address)} aria-label={t("copy")}><CopyIcon width={20} height={20} /></button>
              </span>
            </div>
          </section>

          <section className="card row" style={{ background: "var(--padi-100)", borderColor: "var(--padi-300)" }}>
            <HelpIcon width={32} height={32} style={{ color: "var(--padi-600)", flexShrink: 0 }} />
            <div><div className="bold">{t("prof_help_title")}</div><div className="small">{t("prof_help_body")}</div></div>
          </section>

          <button className="btn btn-danger" onClick={() => setConfirmOpen(true)}><LogoutIcon /> {t("prof_logout")}</button>
          {confirmOpen && (
            <Sheet title={t("prof_logout")} onClose={() => setConfirmOpen(false)}>
              <p style={{ margin: "0 0 16px" }}>{t("prof_logout_confirm")}</p>
              <div className="row" style={{ gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmOpen(false)}>{t("cancel")}</button>
                <button className="btn btn-danger" style={{ flex: 1 }} onClick={logout}>{t("prof_logout")}</button>
              </div>
            </Sheet>
          )}
          <div className="footer">Tandur · {t("tagline")} · {t("ministry")}</div>
        </>
      )}
    </Page>
  );
}
