import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api";

/** Fetch with keep-previous-data on refetch (no skeleton flash). */
export function useFetch<T>(fn: () => Promise<T>, deps: unknown[], opts: { poll?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn); fnRef.current = fn;
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fnRef.current().then((d) => { if (alive) { setData(d); setError(null); } }).catch((e: unknown) => { if (alive) setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  useEffect(() => {
    if (!opts.poll) return;
    const id = setInterval(reload, opts.poll);
    return () => clearInterval(id);
  }, [opts.poll, reload]);
  return { data, error, loading, reload, setData };
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}
