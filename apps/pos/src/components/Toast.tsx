import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Kind = "info" | "ok" | "err";
interface Toast { id: number; kind: Kind; text: string }
interface ToastApi { show: (text: string, kind?: Kind) => void; ok: (t: string) => void; err: (t: string) => void }

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const show = useCallback((text: string, kind: Kind = "info") => {
    const id = ++seq.current;
    setItems((xs) => [...xs, { id, kind, text }]);
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === "err" ? 5000 : 3000);
  }, []);
  const api = useMemo<ToastApi>(() => ({ show, ok: (t) => show(t, "ok"), err: (t) => show(t, "err") }), [show]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast outside ToastProvider");
  return c;
}
