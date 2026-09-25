/**
 * Chart palette for Lumbung. Validated with the dataviz skill's validate_palette.js
 * (light mode, surface #FFFFFF): adjacent + all-pairs PASS, worst CVD ΔE 8.9, normal-vision ΔE 19.4.
 * Hue is fixed per category: it never depends on rank or filter.
 */
import type { CategoryCode } from "@tandur/shared";

export const CATEGORY_COLOR: Record<CategoryCode, string> = {
  PUPUK: "#2F7D4B",     // sawah green
  BENIH: "#C48A12",     // padi gold
  ALSINTAN: "#1D5FA8",  // blue
  PESTISIDA: "#D4457A", // magenta
};
export const CATEGORY_ORDER: CategoryCode[] = ["PUPUK", "BENIH", "ALSINTAN", "PESTISIDA"];

/** Two-series pair (issued vs spent): sawah green + padi gold, validated ΔE 11.0. */
export const SERIES = {
  issued: "#2F7D4B",
  spent: "#C48A12",
  primary: "#2F7D4B",
  deemphasis: "#CFC6B5",
};

export const CHROME = {
  grid: "#E3DCCF",
  axis: "#CFC6B5",
  muted: "#7A7365",
  ink: "#1E1B16",
  surface: "#FFFFFF",
};

export const OTHER_COLOR = "#A8A193";

export function categoryColor(code: string): string {
  return (CATEGORY_COLOR as Record<string, string>)[code] ?? OTHER_COLOR;
}
