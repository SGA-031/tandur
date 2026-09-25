import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { ErrorBox } from "../components/ui";

export function Login() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api.login(username, password); nav("/", { replace: true }); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <img src="/icon.svg" alt="" width={48} height={48} style={{ borderRadius: 12 }} />
        <h1>Lumbung</h1>
        <div className="sub">Dasbor Pengawasan Subsidi Sarana Produksi</div>
        <div className="field"><label>Nama pengguna</label><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></div>
        <div className="field"><label>Kata sandi</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
        <ErrorBox error={error} />
        <button className="btn primary" disabled={busy || !password} type="submit">{busy ? "Masuk…" : "Masuk"}</button>
        <div className="muted small">Akses untuk Kementerian, Operator, dan Auditor. Setiap tindakan dicatat pada jejak audit.</div>
      </form>
    </div>
  );
}
