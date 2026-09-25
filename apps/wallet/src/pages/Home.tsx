import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CATEGORY_BY_CODE, formatIDR, type BalanceDTO } from "@tandur/shared";
import { api, session, type Farmer } from "../api";
import { fmtDate, useT } from "../i18n";
import { Page, Skeleton } from "../components/Shell";
import { CameraIcon, RefreshIcon } from "../components/Icons";
import { useToast } from "../components/Toast";

function greeting(t: (k: "greeting_morning" | "greeting_day" | "greeting_afternoon" | "greeting_night") => string) {
  const h = new Date().getHours();
  if (h < 11) return t("greeting_morning");
  if (h < 15) return t("greeting_day");
  if (h < 18) return t("greeting_afternoon");
  return t("greeting_night");
}

/** Merge balances of the same category (several seasons) into one row, keeping the latest expiry. */
function byCategory(balances: BalanceDTO[]) {
  const m = new Map<string, BalanceDTO>();
  for (const b of balances) {
    const cur = m.get(b.category);
    if (!cur) m.set(b.category, { ...b });
    else m.set(b.category, { ...cur, balance: cur.balance + b.balance, issued: cur.issued + b.issued, spent: cur.spent + b.spent, validUntil: cur.validUntil > b.validUntil ? cur.validUntil : b.validUntil });
  }
  return Array.from(m.values());
}

export default function Home() {
  const { t, lang } = useT();
  const toast = useToast();
  const [farmer, setFarmer] = useState<Farmer | null>(session.farmer());
  const [loading, setLoading] = useState(!farmer);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.me();
      setFarmer(r.farmer);
      session.setFarmer(r.farmer);
    } catch (e) {
      if (!session.farmer()) toast((e as Error).message, "error");
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const cats = farmer ? byCategory(farmer.balances) : [];
  const season = farmer?.balances[0]?.season;

  return (
    <Page cta>
      <header className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow">
          <div className="muted">{greeting(t)},</div>
          <h1 style={{ fontSize: 24 }}>{farmer?.name ?? <Skeleton h={28} w={180} />}</h1>
          {farmer && <div className="muted small">{farmer.village}{farmer.district ? `, ${farmer.district}` : ""}</div>}
        </div>
        <button className="icon-btn" onClick={load} aria-label={t("home_refresh")} disabled={loading}><RefreshIcon /></button>
      </header>

      {farmer?.status && farmer.status !== "active" && <div className="banner critical" role="alert">{t("home_frozen")}</div>}

      <section className="card hero" aria-live="polite">
        <div className="label">{t("home_total")}</div>
        <div className="amount num">{farmer ? formatIDR(farmer.totalBalance) : <Skeleton h={44} w="70%" style={{ background: "rgba(255,255,255,.25)" }} />}</div>
        {season && <span className="season">🌾 {t("home_season")} {season}</span>}
      </section>

      <h2 className="card-title" style={{ marginBottom: -4 }}>{t("home_categories")}</h2>
      {loading && !farmer && [0, 1, 2].map((i) => <div key={i} className="card"><Skeleton h={80} /></div>)}
      {farmer && cats.length === 0 && <div className="card muted center">{t("home_no_balance")}</div>}
      {cats.map((b) => {
        const c = CATEGORY_BY_CODE[b.category];
        const pct = b.issued > 0 ? Math.min(100, Math.round((b.spent / b.issued) * 100)) : 0;
        return (
          <section key={b.category} className={`card cat ${b.balance === 0 ? "empty" : ""}`}>
            <div className="icon" aria-hidden>{c?.icon ?? "📦"}</div>
            <div className="grow">
              <div className="name">{lang === "en" ? c?.en ?? b.category : c?.id ?? b.category}</div>
              <div className="left num">{formatIDR(b.balance)}</div>
              <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
              <div className="small muted" style={{ marginTop: 6 }}>
                {t("home_used")} {formatIDR(b.spent)} {t("home_of")} {formatIDR(b.issued)}
              </div>
              <div className="small muted">{t("home_valid_until")} {fmtDate(b.validUntil)}</div>
            </div>
          </section>
        );
      })}

      <div className="cta">
        <div>
          <Link to="/scan" className="btn btn-primary" aria-disabled={farmer?.status !== "active"}>
            <CameraIcon width={28} height={28} /> {t("home_scan")}
          </Link>
        </div>
      </div>
    </Page>
  );
}
