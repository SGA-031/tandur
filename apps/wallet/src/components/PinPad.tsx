import { useEffect, useState } from "react";
import { useT } from "../i18n";

interface Props {
  length?: number;
  onComplete: (pin: string) => void;
  disabled?: boolean;
  error?: string | null;
  /** bump this to clear the pad from outside */
  resetKey?: number;
}

export function PinPad({ length = 6, onComplete, disabled, error, resetKey }: Props) {
  const { t } = useT();
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => { setPin(""); }, [resetKey]);
  useEffect(() => {
    if (!error) return;
    setShake(true);
    const id = window.setTimeout(() => setShake(false), 450);
    return () => window.clearTimeout(id);
  }, [error]);

  const push = (d: string) => {
    if (disabled || pin.length >= length) return;
    const next = pin + d;
    setPin(next);
    if (next.length === length) onComplete(next);
  };
  const back = () => setPin((p) => p.slice(0, -1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return;
      if (/^\d$/.test(e.key)) push(e.key);
      else if (e.key === "Backspace") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, disabled]);

  return (
    <div>
      <div className={`pin-dots ${shake ? "shake" : ""} ${error ? "err" : ""}`} aria-label={`${pin.length}/${length}`}>
        {Array.from({ length }).map((_, i) => <i key={i} className={i < pin.length ? "on" : ""} />)}
      </div>
      {error && <div className="banner critical" style={{ marginBottom: 12 }} role="alert">{error}</div>}
      <div className="pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => push(d)} disabled={disabled} aria-label={d}>{d}</button>
        ))}
        <button type="button" className="fn" onClick={() => setPin("")} disabled={disabled || pin.length === 0}>{t("pin_clear")}</button>
        <button type="button" onClick={() => push("0")} disabled={disabled} aria-label="0">0</button>
        <button type="button" className="fn" onClick={back} disabled={disabled || pin.length === 0} aria-label={t("pin_delete")}>⌫</button>
      </div>
    </div>
  );
}
