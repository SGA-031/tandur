import { Suspense, lazy, useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { onUnauthorized, session } from "./api";
import { getLang } from "./i18n";
import { ToastProvider, useToast } from "./components/Toast";
import { OfflineBanner } from "./components/Shell";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Pay from "./pages/Pay";
import History from "./pages/History";
import Invoice from "./pages/Invoice";
import Inbox from "./pages/Inbox";
import Profile from "./pages/Profile";

const Scan = lazy(() => import("./pages/Scan"));

function RequireAuth({ children }: { children: ReactNode }) {
  const loc = useLocation();
  if (!session.token()) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

function AuthWatcher() {
  const nav = useNavigate();
  const toast = useToast();
  useEffect(() => {
    onUnauthorized(() => { toast(getLang() === "en" ? "Session ended, sign in again" : "Sesi berakhir, masuk lagi", "error"); nav("/login", { replace: true }); });
  }, [nav, toast]);
  return null;
}

export default function App() {
  useEffect(() => { document.documentElement.lang = getLang(); }, []);
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthWatcher />
        <div className="frame">
          <div className="phone">
            <OfflineBanner />
            <Routes>
              <Route path="/login" element={session.token() ? <Navigate to="/" replace /> : <Login />} />
              <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
              <Route path="/scan" element={<RequireAuth><Suspense fallback={<main className="page"><div className="sk" style={{ height: 320, borderRadius: 24 }} /></main>}><Scan /></Suspense></RequireAuth>} />
              <Route path="/pay/:invoiceId" element={<RequireAuth><Pay /></RequireAuth>} />
              <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
              <Route path="/invoice/:id" element={<RequireAuth><Invoice /></RequireAuth>} />
              <Route path="/inbox" element={<RequireAuth><Inbox /></RequireAuth>} />
              <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </ToastProvider>
    </BrowserRouter>
  );
}
