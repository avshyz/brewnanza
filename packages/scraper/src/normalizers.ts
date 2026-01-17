/**
 * Field normalization functions for coffee data.
 * LLM handles translation and sanitization.
 * This only handles variety name standardization.
 */

import type { Coffee } from "./models.js";
import { normalizeVarietyList } from "./varieties.js";

// --- Variety normalization (standardize naming like SL-28 vs SL28) ---

function normalizeVarietyArray(coffee: Coffee): void {
  if (!coffee.variety || coffee.variety.length === 0) return;
  coffee.variety = normalizeVarietyList(coffee.variety);
}

// --- Global remapper ---

/** Apply variety normalization to a coffee */
export function globalFieldRemapper(coffee: Coffee): void {
  normalizeVarietyArray(coffee);
}
