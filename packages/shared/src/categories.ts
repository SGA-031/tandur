/** Voucher categories. Codes are stable identifiers used on-chain (bytes32 of the code) and off-chain. */
export type CategoryCode = "PUPUK" | "BENIH" | "ALSINTAN" | "PESTISIDA";

export interface Category {
  code: CategoryCode;
  id: string;      // Bahasa Indonesia label
  en: string;      // English label
  short: string;   // 1-word label for tight UI
  icon: string;    // emoji fallback icon
}

export const CATEGORIES: Category[] = [
  { code: "PUPUK", id: "Pupuk", en: "Fertilizer", short: "Pupuk", icon: "🌱" },
  { code: "BENIH", id: "Benih & Bibit", en: "Seeds & seedlings", short: "Benih", icon: "🌾" },
  { code: "ALSINTAN", id: "Alat & Mesin Pertanian", en: "Tools & machinery", short: "Alsintan", icon: "🔧" },
  { code: "PESTISIDA", id: "Pestisida & Obat Tanaman", en: "Crop protection", short: "Pestisida", icon: "🧪" },
];

export const CATEGORY_BY_CODE: Record<CategoryCode, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.code, c]),
) as Record<CategoryCode, Category>;
