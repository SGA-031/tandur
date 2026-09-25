import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AUTH_EVENT, api, session, type MerchantDTO } from "../api";

interface AuthApi {
  merchant: MerchantDTO | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}
const Ctx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [merchant, setMerchant] = useState<MerchantDTO | null>(() => (session.token ? session.merchant : null));

  useEffect(() => {
    const onUnauth = () => setMerchant(null);
    window.addEventListener(AUTH_EVENT, onUnauth);
    return () => window.removeEventListener(AUTH_EVENT, onUnauth);
  }, []);

  // Refresh merchant profile on boot so the header reflects server truth.
  useEffect(() => {
    if (!session.token) return;
    api.me().then((r) => { session.set(session.token!, r.merchant); setMerchant(r.merchant); }).catch(() => { /* 401 handled via event */ });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api.login(username, password);
    session.set(r.token, r.merchant);
    setMerchant(r.merchant);
  }, []);
  const logout = useCallback(() => { session.clear(); setMerchant(null); }, []);
  const value = useMemo(() => ({ merchant, login, logout }), [merchant, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { merchant } = useAuth();
  const loc = useLocation();
  if (!merchant) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}
