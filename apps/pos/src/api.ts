import type { CategoryCode, InvoiceDTO, InvoiceStatus } from "@tandur/shared";

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4600";

export interface MerchantDTO {
  id: string;
  name: string;
  kind: "kdmp" | "kios" | string;
  city: string;
  district: string;
  regency: string;
  province: string;
  address: string;
  bankAccount: string;
  status: string;
}

export interface CatalogProduct {
  sku: string;
  name: string;
  brand?: string | null;
  category: CategoryCode;
  unit: string;
  hetPrice: number;
}

export interface PayoutDTO {
  id: string;
  amount: number;
  byType: Record<string, number> | null;
  txHashes: string[] | null;
  bankRef: string | null;
  status: string;
  createdAt: string;
}

export interface SummaryDTO {
  today: { n: number; total: number | string };
  all: { n: number; total: number | string };
  receivable: Partial<Record<CategoryCode, number>>;
  receivableTotal: number;
  unsettled?: { n: number; total: number | string };
  payouts: PayoutDTO[];
  byDay: { day: string; n: number; total: number | string }[];
}

export interface AssistedResult {
  txHash: string;
  blockNumber: number;
  invoice: InvoiceDTO;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "tandur.pos.token";
const MERCHANT_KEY = "tandur.pos.merchant";

export const session = {
  get token(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  get merchant(): MerchantDTO | null {
    try {
      const raw = localStorage.getItem(MERCHANT_KEY);
      return raw ? (JSON.parse(raw) as MerchantDTO) : null;
    } catch { return null; }
  },
  set(token: string, merchant: MerchantDTO) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(MERCHANT_KEY, JSON.stringify(merchant));
    } catch { /* private mode */ }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(MERCHANT_KEY);
    } catch { /* ignore */ }
  },
};

/** Fired when the operator answers 401 so the app can drop to /login. */
export const AUTH_EVENT = "tandur:unauthorized";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...(init.headers as Record<string, string> | undefined) };
  if (init.body) headers["Content-Type"] = "application/json";
  const token = session.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Tidak bisa terhubung ke server operator. Periksa koneksi.");
  }
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { error: text }; }
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/pos/login")) {
      session.clear();
      window.dispatchEvent(new Event(AUTH_EVENT));
    }
    const msg = (data as { error?: string } | null)?.error ?? `Kesalahan ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; merchant: MerchantDTO }>("/pos/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  me: () => request<{ merchant: MerchantDTO }>("/pos/me"),
  catalog: () => request<{ products: CatalogProduct[] }>("/pos/catalog"),
  createInvoice: (items: { sku: string; qty: number }[]) =>
    request<{ invoice: InvoiceDTO }>("/pos/invoices", { method: "POST", body: JSON.stringify({ items }) }),
  getInvoice: (id: string) => request<{ invoice: InvoiceDTO }>(`/pos/invoices/${encodeURIComponent(id)}`),
  cancelInvoice: (id: string) => request<{ invoice: InvoiceDTO }>(`/pos/invoices/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  assistedPay: (id: string, nik: string, pin: string) =>
    request<AssistedResult>(`/pos/invoices/${encodeURIComponent(id)}/assisted`, { method: "POST", body: JSON.stringify({ nik, pin }) }),
  listInvoices: (opts: { status?: InvoiceStatus | ""; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.status) p.set("status", opts.status);
    if (opts.limit) p.set("limit", String(opts.limit));
    const qs = p.toString();
    return request<{ invoices: InvoiceDTO[] }>(`/pos/invoices${qs ? `?${qs}` : ""}`);
  },
  summary: () => request<SummaryDTO>("/pos/summary"),
};

/* ---------- small helpers shared by pages ---------- */

export function shortHash(h?: string | null, n = 6): string {
  if (!h) return "";
  return h.length > n * 2 + 4 ? `${h.slice(0, n + 2)}…${h.slice(-n)}` : h;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

const TZ = "Asia/Jakarta";
export function fmtTime(iso?: string | null): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
}
export function fmtDate(iso?: string | null): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }).format(new Date(iso));
}
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
}
export function isToday(iso?: string | null): boolean {
  if (!iso) return false;
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date(iso)) === f.format(new Date());
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  pending: "Menunggu pembayaran",
  paid: "Dibayar",
  expired: "Kedaluwarsa",
  cancelled: "Dibatalkan",
  failed: "Gagal",
};
export const MODE_LABEL: Record<string, string> = { scan: "Pindai QR", assisted: "Mode Bantuan" };
