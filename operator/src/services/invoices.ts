import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalize, computeTotals, encodeTandurQR, invoiceHash, type InvoiceDTO, type InvoiceDocument, type InvoiceLine, type CategoryCode } from "@tandur/shared";
import { q, one } from "../db/index.ts";
import { env } from "../env.ts";

export const INVOICE_TTL_MIN = 15;

export async function expireStale() {
  await q(`UPDATE invoices SET status='expired' WHERE status='pending' AND expires_at < now()`);
}

export async function loadInvoice(id: string) {
  return one(`SELECT i.*, m.name AS merchant_name, m.city AS merchant_city, m.kind AS merchant_kind, m.address AS merchant_address, m.region_code AS merchant_region,
                     f.name AS farmer_name
              FROM invoices i JOIN merchants m ON m.id = i.merchant_id LEFT JOIN farmers f ON f.id = i.farmer_id WHERE i.id = $1`, [id]);
}

export function toDTO(r: any, opts: { withQr?: boolean } = {}): InvoiceDTO {
  const dto: InvoiceDTO = {
    id: r.id, invoiceNo: r.invoice_no, status: r.status, mode: r.mode,
    merchant: { id: r.merchant_id, name: r.merchant_name, city: r.merchant_city, type: r.merchant_kind },
    farmerId: r.farmer_id ?? undefined, farmerName: r.farmer_name ?? undefined,
    lines: r.lines, categoryTotals: r.category_totals, total: r.total, hash: r.hash,
    txHash: r.tx_hash ?? undefined, blockNumber: r.block_number ?? undefined,
    createdAt: new Date(r.created_at).toISOString(), paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : undefined,
    expiresAt: new Date(r.expires_at).toISOString(),
    payoutId: r.payout_id ?? undefined,
  };
  if (opts.withQr && r.status === "pending") dto.qr = buildQr(r);
  return dto;
}

export function buildQr(r: any): string {
  return encodeTandurQR({
    merchantAddress: r.merchant_address, invoiceId: r.id, invoiceNo: r.invoice_no, amount: r.total,
    merchantName: r.merchant_name, merchantCity: r.merchant_city, invoiceHash: r.hash,
    expiresAt: Math.floor(new Date(r.expires_at).getTime() / 1000),
    categoryTotals: r.category_totals,
  });
}

export function documentPath(hash: string) {
  return path.join(env.STORAGE_DIR, "invoices", hash.replace(/^0x/, "").slice(0, 2), `${hash.replace(/^0x/, "")}.json`);
}

/** Content-addressed, write-once document store (production: object storage with object lock). */
export function writeDocument(doc: InvoiceDocument, hash: string): string {
  const p = documentPath(hash);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (!fs.existsSync(p)) fs.writeFileSync(p, canonicalize(doc), { flag: "wx" });
  return path.relative(env.STORAGE_DIR, p);
}

export function readDocument(hash: string): InvoiceDocument | null {
  const p = documentPath(hash);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

export async function createInvoice(merchantId: string, items: { sku: string; qty: number }[], opts: { createdAt?: Date; ttlMin?: number } = {}) {
  const merchant = await one(`SELECT * FROM merchants WHERE id=$1 AND status='active'`, [merchantId]);
  if (!merchant) throw new Error("Merchant tidak aktif");
  if (items.length === 0) throw new Error("Keranjang kosong");
  const skus = items.map((i) => i.sku);
  const products = await q(`SELECT * FROM products WHERE sku = ANY($1) AND active`, [skus]);
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const lines: InvoiceLine[] = items.map((i) => {
    const p = bySku.get(i.sku);
    if (!p) throw new Error(`Produk ${i.sku} tidak ada di katalog`);
    if (!Number.isInteger(i.qty) || i.qty <= 0 || i.qty > 500) throw new Error(`Jumlah tidak valid untuk ${p.name}`);
    return { sku: p.sku, name: p.name, category: p.category as CategoryCode, unit: p.unit, qty: i.qty, unitPrice: p.het_price, lineTotal: p.het_price * i.qty };
  });
  const { categoryTotals, total } = computeTotals(lines);
  const createdAt = opts.createdAt ?? new Date();
  const expiresAt = new Date(createdAt.getTime() + (opts.ttlMin ?? INVOICE_TTL_MIN) * 60_000);
  const day = createdAt.toISOString().slice(0, 10).replace(/-/g, "");
  const seq = await one<{ n: number }>(`INSERT INTO invoice_counters (merchant_id, day, n) VALUES ($1,$2,1) ON CONFLICT (merchant_id, day) DO UPDATE SET n = invoice_counters.n + 1 RETURNING n`, [merchantId, day]);
  const invoiceNo = `INV-${merchantId.replace(/^(KDMP|KIOS|DIST)-/, "")}-${day}-${String(seq!.n).padStart(4, "0")}`;
  const id = crypto.randomUUID();
  const doc: InvoiceDocument = {
    version: 1, invoiceNo, invoiceId: id, issuedAt: createdAt.toISOString(),
    merchant: { id: merchant.id, name: merchant.name, address: merchant.address, regionCode: merchant.region_code },
    lines, categoryTotals, total, currency: "IDR",
  };
  const hash = await invoiceHash(doc);
  // Build the QR before persisting anything so an un-encodable invoice never leaves an orphaned row.
  buildQr({ merchant_address: merchant.address, id, invoice_no: invoiceNo, total, merchant_name: merchant.name, merchant_city: merchant.city, hash, expires_at: expiresAt, category_totals: categoryTotals });
  const docPath = writeDocument(doc, hash);
  await q(
    `INSERT INTO invoices (id, invoice_no, merchant_id, status, lines, category_totals, total, document, hash, doc_path, created_at, expires_at)
     VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, invoiceNo, merchantId, JSON.stringify(lines), JSON.stringify(categoryTotals), total, JSON.stringify(doc), hash, docPath, createdAt, expiresAt],
  );
  return loadInvoice(id);
}
