import type { BalanceDTO, CategoryCode, InvoiceDTO, InvoiceDocument, VoucherTypeDTO } from "@tandur/shared";

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4600";

const KEY_TOKEN = "tandur.token";
const KEY_FARMER = "tandur.farmer";
const KEY_DEVICE = "tandur.device";
const KEY_NIK = "tandur.nik";

/** Farmer profile as the operator actually returns it (superset of shared FarmerProfileDTO). */
export interface Farmer {
  id: string;
  name: string;
  pseudoId: string;
  address: string;
  nikMasked?: string;
  phone?: string;
  village: string;
  district: string;
  regency?: string;
  province: string;
  regionCode?: string;
  landHa?: number | string;
  commodity?: string;
  status: "active" | "frozen" | string;
  balances: BalanceDTO[];
  totalBalance: number;
}

export interface Coverage { category: CategoryCode; label: string; needed: number; available: number; ok: boolean }
export interface ScanResult { invoice: InvoiceDTO; coverage: Coverage[]; canPay: boolean; frozen: boolean }
export interface PayResult { txHash: string; blockNumber: number; invoice: InvoiceDTO }
export interface ChainEvent { block_number: number; block_time: string; tx_hash: string; log_index?: number; name?: string; args: Record<string, unknown> }
export interface InvoiceDetail { invoice: InvoiceDTO; document: InvoiceDocument | null; events: ChainEvent[] }
export interface Notification { id: string | number; channel: string; body: string; createdAt: string }
export interface VerifyResult {
  hash: string; onChain: boolean; events: ChainEvent[]; documentFound: boolean; documentIntact: boolean | null;
  invoice: { invoiceNo: string; total: number; categoryTotals: Record<string, number>; status: string; merchantId: string } | null;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function safeGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
function safeDel(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

export const session = {
  token(): string | null { return safeGet(KEY_TOKEN); },
  farmer(): Farmer | null { const s = safeGet(KEY_FARMER); if (!s) return null; try { return JSON.parse(s) as Farmer; } catch { return null; } },
  set(token: string, farmer: Farmer) { safeSet(KEY_TOKEN, token); safeSet(KEY_FARMER, JSON.stringify(farmer)); },
  setFarmer(farmer: Farmer) { safeSet(KEY_FARMER, JSON.stringify(farmer)); },
  clear() { safeDel(KEY_TOKEN); safeDel(KEY_FARMER); },
  lastNik(): string { return safeGet(KEY_NIK) ?? ""; },
  rememberNik(nik: string) { safeSet(KEY_NIK, nik); },
  deviceId(): string {
    let id = safeGet(KEY_DEVICE);
    if (!id) {
      const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      id = "wal-" + rnd;
      safeSet(KEY_DEVICE, id);
    }
    return id;
  },
};

let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(fn: () => void) { unauthorizedHandler = fn; }

async function request<T>(path: string, init: RequestInit = {}, opts: { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body) headers["Content-Type"] = "application/json";
  const auth = opts.auth ?? true;
  if (auth) {
    const tok = session.token();
    if (tok) headers.Authorization = `Bearer ${tok}`;
  }
  let res: Response;
  try {
    res = await fetch(API_URL + path, { ...init, headers });
  } catch {
    throw new ApiError(0, "Tidak bisa terhubung ke server. Periksa koneksi internet Anda.");
  }
  let data: unknown = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!res.ok) {
    const msg = (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string")
      ? (data as { error: string }).error
      : `Kesalahan server (${res.status})`;
    if (res.status === 401 && auth && unauthorizedHandler) { session.clear(); unauthorizedHandler(); }
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const api = {
  login(nik: string, pin: string) {
    return request<{ token: string; farmer: Farmer }>("/wallet/login", { method: "POST", body: JSON.stringify({ nik, pin, deviceId: session.deviceId() }) }, { auth: false });
  },
  me() { return request<{ farmer: Farmer; voucherTypes: VoucherTypeDTO[] }>("/wallet/me"); },
  invoices() { return request<{ invoices: InvoiceDTO[] }>("/wallet/invoices"); },
  invoice(id: string) { return request<InvoiceDetail>(`/wallet/invoices/${encodeURIComponent(id)}`); },
  scan(qr: string) { return request<ScanResult>("/wallet/scan", { method: "POST", body: JSON.stringify({ qr }) }); },
  pay(invoiceId: string, pin: string) { return request<PayResult>("/wallet/pay", { method: "POST", body: JSON.stringify({ invoiceId, pin }) }); },
  notifications() { return request<{ notifications: Notification[] }>("/wallet/notifications"); },
  verify(hash: string) { return request<VerifyResult>(`/verify/${encodeURIComponent(hash)}`, {}, { auth: false }); },
  ledgerStatus() { return request<{ chainId: number; blockNumber: number; peers: number; indexedBlock: number }>("/ledger/status", {}, { auth: false }); },
};

/* ---------- Scan cache: lets /pay/:id survive a refresh without re-scanning ---------- */
const KEY_SCAN = "tandur.scan.";
export function cacheScan(r: ScanResult) { try { sessionStorage.setItem(KEY_SCAN + r.invoice.id, JSON.stringify(r)); } catch { /* ignore */ } }
export function cachedScan(id: string): ScanResult | null {
  try { const s = sessionStorage.getItem(KEY_SCAN + id); return s ? (JSON.parse(s) as ScanResult) : null; } catch { return null; }
}
export function dropScan(id: string) { try { sessionStorage.removeItem(KEY_SCAN + id); } catch { /* ignore */ } }
