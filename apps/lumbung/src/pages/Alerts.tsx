import { useState } from "react";
import { Link } from "react-router-dom";
import { api, qs, type Alert } from "../api";
import { useFetch } from "../lib/hooks";
import { Card, ErrorBox, Loading, SeverityBadge, StatusPill, EmptyState, toast } from "../components/ui";
import { ruleLabel, fmtDateTime, SEVERITY_LABEL, ALERT_STATUS_LABEL, int } from "../lib/format";

const SEV: Alert["severity"][] = ["critical", "serious", "warning", "info"];

function subjectLink(a: Alert) {
  const label = a.subjectName ?? a.subjectId;
  if (a.subjectKind === "farmer") return <Link className="link" to={`/petani/${a.subjectId}`}>{label}</Link>;
  if (a.subjectKind === "merchant") return <Link className="link" to={`/merchant/${a.subjectId}`}>{label}</Link>;
  if (a.subjectKind === "invoice") return <Link className="link mono" to={`/invoice/${a.subjectId}`}>{label}</Link>;
  return <span>{label}</span>;
}
const KIND: Record<string, string> = { farmer: "Petani", merchant: "Merchant", invoice: "Invoice" };

export function Alerts() {
  const [status, setStatus] = useState("open");
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const { data, error, reload, loading } = useFetch(() => api.get<{ alerts: Alert[] }>(`/admin/alerts${qs({ status })}`), [status]);
  const setAlert = async (a: Alert, s: Alert["status"]) => {
    setBusy(a.id);
    try { await api.post(`/admin/alerts/${a.id}`, { status: s }); toast(`Peringatan #${a.id} → ${ALERT_STATUS_LABEL[s]}`, "ok"); reload(); } catch (e) { toast((e as Error).message, "bad"); } finally { setBusy(null); }
  };
  const run = async () => {
    setRunning(true);
    try { const r = await api.post<{ updated: number }>("/admin/alerts/run"); toast(`Analisis selesai · ${int(r.updated)} peringatan diperbarui`, "ok"); reload(); } catch (e) { toast((e as Error).message, "bad"); } finally { setRunning(false); }
  };
  const groups = SEV.map((s) => ({ s, items: (data?.alerts ?? []).filter((a) => a.severity === s) })).filter((g) => g.items.length);
  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Peringatan</h2><div className="sub">Aturan deteksi: konsentrasi merchant, kecepatan, transaksi dipecah, pengurasan sehari, jam tidak wajar, nominal bulat, belanja luar wilayah</div></div>
        <div className="page-actions">
          <div className="seg">{[["open", "Terbuka"], ["reviewing", "Ditinjau"], ["closed", "Ditutup"], ["", "Semua"]].map(([k, l]) => <button key={k} className={status === k ? "on" : ""} onClick={() => setStatus(k)}>{l}</button>)}</div>
          <button className="btn primary" onClick={run} disabled={running}>{running ? "Menganalisis…" : "Jalankan analisis"}</button>
        </div>
      </div>
      <ErrorBox error={error} />
      {!data ? <Loading /> : groups.length === 0 ? <Card><EmptyState title="Tidak ada peringatan" desc="Tidak ada peringatan pada filter ini." /></Card> : groups.map((g) => (
        <Card key={g.s} title={<span className="row"><SeverityBadge severity={g.s} /> {SEVERITY_LABEL[g.s]} <span className="muted small">{g.items.length}</span></span>} className={loading ? "skeleton-hold" : ""}>
          {g.items.map((a) => (
            <div className="check" key={a.id} style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row spread">
                  <div className="lbl">{ruleLabel(a.rule)} <span className="muted small">· {KIND[a.subjectKind] ?? a.subjectKind}: </span>{subjectLink(a)}</div>
                  <div className="row" style={{ gap: 6 }}>
                    <StatusPill status={a.status} />
                    {a.status !== "reviewing" && a.status !== "closed" && <button className="btn sm" disabled={busy === a.id} onClick={() => setAlert(a, "reviewing")}>Tinjau</button>}
                    {a.status !== "closed" && <button className="btn sm" disabled={busy === a.id} onClick={() => setAlert(a, "closed")}>Tutup</button>}
                    {a.status === "closed" && <button className="btn sm ghost" disabled={busy === a.id} onClick={() => setAlert(a, "open")}>Buka lagi</button>}
                  </div>
                </div>
                <div className="desc" style={{ marginTop: 4 }}>{a.detail}</div>
                <div className="row small muted" style={{ marginTop: 6, gap: 14 }}>
                  <span>#{a.id} · {fmtDateTime(a.createdAt)}</span>
                  {a.evidence != null && <details className="raw"><summary>Bukti</summary><pre className="pre" style={{ marginTop: 6, maxHeight: 160 }}>{JSON.stringify(a.evidence, null, 2)}</pre></details>}
                </div>
              </div>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
