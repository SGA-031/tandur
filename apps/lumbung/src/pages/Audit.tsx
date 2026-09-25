import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type AuditEntry } from "../api";
import { useFetch } from "../lib/hooks";
import { Card, DataTable, ErrorBox, Loading, HashChip, Filters, Field } from "../components/ui";
import { fmtDateTime, ACTION_LABEL, int } from "../lib/format";

function targetLink(e: AuditEntry) {
  if (!e.target) return <span className="muted">–</span>;
  if (e.action.startsWith("farmer.")) return <Link className="link mono small" to={`/petani/${e.target}`}>{e.target}</Link>;
  if (e.action.startsWith("merchant.") || e.action === "payout.run") return <Link className="link mono small" to={`/merchant/${e.target}`}>{e.target}</Link>;
  if (e.action === "product.upsert") return <Link className="link mono small" to="/katalog">{e.target}</Link>;
  if (e.action === "alert.status") return <Link className="link mono small" to="/peringatan">#{e.target}</Link>;
  if (e.action === "allocation.issue" || e.action === "voucherType.create") return <Link className="link mono small" to="/alokasi">{e.target}</Link>;
  return <span className="mono small">{e.target}</span>;
}
function detailText(d: unknown): { text: string; tx?: string } {
  if (!d || typeof d !== "object") return { text: d ? String(d) : "" };
  const o = d as Record<string, unknown>;
  const tx = typeof o.txHash === "string" ? o.txHash : undefined;
  const parts = Object.entries(o).filter(([k]) => k !== "txHash").map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return { text: parts.join(" · "), tx };
}

export function Audit() {
  const { data, error } = useFetch(() => api.get<{ entries: AuditEntry[] }>("/admin/audit"), [], { poll: 30_000 });
  const [actor, setActor] = useState(""); const [action, setAction] = useState("");
  const entries = data?.entries ?? [];
  const actors = Array.from(new Set(entries.map((e) => e.actor))).sort();
  const actions = Array.from(new Set(entries.map((e) => e.action))).sort();
  const rows = entries.filter((e) => (!actor || e.actor === actor) && (!action || e.action === action));
  return (
    <div className="stack">
      <div className="page-head"><div><h2>Jejak audit</h2><div className="sub">Setiap tindakan administratif: siapa, apa, kapan, dan hash transaksi ledger terkait{data ? ` · ${int(entries.length)} entri terakhir` : ""}</div></div></div>
      <Filters>
        <Field label="Aktor"><select className="select" value={actor} onChange={(e) => setActor(e.target.value)}><option value="">Semua</option>{actors.map((a) => <option key={a} value={a}>{a}</option>)}</select></Field>
        <Field label="Tindakan"><select className="select" value={action} onChange={(e) => setAction(e.target.value)}><option value="">Semua</option>{actions.map((a) => <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>)}</select></Field>
      </Filters>
      <ErrorBox error={error} />
      <Card flush>
        {!data ? <Loading /> : <DataTable rows={rows} rowKey={(e) => e.id} tall columns={[
          { key: "id", label: "#", align: "r", render: (e) => String(e.id) },
          { key: "createdAt", label: "Waktu", render: (e) => fmtDateTime(e.createdAt), sort: (e) => e.createdAt },
          { key: "actor", label: "Aktor", render: (e) => <b>{e.actor}</b>, sort: (e) => e.actor },
          { key: "action", label: "Tindakan", render: (e) => <>{ACTION_LABEL[e.action] ?? e.action}<div className="muted mono">{e.action}</div></>, sort: (e) => e.action },
          { key: "target", label: "Target", render: targetLink },
          { key: "detail", label: "Rincian", wrap: true, render: (e) => { const d = detailText(e.detail); return <span className="small">{d.text}{d.tx && <> · <HashChip value={d.tx} /></>}</span>; } },
        ]} />}
      </Card>
    </div>
  );
}
