import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useT } from "../i18n";
import { BackIcon, HistoryIcon, HomeIcon, InboxIcon, ProfileIcon } from "./Icons";

export function OfflineBanner() {
  const { t } = useT();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (online) return null;
  return <div className="offline" role="status">⚠ {t("offline")}</div>;
}

export function BottomNav() {
  const { t } = useT();
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : "");
  return (
    <nav className="nav" aria-label="Menu utama">
      <div>
        <NavLink to="/" end className={cls}><HomeIcon />{t("nav_home")}</NavLink>
        <NavLink to="/history" className={cls}><HistoryIcon />{t("nav_history")}</NavLink>
        <NavLink to="/inbox" className={cls}><InboxIcon />{t("nav_inbox")}</NavLink>
        <NavLink to="/profile" className={cls}><ProfileIcon />{t("nav_profile")}</NavLink>
      </div>
    </nav>
  );
}

export function Page({ children, nav = true, cta = false, className = "" }: { children: ReactNode; nav?: boolean; cta?: boolean; className?: string }) {
  return (
    <>
      <main className={`page ${nav ? "has-nav" : ""} ${cta ? "has-cta" : ""} ${className}`}>{children}</main>
      {nav && <BottomNav />}
    </>
  );
}

export function TopBar({ title, back, right }: { title: string; back?: string | true; right?: ReactNode }) {
  const nav = useNavigate();
  const { t } = useT();
  return (
    <header className="topbar">
      {back && (
        <button className="icon-btn" aria-label={t("back")} onClick={() => (back === true ? nav(-1) : nav(back))}>
          <BackIcon width={28} height={28} />
        </button>
      )}
      <h1>{title}</h1>
      {right}
    </header>
  );
}

export function Skeleton({ h = 20, w = "100%", r = 10, style }: { h?: number; w?: string | number; r?: number; style?: React.CSSProperties }) {
  return <div className="sk" style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden />;
}

export function Empty({ art, title, sub }: { art: string; title: string; sub?: string }) {
  return (
    <div className="empty">
      <div className="art" aria-hidden>{art}</div>
      <h3>{title}</h3>
      {sub && <div>{sub}</div>}
    </div>
  );
}

export function Sheet({ children, onClose, title }: { children: ReactNode; onClose: () => void; title?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grip" />
        {title && <h2 className="center" style={{ fontSize: 20, marginBottom: 12 }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function LangToggle() {
  const { lang, setLang } = useT();
  return (
    <div className="lang-toggle" role="group" aria-label="Bahasa / Language">
      <button type="button" className={lang === "id" ? "on" : ""} onClick={() => setLang("id")}>ID</button>
      <button type="button" className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
    </div>
  );
}

/** Countdown to an ISO time. Calls onExpire once when it hits zero. */
export function Countdown({ until, onExpire }: { until: string; onExpire?: () => void }) {
  const calc = () => Math.max(0, Math.floor((new Date(until).getTime() - Date.now()) / 1000));
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    const id = window.setInterval(() => setLeft(calc()), 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until]);
  useEffect(() => { if (left === 0) onExpire?.(); }, [left, onExpire]);
  const m = Math.floor(left / 60);
  const s = left % 60;
  return <span className={`countdown ${left < 60 ? "low" : ""}`}>{m}:{String(s).padStart(2, "0")}</span>;
}

export function shortHash(h: string | undefined, n = 10): string {
  if (!h) return "—";
  return h.length > n ? h.slice(0, n) + "…" : h;
}
