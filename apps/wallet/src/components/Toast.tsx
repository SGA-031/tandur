import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Kind = "info" | "ok" | "error";
interface Toast { id: number; msg: string; kind: Kind }
interface Ctx { show: (msg: string, kind?: Kind) => void }

const ToastCtx = createContext<Ctx>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const show = useCallback((msg: string, kind: Kind = "info") => {
    const id = ++seq.current;
    setItems((s) => [...s.slice(-2), { id, msg, kind }]);
    window.setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 3600);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() { return useContext(ToastCtx).show; }
