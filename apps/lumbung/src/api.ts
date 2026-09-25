export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4600";

export interface AdminUser { username: string; name: string; role: "ministry" | "operator" | "auditor" | string }

const KEY = "lumbung.session";
let session: { token: string; admin: AdminUser } | null = null;
try { const raw = localStorage.getItem(KEY); if (raw) session = JSON.parse(raw); } catch { session = null; }

const listeners = new Set<() => void>();
export function onSessionChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function getSession() { return session; }
export function setSession(s: typeof session) {
  session = s;
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && session) headers.Authorization = `Bearer ${session.token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Tidak dapat terhubung ke server operator");
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Kesalahan ${res.status}`;
    if (res.status === 401 && auth && session) setSession(null);
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  login: async (username: string, password: string) => {
    const r = await request<{ token: string; admin: AdminUser }>("POST", "/admin/login", { username, password }, false);
    setSession(r);
    return r;
  },
  logout: () => setSession(null),
};

/* ---------- Response shapes (from operator/src/routes/admin.ts) ---------- */
export interface ChainEvent { id?: number; blockNumber: number; blockTime: string; txHash: string; logIndex?: number; contract?: string; name: string; args: Record<string, unknown> }
export interface LedgerStatus { chainId: number; blockNumber: number; peers: number; validators: string[]; voucherAddress: string; registryAddress: string; indexedBlock: number }
export interface Overview {
  farmers: { total: number; active: number };
  merchants: { total: number; active: number; kdmp: number };
  budget: { issued: number; spent: number; redeemed: number; clawback: number; expired: number; outstanding: number; merchantReceivable: number; utilisation: number };
  activation: { farmersIssued: number; farmersSpent: number; rate: number };
  daily: { day: string; invoices: number; total: string | number }[];
  byCategory: { category: string; total: string | number; invoices: number }[];
  issuedByCategory: { category: string; issued: string | number }[];
  byProvince: { province: string; invoices: number; total: string | number; farmers: number }[];
  issuedByProvince: { province: string; issued: string | number; farmers: number }[];
  topMerchants: { id: string; name: string; kind: string; regency: string; province: string; invoices: number; total: string | number }[];
  topProducts: { sku: string; name: string; category: string; qty: number; total: string | number }[];
  alerts: { severity: string; n: number }[];
  recentEvents: ChainEvent[];
  ledger: LedgerStatus;
}
export interface Farmer {
  id: string; name: string; pseudoId: string; nikMasked: string; phone: string | null; village: string; district: string; regency: string; province: string; regionCode: string;
  landHa: string | number; commodity: string; address: string; status: "active" | "frozen"; createdAt: string;
  spent?: string | number; invoices?: number; issued?: string | number; frozenOnChain?: boolean;
}
export interface Merchant {
  id: string; name: string; kind: string; city: string; district: string; regency: string; province: string; regionCode: string; lat: number | null; lng: number | null; address: string;
  username: string; bankAccount: string | null; status: "active" | "suspended" | string; createdAt: string;
  spent?: string | number; invoices?: number; farmers?: number; openAlerts?: number; receivable?: number; frozenOnChain?: boolean;
}
export interface Alert { id: number; severity: "info" | "warning" | "serious" | "critical"; rule: string; subjectKind: string; subjectId: string; subjectName: string | null; detail: string; evidence: unknown; status: "open" | "reviewing" | "closed"; createdAt: string }
export interface Payout { id: string; merchantId: string; merchantName?: string; bankAccount?: string | null; amount: string | number; byType: Record<string, number>; txHashes: string[]; bankRef: string | null; status: string; createdAt: string }
export interface VoucherType { typeId: number; category: string; season: string; validFrom: string; validUntil: string; perFarmerCap: string | number; txHash: string | null; issued: string | number; spent: string | number }
export interface Allocation { id: string; title: string; typeId: number; category: string; season: string; farmerCount: number; totalAmount: string | number; txHashes: string[]; createdBy: string; createdAt: string }
export interface Product { sku: string; name: string; brand: string | null; category: string; unit: string; hetPrice: string | number; active: boolean }
export interface AuditEntry { id: number; actor: string; action: string; target: string | null; detail: unknown; createdAt: string }
export interface Reconciliation {
  checkedAt: string; indexedBlock: number;
  rows: { typeId: number; category: string; season: string; onChainSupply: number; issued: number; spent: number; redeemed: number; clawback: number; expired: number; expectedSupply: number; supplyOk: boolean }[];
  ledger: { invoicesPaid: number; spentEvents: number; ok: boolean };
  settlement: { payouts: number; redeemedEvents: number; ok: boolean; merchantReceivable: number };
  allOk: boolean;
}
