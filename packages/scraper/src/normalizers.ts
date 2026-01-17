/**
 * Field normalization functions for coffee data.
 * All origin fields are arrays to support blends.
 */

import type { Coffee } from "./models.js";
import { normalizeCountry } from "./countries.js";
import { normalizeVarietyList } from "./varieties.js";

// --- Process normalization ---

const PROCESS_MAP: Record<string, string> = {
  lavé: "washed",
  lave: "washed",
  naturel: "natural",
  washed: "washed",
  natural: "natural",
  honey: "honey",
  anaerobic: "anaerobic",
};

function normalizeProcessArray(coffee: Coffee): void {
  if (!coffee.process || coffee.process.length === 0) return;

  coffee.process = coffee.process.map((proc) => {
    const lower = proc.toLowerCase().trim();
    for (const [pattern, normalized] of Object.entries(PROCESS_MAP)) {
      if (lower.startsWith(pattern)) {
        const rest = proc.slice(pattern.length).trim();
        return rest ? `${normalized} ${rest}` : normalized;
      }
    }
    return lower;
  });
}

// --- Variety normalization ---

function normalizeVarietyArray(coffee: Coffee): void {
  if (!coffee.variety || coffee.variety.length === 0) return;
  coffee.variety = normalizeVarietyList(coffee.variety);
}

// --- Country normalization ---

function normalizeCountryArray(coffee: Coffee): void {
  if (!coffee.country || coffee.country.length === 0) return;

  coffee.country = coffee.country
    .map((c) => normalizeCountry(c) || c)
    .filter((c) => c && c.length > 0);
}

// --- Global remapper ---

/** Apply all global normalizations to a coffee */
export function globalFieldRemapper(coffee: Coffee): void {
  normalizeProcessArray(coffee);
  normalizeVarietyArray(coffee);
  normalizeCountryArray(coffee);
}
