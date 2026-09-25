interface Props { value: string; onChange: (v: string) => void; length?: number; disabled?: boolean }

export function PinPad({ value, onChange, length = 6, disabled }: Props) {
  const push = (d: string) => { if (!disabled && value.length < length) onChange(value + d); };
  const pop = () => { if (!disabled) onChange(value.slice(0, -1)); };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return (
    <div>
      <div className="pin-dots" aria-label={`PIN ${value.length} dari ${length} digit`}>
        {Array.from({ length }, (_, i) => <i key={i} className={i < value.length ? "on" : ""} />)}
      </div>
      <div className="pinpad">
        {keys.map((k) => <button key={k} type="button" onClick={() => push(k)} disabled={disabled}>{k}</button>)}
        <button type="button" className="fn" onClick={() => onChange("")} disabled={disabled}>Hapus</button>
        <button type="button" onClick={() => push("0")} disabled={disabled}>0</button>
        <button type="button" className="fn" onClick={pop} disabled={disabled} aria-label="Hapus satu">⌫</button>
      </div>
    </div>
  );
}
