/**
 * Centralized configuration for coffee scrapers.
 * Ported from Python's config.py
 */

import type { BaseScraper, ScraperConstructor } from "./scrapers/base.js";
import type { DetailScraper, DetailScraperConstructor } from "./scrapers/detail/base.js";
import type { Coffee } from "./models.js";

export interface RoasterConfig {
  id: string;
  name: string;
  baseUrl: string;
  collectionUrl: string;
  scraper: ScraperConstructor;
  apiUrl?: string;
  categoryFilter?: string;
  detailScraper?: DetailScraperConstructor;
  currency: string;
  fieldRemapper?: (coffee: Coffee) => void;
}

// HTTP settings
export const REQUEST_TIMEOUT = 30000; // 30 seconds
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
export const REQUEST_DELAY = 500; // 0.5 seconds

// Output settings
export const OUTPUT_DIR = "output";

// Defaults
export const DEFAULT_WEIGHT_GRAMS = 250;
export const DEFAULT_CURRENCY = "EUR";

// Product types to skip (non-coffee merchandise)
export const SKIP_PRODUCT_TYPES = new Set([
  "merchandise",
  "equipment",
  "tools",
  "subscription box",
  "livres",
  "bouilloire",
  "machine filtre",
  "tee shirt",
  "matériels",
  "accessoires",
  "gift card",
  "carte cadeau",
  "brewing",
  "merch",
  "gear",
]);

// Tags that indicate non-coffee products
export const SKIP_TAGS = new Set([
  "bundle",
  "gift card",
  "giftcard",
  "subscription",
  "equipment",
  "capsules",
]);

// Field extraction regex patterns
export const FIELD_PATTERNS: Record<string, string> = {
  country:
    "(?:^|\\n)\\s*(?:Country(?: of Origin)?|Origin|Origine|Location)\\s*:\\s*\\n?\\s*([^\\n]+)",
  region: "(?:^|\\n)\\s*(?:Region|Région)\\s*:\\s*\\n?\\s*([^\\n]+)",
  producer: "(?:^|\\n)\\s*(?:Producer|Farmer|Producteur)\\s*:\\s*\\n?\\s*([^\\n]+)",
  farm: "(?:^|\\n)\\s*(?:Farm|Ferme|Estate|Finca)\\s*:\\s*\\n?\\s*([^\\n]+)",
  altitude: "(?:^|\\n)\\s*(?:(?:Growing )?Altitude|Elevation)\\s*:\\s*\\n?\\s*([^\\n]+)",
  process: "(?:^|\\n)\\s*(?:Process(?:ing)?(?: Method)?|Procédé)\\s*:\\s*\\n?\\s*([^\\n]+)",
  variety:
    "(?:^|\\n)\\s*(?:Variety|Varietal|Varieties|Variétés|Varietés)\\s*:\\s*\\n?\\s*([^\\n]+)",
  notes:
    "(?:^|\\n)\\s*(?:Flavou?r Notes|Tasting Notes|Notes|Tastes Like|Notes de dégustation)\\s*:\\s*\\n?\\s*([^\\n]+)",
};

// Roaster configs - will be populated by importing scrapers
let _roastersCache: Map<string, RoasterConfig> | null = null;

export function getConfig(): Map<string, RoasterConfig> {
  if (_roastersCache) return _roastersCache;

  // Lazy import to avoid circular dependencies
  // This will be populated once scrapers are loaded
  _roastersCache = new Map();
  return _roastersCache;
}

export function registerRoaster(config: RoasterConfig): void {
  if (!_roastersCache) _roastersCache = new Map();
  _roastersCache.set(config.id, config);
}

export function getRoaster(id: string): RoasterConfig | undefined {
  return getConfig().get(id);
}

export function getAllRoasters(): RoasterConfig[] {
  return [...getConfig().values()];
}
