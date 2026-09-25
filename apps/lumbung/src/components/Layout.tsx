import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api, getSession, type Overview } from "../api";
import { ROLE_LABEL } from "../lib/format";
import { ToastHost } from "./ui";

const NAV: { to: string; label: string; icon: string; end?: boolean }[] = [
  { to: "/", label: "Ringkasan", icon: "M3 10.5 12 3l9 7.5V21H3z", end: true },
  { to: "/analitik", label: "Pengeluaran", icon: "M4 20V10m6 10V4m6 16v-7m4 7H2" },
  { to: "/petani", label: "Petani", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0" },
  { to: "/merchant", label: "Merchant", icon: "M4 9 5 4h14l1 5M4 9h16v11H4zM10 20v-6h4v6" },
  { to: "/invoice", label: "Invoice", icon: "M6 3h9l4 4v14H6zM9 12h6M9 16h6" },
  { to: "/ledger", label: "Ledger", icon: "M4 6h16M4 12h16M4 18h16M8 3v18" },
  { to: "/peringatan", label: "Peringatan", icon: "M12 3 2 21h20zM12 10v5m0 3v.1" },
  { to: "/rekonsiliasi", label: "Rekonsiliasi", icon: "M4 7h12l-3-3m7 13H8l3 3" },
  { to: "/penyaluran", label: "Penyaluran dana", icon: "M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" },
  { to: "/alokasi", label: "Alokasi", icon: "M12 3v18M3 12h18M6 6l12 12M18 6 6 18" },
  { to: "/katalog", label: "Katalog & HET", icon: "M4 4h16v16H4zM4 10h16M10 4v16" },
  { to: "/audit", label: "Jejak audit", icon: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM9 12l2 2 4-4" },
];

export function Layout() {
  const session = getSession();
  const [open, setOpen] = useState(false);
  const [ov, setOv] = useState<Overview | null>(null);
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    let alive = true;
    const load = () => api.get<Overview>("/admin/overview").then((d) => { if (alive) setOv(d); }).catch(() => {});
    load();
    const id = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const ledger = ov?.ledger;
  const health = !ledger ? "unknown" : ledger.peers > 0 && ledger.blockNumber - ledger.indexedBlock <= 5 ? "ok" : ledger.peers > 0 ? "warn" : "bad";
  const openAlerts = ov?.alerts.filter((a) => a.severity === "critical" || a.severity === "serious").reduce((s, a) => s + a.n, 0) ?? 0;
  const title = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))?.label ?? "Lumbung";

  return (
    <div className="shell">
      <div className={`backdrop ${open ? "show" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <img src="/icon.svg" alt="" />
          <div><div className="brand-name">Lumbung</div><div className="brand-sub">Dasbor Pengawasan Subsidi Sarana Produksi</div></div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? "active" : "")}>
              <svg className="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
              {n.label}
              {n.to === "/peringatan" && openAlerts > 0 && <span className="nav-badge">{openAlerts}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">Tandur · voucher subsidi pertanian<br />Ledger Hyperledger Besu (izin, 4 validator)</div>
      </aside>
      <div className="main">
        <header className="header">
          <button className="menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Menu">☰</button>
          <h1>{title}</h1>
          <div className="spacer" />
          <span className="ledger-dot" title={ledger ? `Blok ${ledger.blockNumber}, terindeks ${ledger.indexedBlock}, ${ledger.peers} peer` : "Status ledger belum diketahui"}>
            <span className={`dot ${health === "ok" ? "ok" : health === "warn" ? "warn" : health === "bad" ? "bad" : ""}`} />
            {ledger ? `Ledger · blok ${new Intl.NumberFormat("id-ID").format(ledger.blockNumber)}` : "Ledger…"}
          </span>
          <div className="user">
            <span className="name">{session?.admin.name}</span>
            <span className="role">{ROLE_LABEL[session?.admin.role ?? ""] ?? session?.admin.role}</span>
            <button className="btn sm ghost" onClick={() => api.logout()}>Keluar</button>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
      <ToastHost />
    </div>
  );
}
