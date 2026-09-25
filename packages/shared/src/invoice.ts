import type { CategoryCode } from "./categories";

export interface InvoiceLine {
  sku: string;
  name: string;
  category: CategoryCode;
  unit: string;        // e.g. "karung 50kg"
  qty: number;
  unitPrice: number;   // IDR, must be <= HET ceiling
  lineTotal: number;   // qty * unitPrice
}

/** The canonical invoice document. Its SHA-256 hash is what goes on-chain. */
export interface InvoiceDocument {
  version: 1;
  invoiceNo: string;          // human-readable, e.g. INV-KDMP001-20260925-0007
  invoiceId: string;          // uuid
  issuedAt: string;           // ISO-8601 UTC
  merchant: { id: string; name: string; address: string; regionCode: string };
  // No farmer identity here: the on-chain Spent event binds the farmer's pseudonymous account to this hash.
  lines: InvoiceLine[];
  categoryTotals: Partial<Record<CategoryCode, number>>;
  total: number;
  currency: "IDR";
  evidence?: { photoHash?: string; geo?: { lat: number; lng: number } };
}

/** Deterministic JSON: keys sorted recursively, no whitespace. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return "0x" + Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The invoice hash committed on-chain: sha256 over the canonical JSON of the document. */
export async function invoiceHash(doc: InvoiceDocument): Promise<string> {
  return sha256Hex(canonicalize(doc));
}

export function computeTotals(lines: InvoiceLine[]) {
  const categoryTotals: Partial<Record<CategoryCode, number>> = {};
  let total = 0;
  for (const l of lines) {
    categoryTotals[l.category] = (categoryTotals[l.category] ?? 0) + l.lineTotal;
    total += l.lineTotal;
  }
  return { categoryTotals, total };
}
