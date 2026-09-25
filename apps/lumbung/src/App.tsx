import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getSession, onSessionChange } from "./api";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Analytics } from "./pages/Analytics";
import { Farmers, FarmerDetail } from "./pages/Farmers";
import { Merchants, MerchantDetail } from "./pages/Merchants";
import { Invoices, InvoiceDetail } from "./pages/Invoices";
import { Ledger } from "./pages/Ledger";
import { Alerts } from "./pages/Alerts";
import { Reconciliation } from "./pages/Reconciliation";
import { Payouts } from "./pages/Payouts";
import { Allocations } from "./pages/Allocations";
import { Catalog } from "./pages/Catalog";
import { Audit } from "./pages/Audit";

export default function App() {
  const [session, setSession] = useState(getSession());
  useEffect(() => onSessionChange(() => setSession(getSession())), []);
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        <Route element={session ? <Layout /> : <Navigate to="/login" replace />}>
          <Route path="/" element={<Overview />} />
          <Route path="/analitik" element={<Analytics />} />
          <Route path="/petani" element={<Farmers />} />
          <Route path="/petani/:id" element={<FarmerDetail />} />
          <Route path="/merchant" element={<Merchants />} />
          <Route path="/merchant/:id" element={<MerchantDetail />} />
          <Route path="/invoice" element={<Invoices />} />
          <Route path="/invoice/:id" element={<InvoiceDetail />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/peringatan" element={<Alerts />} />
          <Route path="/rekonsiliasi" element={<Reconciliation />} />
          <Route path="/penyaluran" element={<Payouts />} />
          <Route path="/alokasi" element={<Allocations />} />
          <Route path="/katalog" element={<Catalog />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
