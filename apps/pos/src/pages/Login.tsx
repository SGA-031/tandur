import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../components/Auth";

export function LoginPage() {
  const { merchant, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (merchant) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await login(username.trim(), password);
      const from = (loc.state as { from?: string } | null)?.from;
      nav(from && from !== "/login" ? from : "/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand"><img src="/icon.svg" alt="" /><span>Tandur Kasir<small>Voucher subsidi tani</small></span></div>
        <h1>Masuk kasir</h1>
        <p className="lead">Gunakan akun koperasi atau kios yang terdaftar di operator Tandur.</p>
        <div className="stack">
          <div className="field">
            <label htmlFor="u">Nama pengguna</label>
            <input id="u" className="input" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="p">Kata sandi</label>
            <input id="p" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy || !username || !password}>
            {busy ? <span className="spinner light" /> : "Masuk"}
          </button>
        </div>
        <p className="demo-hint">Akun demo: <code>kdmp-klaten</code> / <code>tandur123</code></p>
      </form>
    </div>
  );
}
