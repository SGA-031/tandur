import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, RequireAuth } from "./components/Auth";
import { ToastProvider } from "./components/Toast";
import { Header } from "./components/Header";
import { LoginPage } from "./pages/Login";
import { KasirPage } from "./pages/Kasir";
import { InvoicePage } from "./pages/Invoice";
import { TransactionsPage } from "./pages/Transactions";
import { SettlementPage } from "./pages/Settlement";

function Shell() {
  return (
    <RequireAuth>
      <div className="app">
        <Header />
        <Outlet />
      </div>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<Shell />}>
              <Route path="/" element={<KasirPage />} />
              <Route path="/invoice/:id" element={<InvoicePage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/settlement" element={<SettlementPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
