import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, session } from "../api";
import { useT } from "../i18n";
import { PinPad } from "../components/PinPad";
import { LangToggle } from "../components/Shell";

function groupNik(digits: string) { return digits.replace(/(\d{4})(?=\d)/g, "$1 "); }

export default function Login() {
  const { t } = useT();
  const nav = useNavigate();
  const [nik, setNik] = useState(session.lastNik());
  const [step, setStep] = useState<"nik" | "pin">(session.lastNik().length === 16 ? "pin" : "nik");
  const [nikErr, setNikErr] = useState<string | null>(null);
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(0);

  const submitNik = (e: FormEvent) => {
    e.preventDefault();
    if (nik.length !== 16) { setNikErr(t("login_nik_invalid")); return; }
    setNikErr(null);
    setStep("pin");
  };

  const submitPin = async (pin: string) => {
    setBusy(true); setPinErr(null);
    try {
      const r = await api.login(nik, pin);
      session.set(r.token, r.farmer);
      session.rememberNik(nik);
      nav("/", { replace: true });
    } catch (e) {
      setPinErr((e as Error).message);
      setReset((k) => k + 1);
    } finally { setBusy(false); }
  };

  return (
    <main className="page">
      <div className="row" style={{ justifyContent: "flex-end" }}><LangToggle /></div>
      <div className="login-hero">
        <img src="/icon.svg" alt="" width={84} height={84} />
        <h1>{t("login_title")}</h1>
        <p className="muted" style={{ margin: "6px 0 0" }}>{t("login_sub")}</p>
      </div>

      {step === "nik" ? (
        <form className="stack card" onSubmit={submitNik} noValidate>
          <div className="field">
            <label htmlFor="nik">{t("login_nik")}</label>
            <input id="nik" className={`input ${nikErr ? "error" : ""}`} inputMode="numeric" autoComplete="off" pattern="[0-9 ]*"
              placeholder="3310 1313 1076 0001" value={groupNik(nik)} autoFocus
              onChange={(e) => { setNik(e.target.value.replace(/\D/g, "").slice(0, 16)); setNikErr(null); }} />
            <div className="hint">{t("login_nik_hint")} · {nik.length}/16</div>
            {nikErr && <div className="banner critical" style={{ marginTop: 8 }} role="alert">{nikErr}</div>}
          </div>
          <button className="btn btn-primary" type="submit" disabled={nik.length !== 16}>{t("login_next")}</button>
        </form>
      ) : (
        <div className="stack card">
          <div className="center">
            <div className="bold" style={{ fontSize: 20 }}>{t("login_pin_title")}</div>
            <div className="muted small">{t("login_pin_sub")}</div>
            <div className="mono small muted" style={{ marginTop: 6 }}>NIK {groupNik(nik).replace(/^(\d{4} \d{4} )\d{4}/, "$1••••")}</div>
          </div>
          <PinPad onComplete={submitPin} disabled={busy} error={pinErr} resetKey={reset} />
          {busy && <div className="center muted">{t("login_busy")}</div>}
          <button type="button" className="link" onClick={() => { setStep("nik"); setPinErr(null); }}>{t("login_change_nik")}</button>
        </div>
      )}

      <div className="footer">Tandur · {t("tagline")} · {t("ministry")}</div>
    </main>
  );
}
