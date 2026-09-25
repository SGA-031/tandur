import { Link, useNavigate } from "react-router-dom";
import { api, type Overview as OverviewT, type ChainEvent } from "../api";
import { useFetch } from "../lib/hooks";
import { Card, StatTile, DataTable, HashChip, EmptyState, ErrorBox, Loading, KindBadge, CategoryTag, SeverityBadge } from "../components/ui";
import { TimeSeriesChart, HorizontalBars, GroupedBars } from "../charts/charts";
import { CATEGORY_ORDER, categoryColor } from "../charts/palette";
import { num, idr, idrCompact, int, pct, catShort, dayKey, wibDay, fmtDateTime, EVENT_LABEL, MIRROR_EVENTS, shortHash } from "../lib/format";

export function eventSummary(e: ChainEvent, names?: Record<string, { kind: string; id: string; name: string }>): string {
  const a = e.args ?? {};
  const who = (addr: unknown) => { const k = String(addr ?? "").toLowerCase(); return names?.[k]?.name ?? shortHash(String(addr ?? ""), 6, 4); };
  switch (e.name) {
    case "Issued": return `${who(a.farmer)} · tipe #${a.typeId} · ${idr(a.amount)}`;
    case "Spent": return `${who(a.farmer)} → ${who(a.merchant)} · ${idr(a.amount)}`;
    case "Redeemed": return `${who(a.merchant)} · tipe #${a.typeId} · ${idr(a.amount)}`;
    case "Clawback": case "Expired": return `${who(a.farmer)} · tipe #${a.typeId} · ${idr(a.amount)}`;
    case "Frozen": return `${who(a.account)} · ${a.frozen ? "dibekukan" : "dibuka"}`;
    case "VoucherTypeCreated": return `tipe #${a.typeId} · plafon ${idr(a.perFarmerCap)}`;
    case "FarmerRegistered": case "MerchantRegistered": return who(a.account);
    case "FarmerStatusChanged": case "MerchantStatusChanged": return `${who(a.account)} · ${a.active ? "aktif" : "nonaktif"}`;
    case "TransferSingle": return `${who(a.from)} → ${who(a.to)} · tipe #${a.id} · ${idr(a.value)}`;
    case "TransferBatch": return `${who(a.from)} → ${who(a.to)} · ${Array.isArray(a.ids) ? a.ids.length : 0} tipe`;
    case "RoleGranted": case "RoleRevoked": return `${who(a.account)} · peran ${shortHash(String(a.role ?? ""), 6, 4)}`;
    default: return Object.entries(a).slice(0, 3).map(([k, v]) => `${k}=${typeof v === "string" && v.startsWith("0x") ? shortHash(v) : String(v)}`).join(" · ");
  }
}

