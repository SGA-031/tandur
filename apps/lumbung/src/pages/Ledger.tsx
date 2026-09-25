import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, qs, type ChainEvent, type LedgerStatus } from "../api";
import { useFetch, useDebounced } from "../lib/hooks";
import { Card, DataTable, Pager, ErrorBox, Loading, HashChip, StatTile, EmptyState } from "../components/ui";
import { int, fmtDateTime, EVENT_LABEL, idr, shortHash } from "../lib/format";

const LIMIT = 50;
type Names = Record<string, { kind: string; id: string; name: string }>;
type Resp = { total: number; page: number; events: ChainEvent[]; names: Names; counts: { name: string; n: number }[] };

function Actor({ addr, names }: { addr: unknown; names: Names }) {
  const a = String(addr ?? ""); const n = names[a.toLowerCase()];
  if (!n) return <HashChip value={a} />;
  return <Link className="link" to={n.kind === "farmer" ? `/petani/${n.id}` : `/merchant/${n.id}`} title={a}>{n.name}</Link>;
}

function Args({ e, names }: { e: ChainEvent; names: Names }) {
  const a = e.args ?? {};
  switch (e.name) {
    case "Issued": return <>Petani <Actor addr={a.farmer} names={names} /> · tipe #{String(a.typeId)} · <b>{idr(a.amount)}</b> · alokasi <span className="mono small">{shortHash(String(a.allocationRef ?? ""), 8, 4)}</span></>;
    case "Spent": return <><Actor addr={a.farmer} names={names} /> → <Actor addr={a.merchant} names={names} /> · tipe #{String(a.typeId)} · <b>{idr(a.amount)}</b> · invoice <HashChip value={String(a.invoiceHash ?? "")} to={`/invoice?q=${String(a.invoiceHash ?? "")}`} /></>;
    case "Redeemed": return <>Merchant <Actor addr={a.merchant} names={names} /> · tipe #{String(a.typeId)} · <b>{idr(a.amount)}</b> · batch <span className="mono small">{shortHash(String(a.batchRef ?? ""), 8, 4)}</span></>;
    case "Clawback": case "Expired": return <><Actor addr={a.farmer} names={names} /> · tipe #{String(a.typeId)} · <b>{idr(a.amount)}</b></>;
    case "Frozen": return <><Actor addr={a.account} names={names} /> · {a.frozen ? "dibekukan" : "dibuka"}</>;
    case "FarmerStatusChanged": case "MerchantStatusChanged": return <><Actor addr={a.account} names={names} /> · {a.active ? "aktif" : "nonaktif"}</>;
    case "FarmerRegistered": case "MerchantRegistered": return <><Actor addr={a.account} names={names} /> · wilayah <span className="mono small">{shortHash(String(a.regionCode ?? ""), 8, 4)}</span></>;
    case "VoucherTypeCreated": return <>tipe #{String(a.typeId)} · plafon/petani <b>{idr(a.perFarmerCap)}</b></>;
    case "TransferSingle": return <><Actor addr={a.from} names={names} /> → <Actor addr={a.to} names={names} /> · tipe #{String(a.id)} · <b>{idr(a.value)}</b> <span className="muted">(cermin teknis dari peristiwa di atas)</span></>;
    case "TransferBatch": return <><Actor addr={a.from} names={names} /> → <Actor addr={a.to} names={names} /> · {Array.isArray(a.ids) ? a.ids.length : 0} tipe</>;
    case "RoleGranted": case "RoleRevoked": return <><Actor addr={a.account} names={names} /> · peran <span className="mono small">{shortHash(String(a.role ?? ""), 8, 4)}</span> oleh <Actor addr={a.sender} names={names} /></>;
    default: return <span className="mono small">{JSON.stringify(a).slice(0, 120)}</span>;
  }
}

export function Ledger() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? ""); const dq = useDebounced(q);
  const [name, setName] = useState(sp.get("name") ?? "");
  const [page, setPage] = useState(1);
  const status = useFetch(() => api.get<LedgerStatus>("/ledger/status"), [], { poll: 15_000 });
  const { data, error, loading } = useFetch(() => api.get<Resp>(`/admin/events${qs({ q: dq, name, page, limit: LIMIT })}`), [dq, name, page]);
  const s = status.data;
  const lag = s ? s.blockNumber - s.indexedBlock : 0;
  const pick = (n: string) => { setName((cur) => (cur === n ? "" : n)); setPage(1); setSp(n ? { name: n } : {}); };
  return (
    <div className="stack">
      <div className="page-head"><div><h2>Ledger</h2><div className="sub">Penjelajah peristiwa kontrak voucher dan registri — setiap baris tidak dapat diubah</div></div></div>
      <div className="grid g-6">
        <StatTile label="Chain ID" value={s ? String(s.chainId) : "…"} />
        <StatTile label="Blok tertinggi" value={s ? int(s.blockNumber) : "…"} />
        <StatTile label="Blok terindeks" value={s ? int(s.indexedBlock) : "…"} hint={s ? (lag <= 5 ? "Sinkron" : `Tertinggal ${lag} blok`) : undefined} />
        <StatTile label="Peer" value={s ? String(s.peers) : "…"} hint={s ? `${s.validators.length} validator` : undefined} />
        <StatTile label="Kontrak voucher" value={<HashChip value={s?.voucherAddress} head={6} tail={4} />} />
        <StatTile label="Kontrak registri" value={<HashChip value={s?.registryAddress} head={6} tail={4} />} />
      </div>
      <div className="filters">
        <div className="field wide"><label>Cari hash transaksi atau alamat</label><input className="input mono" placeholder="0x…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <div className="field grow" style={{ maxWidth: "none" }}><label>Peristiwa</label>
          <div className="chips">
            <button className={`chip ${name === "" ? "on" : ""}`} onClick={() => pick("")}>Semua <span className="n">{int(data?.total ?? 0)}</span></button>
            {(data?.counts ?? []).map((c) => <button key={c.name} className={`chip ${name === c.name ? "on" : ""}`} onClick={() => pick(c.name)}>{EVENT_LABEL[c.name] ?? c.name} <span className="n">{int(c.n)}</span></button>)}
          </div>
        </div>
      </div>
      <ErrorBox error={error} />
      <Card flush className={loading && data ? "skeleton-hold" : ""}>
        {!data ? <Loading /> : (
          <>
            <DataTable rows={data.events} rowKey={(e) => e.id ?? `${e.txHash}-${e.logIndex}`} empty={<EmptyState title="Tidak ada peristiwa" desc="Coba kata kunci atau filter lain." />} columns={[
              { key: "blockNumber", label: "Blok", align: "r", render: (e) => int(e.blockNumber) },
              { key: "blockTime", label: "Waktu", render: (e) => fmtDateTime(e.blockTime) },
              { key: "name", label: "Peristiwa", render: (e) => <span className="evname" title={`${e.contract ?? ""} · ${e.name}`}>{EVENT_LABEL[e.name] ?? e.name}</span> },
              { key: "args", label: "Rincian", wrap: true, render: (e) => <span className="small"><Args e={e} names={data.names} /></span> },
              { key: "txHash", label: "Hash transaksi", render: (e) => <HashChip value={e.txHash} head={8} tail={6} /> },
            ]} />
            <Pager page={data.page} total={data.total} limit={LIMIT} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
