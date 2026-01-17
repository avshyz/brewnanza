/**
 * Coffee variety normalization using fuzzy matching.
 * Ported from Python's varieties.py (rapidfuzz -> fuzzysort)
 */

import fuzzysort from "fuzzysort";

// Known coffee varieties (Arabica cultivars)
export const KNOWN_VARIETIES = new Set([
  // Ethiopian Heirloom / Landrace
  "Heirloom",
  "Ethiopian Landrace",
  "Dega",
  "Kudhume",
  "Wolisho",
  // Bourbon lineage
  "Bourbon",
  "Red Bourbon",
  "Yellow Bourbon",
  "Pink Bourbon",
  "Orange Bourbon",
  "Bourbon Pointu",
  "Laurina",
  "SL-28",
  "SL-34",
  "SL-14",
  "Pacas",
  "Villa Sarchi",
  "Caturra",
  "Catuaí",
  "Yellow Catuaí",
  "Red Catuaí",
  "Mundo Novo",
  "Acaiá",
  // Typica lineage
  "Typica",
  "Blue Mountain",
  "Java",
  "Kona",
  "Maragogipe",
  "Maragogype",
  "San Ramon",
  "Amarello",
  "Sumatra",
  "Kent",
  "Pache",
  "Pache Común",
  "Bergundal",
  // Ethiopian cultivars (JARC selections)
  "JARC 74110",
  "JARC 74112",
  "JARC 74158",
  "JARC 74165",
  "74110",
  "74112",
  "74158",
  "74165",
  // Gesha/Geisha
  "Gesha",
  "Geisha",
  // Hybrids and modern varieties
  "Catimor",
  "Sarchimor",
  "Castillo",
  "Colombia",
  "Cenicafé 1",
  "Tabi",
  "Obatã",
  "Tupi",
  "Icatu",
  "Ruiru 11",
  "Batian",
  "K7",
  "Marsellesa",
  "Parainema",
  "Lempira",
  "IHCAFE 90",
  "H1",
  "Centroamericano",
  // F1 Hybrids
  "Starmaya",
  "Evaluna",
  "Nayarita",
  "Mundo Maya",
  // Sudan Rume and derivatives
  "Sudan Rume",
  "Rume Sudan",
  // Other notable varieties
  "Pacamara",
  "Maracaturra",
  "Mokka",
  "Mocca",
  "SL-9",
  "Sidra",
  "Wush Wush",
  "Jimma",
  // Regional varieties
  "S795",
  "S288",
  "Chandragiri",
  "Selection 9",
  // Robusta
  "Robusta",
  "Canephora",
]);

// Mapping for common misspellings and aliases
const VARIETY_ALIASES: Record<string, string> = {
  geisha: "Gesha",
  gesha: "Gesha",
  catuai: "Catuaí",
  catuaí: "Catuaí",
  sl28: "SL-28",
  "sl-28": "SL-28",
  "sl 28": "SL-28",
  sl34: "SL-34",
  "sl-34": "SL-34",
  "sl 34": "SL-34",
  sl14: "SL-14",
  "sl-14": "SL-14",
  "sl 14": "SL-14",
  sl9: "SL-9",
  "sl-9": "SL-9",
  maragogype: "Maragogipe",
  heirloom: "Heirloom",
  bourbon: "Bourbon",
  caturra: "Caturra",
  typica: "Typica",
  castillo: "Castillo",
  "jarc 74112": "JARC 74112",
  jarc74112: "JARC 74112",
  "74112": "JARC 74112",
  "jarc 74110": "JARC 74110",
  jarc74110: "JARC 74110",
  "74110": "JARC 74110",
};

const VARIETY_THRESHOLD = -5000; // fuzzysort uses negative scores (higher = better)

const varietyCache = new Map<string, string>();
const varietyTargets = fuzzysort.prepare([...KNOWN_VARIETIES].join("\n"));

/**
 * Normalize a coffee variety name using fuzzy matching.
 */
export function normalizeVariety(raw: string): string {
  if (!raw) return raw;

  if (varietyCache.has(raw)) {
    return varietyCache.get(raw)!;
  }

  const key = raw.trim().toLowerCase();

  // Check direct aliases first
  if (key in VARIETY_ALIASES) {
    const result = VARIETY_ALIASES[key];
    varietyCache.set(raw, result);
    return result;
  }

  // Try fuzzy matching against known varieties
  const results = fuzzysort.go(raw, [...KNOWN_VARIETIES], {
    threshold: VARIETY_THRESHOLD,
    limit: 1,
  });

  if (results.length > 0 && results[0].score > VARIETY_THRESHOLD) {
    const result = results[0].target;
    varietyCache.set(raw, result);
    return result;
  }

  // No good match - return original (title-cased for consistency)
  const result = raw === raw.toLowerCase() ? toTitleCase(raw) : raw;
  varietyCache.set(raw, result);
  return result;
}

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
}

/**
 * Normalize a list of variety names.
 */
export function normalizeVarietyList(varieties: string[] | null | undefined): string[] {
  if (!varieties || varieties.length === 0) return [];
  return varieties.map(normalizeVariety);
}
