import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "./Auth";

const NAV = [
  { to: "/", label: "Kasir", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M5 6l1.5 12h11L19 6"/><path d="M9 10v5M15 10v5"/></svg> },
  { to: "/transactions", label: "Transaksi", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg> },
  { to: "/settlement", label: "Penyaluran", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M3 11h18M7 15h3"/></svg> },
];

export function KindBadge({ kind }: { kind: string }) {
  const k = kind.toLowerCase();
  return <span className={`kind-badge kind-${k === "kdmp" ? "kdmp" : "kios"}`}>{k === "kdmp" ? "KDMP" : "Kios"}</span>;
}

export function Header() {
  const { merchant, logout } = useAuth();
  const nav = useNavigate();
  return (
    <>
      <header className="header">
        <NavLink to="/" className="brand">
          <img src="/icon.svg" alt="" />
          <span>Tandur Kasir<small>Voucher subsidi tani</small></span>
        </NavLink>
        {merchant && (
          <div className="merchant-chip">
            <strong title={merchant.name}>{merchant.name}</strong>
            <span><KindBadge kind={merchant.kind} /> {merchant.city}</span>
          </div>
        )}
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>{n.label}</NavLink>
          ))}
        </nav>
        <button className="btn btn-sm logout" onClick={() => { logout(); nav("/login"); }} aria-label="Keluar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 17l5-5-5-5M15 12H3M21 3v18"/></svg>
          <span>Keluar</span>
        </button>
      </header>
      <nav className="tabbar">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>{n.icon}{n.label}</NavLink>
        ))}
      </nav>
    </>
  );
}
