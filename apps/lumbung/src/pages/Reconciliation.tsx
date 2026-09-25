import { api, type Reconciliation as Recon } from "../api";
import { useFetch } from "../lib/hooks";
import { Card, DataTable, ErrorBox, Loading, CheckRow, CategoryTag } from "../components/ui";
import { idr, int, fmtDateTime } from "../lib/format";

const OkPill = ({ ok }: { ok: boolean }) => <span className={`pill ${ok ? "ok" : "bad"}`}>{ok ? "OK" : "Selisih"}</span>;

export function Reconciliation() {
  const { data, error, loading, reload } = useFetch(() => api.get<Recon>("/admin/reconciliation"), []);
  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Rekonsiliasi</h2><div className="sub">Tiga-arah: pasokan on-chain vs peristiwa terindeks vs invoice operator vs settlement</div></div>
        <div className="page-actions"><button className="btn primary" onClick={reload} disabled={loading}>{loading ? "Memeriksa…" : "Periksa ulang"}</button></div>
      </div>
      <ErrorBox error={error} />
      {!data ? <Loading text="Membaca ledger dan basis data…" /> : (
        <div className={`stack ${loading ? "skeleton-hold" : ""}`}>
          <div className={`banner ${data.allOk ? "ok" : "bad"}`}>
            <span className="big">{data.allOk ? "SEMUA COCOK" : "ADA SELISIH"}</span>
            <span className="small" style={{ fontWeight: 500 }}>Diperiksa {fmtDateTime(data.checkedAt)} · hingga blok terindeks {int(data.indexedBlock)}</span>
          </div>
          <Card title="Pasokan per jenis voucher" sub="Pasokan on-chain harus sama dengan diterbitkan − ditebus − ditarik − kedaluwarsa" flush>
            <DataTable rows={data.rows} rowKey={(r) => r.typeId} tall columns={[
              { key: "typeId", label: "Tipe", render: (r) => <span className="mono">#{r.typeId}</span> },
              { key: "category", label: "Kategori", render: (r) => <CategoryTag code={r.category} /> },
              { key: "season", label: "Musim" },
              { key: "issued", label: "Diterbitkan", align: "r", render: (r) => idr(r.issued) },
              { key: "spent", label: "Dibelanjakan", align: "r", render: (r) => idr(r.spent) },
              { key: "redeemed", label: "Ditebus", align: "r", render: (r) => idr(r.redeemed) },
              { key: "clawback", label: "Ditarik", align: "r", render: (r) => idr(r.clawback) },
              { key: "expired", label: "Kedaluwarsa", align: "r", render: (r) => idr(r.expired) },
              { key: "expectedSupply", label: "Pasokan seharusnya", align: "r", render: (r) => idr(r.expectedSupply) },
              { key: "onChainSupply", label: "Pasokan on-chain", align: "r", render: (r) => idr(r.onChainSupply) },
              { key: "supplyOk", label: "Hasil", render: (r) => <OkPill ok={r.supplyOk} /> },
            ]} footer={["Total", "", "", idr(data.rows.reduce((s, r) => s + r.issued, 0)), idr(data.rows.reduce((s, r) => s + r.spent, 0)), idr(data.rows.reduce((s, r) => s + r.redeemed, 0)), idr(data.rows.reduce((s, r) => s + r.clawback, 0)), idr(data.rows.reduce((s, r) => s + r.expired, 0)), idr(data.rows.reduce((s, r) => s + r.expectedSupply, 0)), idr(data.rows.reduce((s, r) => s + r.onChainSupply, 0)), ""]} />
          </Card>
          <div className="grid g-2">
            <Card title="Ledger vs invoice">
              <CheckRow ok={data.ledger.ok} label={<>Invoice dibayar = peristiwa Pembelanjaan <OkPill ok={data.ledger.ok} /></>} desc={<>Invoice dibayar (basis data): <b>{idr(data.ledger.invoicesPaid)}</b> · Pembelanjaan (ledger): <b>{idr(data.ledger.spentEvents)}</b>{!data.ledger.ok && <> · selisih <b>{idr(data.ledger.invoicesPaid - data.ledger.spentEvents)}</b></>}</>} />
            </Card>
            <Card title="Settlement vs penebusan">
              <CheckRow ok={data.settlement.ok} label={<>Dana disalurkan = peristiwa Penebusan <OkPill ok={data.settlement.ok} /></>} desc={<>Settlement (bank): <b>{idr(data.settlement.payouts)}</b> · Penebusan (ledger): <b>{idr(data.settlement.redeemedEvents)}</b>{!data.settlement.ok && <> · selisih <b>{idr(data.settlement.payouts - data.settlement.redeemedEvents)}</b></>}</>} />
              <div className="small muted" style={{ marginTop: 8 }}>Piutang merchant yang belum di-settle: <b>{idr(data.settlement.merchantReceivable)}</b></div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
