import type { CategoryCode } from "./categories";
import type { InvoiceLine } from "./invoice";

/** DTOs shared by operator API and the three front-ends. */
export interface VoucherTypeDTO {
  typeId: number;
  category: CategoryCode;
  season: string;        // e.g. "MT1 2026/27"
  validFrom: string;
  validUntil: string;
  perFarmerCap: number;
}

export interface BalanceDTO {
  typeId: number;
  category: CategoryCode;
  season: string;
  balance: number;
  issued: number;
  spent: number;
  validUntil: string;
}

export interface FarmerProfileDTO {
  id: string;
  name: string;
  pseudoId: string;
  address: string;
  village: string;
  district: string;
  province: string;
  regionCode: string;
  status: "active" | "frozen";
  balances: BalanceDTO[];
  totalBalance: number;
}

export type InvoiceStatus = "pending" | "paid" | "expired" | "cancelled" | "failed";

export interface InvoiceDTO {
  id: string;
  invoiceNo: string;
  status: InvoiceStatus;
  merchant: { id: string; name: string; city: string; type: string };
  farmerId?: string;
  farmerName?: string;
  lines: InvoiceLine[];
  categoryTotals: Partial<Record<CategoryCode, number>>;
  total: number;
  hash: string;
  txHash?: string;
  blockNumber?: number;
  createdAt: string;
  paidAt?: string;
  expiresAt: string;
  qr?: string;
  mode?: "scan" | "assisted";
  payoutId?: string;
}

export interface ProductDTO {
  sku: string;
  name: string;
  category: CategoryCode;
  unit: string;
  hetPrice: number;   // Harga Eceran Tertinggi: government ceiling price
  brand?: string;
}

export interface LedgerStatusDTO {
  chainId: number;
  blockNumber: number;
  peers: number;
  validators: string[];
  voucherAddress: string;
  registryAddress: string;
  indexedBlock: number;
}