export function Overview() {
  const { data, error } = useFetch(() => api.get<OverviewT>("/admin/overview"), [], { poll: 15_000 });
  const namesQ = useFetch(() => api.get<{ names: Record<string, { kind: string; id: string; name: string }> }>("/admin/events?limit=1"), []);
  const names = namesQ.data?.names;
  const nav = useNavigate();
  if (error && !data) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const d = data;

  // 30-day daily series with zero-fill so gaps do not vanish
  const byDay = new Map(d.daily.map((r) => [dayKey(r.day), { total: num(r.total), invoices: r.invoices }]));
  const days: { day: string; total: number; invoices: number }[] = [];
  for (let i = 29; i >= 0; i--) { const k = wibDay(new Date(Date.now() - i * 864e5)); const v = byDay.get(k); days.push({ day: k, total: v?.total ?? 0, invoices: v?.invoices ?? 0 }); }
  const feed = d.recentEvents.filter((e) => !MIRROR_EVENTS.has(e.name));

  const catRows = CATEGORY_ORDER.map((c) => { const r = d.byCategory.find((x) => x.category === c); return { key: c, label: catShort(c), value: num(r?.total), count: r?.invoices ?? 0, color: categoryColor(c) }; }).filter((r) => r.value > 0 || d.issuedByCategory.some((x) => x.category === r.key));
  const provinces = Array.from(new Set([...d.issuedByProvince.map((p) => p.province), ...d.byProvince.map((p) => p.province)]));
  const provRows = provinces.map((p) => ({ label: p, a: num(d.issuedByProvince.find((x) => x.province === p)?.issued), b: num(d.byProvince.find((x) => x.province === p)?.total) })).sort((x, y) => y.a - x.a);
  const sev = (s: string) => d.alerts.find((a) => a.severity === s)?.n ?? 0;
  const openAlerts = d.alerts.reduce((s, a) => s + a.n, 0);
  const lag = d.ledger.blockNumber - d.ledger.indexedBlock;

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Ringkasan</h2><div className="sub">Anggaran, aktivasi, dan kesehatan ledger — diperbarui setiap 15 detik</div></div>
      </div>
      <ErrorBox error={error} />
      <div className="grid g-6">
        <div className="span-2">
          <StatTile hero accent label="Tingkat aktivasi" value={pct(d.activation.rate, 1)} meter={d.activation.rate}
            hint={<><b>{int(d.activation.farmersSpent)}</b> dari <b>{int(d.activation.farmersIssued)}</b> petani penerima sudah membelanjakan vouchernya. Indikator utama: entitlement yang tidak dipakai berarti subsidi tidak sampai.</>} />
        </div>
        <StatTile label="Anggaran tersalurkan" value={idrCompact(d.budget.issued)} hint={<>Diterbitkan ke {int(d.activation.farmersIssued)} petani</>} />
        <StatTile label="Terpakai" value={idrCompact(d.budget.spent)} meter={d.budget.utilisation} hint={<>Utilisasi {pct(d.budget.utilisation)} · sisa {idrCompact(d.budget.outstanding)}</>} />
        <StatTile label="Piutang merchant" value={idrCompact(d.budget.merchantReceivable)} hint={<>Terbelanjakan namun belum di-settle · ditebus {idrCompact(d.budget.redeemed)}</>} />
        <StatTile label="Peringatan terbuka" value={int(openAlerts)} hint={<span className="row" style={{ gap: 6 }}>{(["critical", "serious", "warning", "info"] as const).filter((s) => sev(s) > 0).map((s) => <span key={s} className="row" style={{ gap: 4 }}><SeverityBadge severity={s} /><b>{sev(s)}</b></span>)}{openAlerts === 0 && "Tidak ada"}</span>} />
      </div>
      <div className="grid g-4">
        <StatTile label="Petani aktif" value={`${int(d.farmers.active)} / ${int(d.farmers.total)}`} hint={`${int(d.farmers.total - d.farmers.active)} dibekukan`} />
        <StatTile label="Merchant aktif" value={`${int(d.merchants.active)} / ${int(d.merchants.total)}`} hint={`${int(d.merchants.kdmp)} KDMP`} />
        <StatTile label="Penarikan & kedaluwarsa" value={idrCompact(d.budget.clawback + d.budget.expired)} hint={`Ditarik ${idrCompact(d.budget.clawback)} · kedaluwarsa ${idrCompact(d.budget.expired)}`} />
        <StatTile label="Blok ledger" value={int(d.ledger.blockNumber)} hint={lag <= 5 ? `Terindeks hingga blok ${int(d.ledger.indexedBlock)} · ${d.ledger.peers} peer` : `Indeks tertinggal ${lag} blok`} />
      </div>

      <div className="grid g-3">
        <Card className="span-2" title="Pengeluaran harian" sub="30 hari terakhir, invoice berstatus dibayar (WIB)">
          <TimeSeriesChart data={days} height={250} />
        </Card>
        <Card title="Pengeluaran per kategori" sub="Total invoice dibayar">
          {catRows.length ? <HorizontalBars rows={catRows} byCategory height={250} labelWidth={76} /> : <EmptyState />}
        </Card>
      </div>

      <div className="grid g-3">
        <Card title="Tersalurkan vs terpakai per provinsi" sub="Entitlement diterbitkan dibandingkan belanja terealisasi">
          {provRows.length ? <GroupedBars rows={provRows} aLabel="Tersalurkan" bLabel="Terpakai" height={Math.max(220, provRows.length * 48 + 30)} /> : <EmptyState />}
        </Card>
        <Card title="Merchant teratas" sub="Berdasarkan nilai belanja" flush>
          <DataTable rows={d.topMerchants} rowKey={(r) => r.id} onRow={(r) => nav(`/merchant/${r.id}`)} columns={[
            { key: "name", label: "Merchant", wrap: true, render: (r) => <><Link className="link" to={`/merchant/${r.id}`}>{r.name}</Link> <KindBadge kind={r.kind} /><div className="muted">{r.regency}, {r.province}</div></> },
            { key: "invoices", label: "Invoice", align: "r", render: (r) => int(r.invoices) },
            { key: "total", label: "Belanja", align: "r", render: (r) => idr(r.total) },
          ]} />
        </Card>
        <Card title="Produk teratas" sub="Berdasarkan nilai belanja" flush>
          <DataTable rows={d.topProducts} rowKey={(r) => r.sku} columns={[
            { key: "name", label: "Produk", wrap: true, render: (r) => <>{r.name}<div className="muted"><CategoryTag code={r.category} short /></div></> },
            { key: "qty", label: "Jumlah", align: "r", render: (r) => int(r.qty) },
            { key: "total", label: "Belanja", align: "r", render: (r) => idr(r.total) },
          ]} />
        </Card>
      </div>

      <div className="grid g-3">
        <Card title="Status ledger" sub="Hyperledger Besu · jaringan berizin">
          <dl className="kv">
            <dt>Chain ID</dt><dd className="mono">{d.ledger.chainId}</dd>
            <dt>Blok tertinggi</dt><dd className="mono">{int(d.ledger.blockNumber)}</dd>
            <dt>Blok terindeks</dt><dd className="mono">{int(d.ledger.indexedBlock)} {lag > 5 && <span className="pill warn">tertinggal {lag}</span>}</dd>
            <dt>Peer</dt><dd className="mono">{d.ledger.peers}</dd>
            <dt>Validator</dt><dd>{d.ledger.validators.length} <span className="muted small">(kementerian, operator, auditor, bank)</span><div className="tx-list" style={{ marginTop: 4 }}>{d.ledger.validators.map((v) => <HashChip key={v} value={v} />)}</div></dd>
            <dt>Kontrak voucher</dt><dd><HashChip value={d.ledger.voucherAddress} head={8} tail={6} /></dd>
            <dt>Kontrak registri</dt><dd><HashChip value={d.ledger.registryAddress} head={8} tail={6} /></dd>
          </dl>
        </Card>
        <Card className="span-2" title="Peristiwa ledger terbaru" sub="Peristiwa kontrak voucher & registri (mutasi saldo teknis disembunyikan)" actions={<Link className="btn sm" to="/ledger">Buka penjelajah</Link>}>
          {feed.length === 0 ? <EmptyState /> : (
            <div className="events-feed">
              {feed.map((e, i) => (
                <div className="ev" key={`${e.txHash}-${e.blockNumber}-${i}`}>
                  <span className="evname" title={e.name}>{EVENT_LABEL[e.name] ?? e.name}</span>
                  <span className="args" title={eventSummary(e, names)}>{eventSummary(e, names)}</span>
                  <span className="meta">blok {int(e.blockNumber)} · {fmtDateTime(e.blockTime)}<br /><HashChip value={e.txHash} to={`/ledger?q=${e.txHash}`} /></span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
