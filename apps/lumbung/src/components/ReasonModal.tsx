import { useState } from "react";
import { Modal, ErrorBox, HashChip } from "./ui";

/** Reason-gated on-chain action (freeze / suspend). Shows the resulting tx hash. */
export function ReasonModal({ open, title, desc, confirmLabel, danger, onClose, onConfirm }: { open: boolean; title: string; desc: string; confirmLabel: string; danger?: boolean; onClose: () => void; onConfirm: (reason: string) => Promise<{ txHash?: string }> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);
  const close = () => { setReason(""); setError(null); setTx(null); onClose(); };
  const go = async () => {
    setBusy(true); setError(null);
    try { const r = await onConfirm(reason.trim()); setTx(r.txHash ?? ""); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title={title} onClose={close} footer={tx === null ? <><button className="btn" onClick={close}>Batal</button><button className={`btn ${danger ? "danger" : "primary"}`} disabled={busy || reason.trim().length < 3} onClick={go}>{busy ? "Mengirim ke ledger…" : confirmLabel}</button></> : <button className="btn primary" onClick={close}>Selesai</button>}>
      {tx === null ? (
        <>
          <p className="muted small" style={{ margin: 0 }}>{desc} Alasan dicatat pada ledger (sebagai hash) dan pada jejak audit.</p>
          <div className="field"><label>Alasan (wajib, min. 3 karakter)</label><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: temuan audit lapangan tanggal …" /></div>
          <ErrorBox error={error} />
        </>
      ) : (
        <div className="banner ok"><div><div>Tindakan tercatat pada ledger.</div><div className="small" style={{ marginTop: 6 }}>Hash transaksi: <HashChip value={tx} head={10} tail={8} /></div></div></div>
      )}
    </Modal>
  );
}
