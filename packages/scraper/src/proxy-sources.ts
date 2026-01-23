/**
 * Proxy sources for SPA roasters.
 *
 * Some roasters (DAK, YouNeedCoffee) use SPAs that require Playwright rendering.
 * This is slow. Proxy sources are resellers with easier APIs (Shopify) that
 * carry the same coffees - we can fetch product descriptions from them instead.
 *
 * Flow:
 * 1. Scrape catalog from original roaster (names, prices, URLs)
 * 2. For new items needing AI extraction:
 *    a. Search proxy sources for matching coffee
 *    b. If found → use proxy's HTML description
 *    c. If not found → fall back to Playwright
 */

import { USER_AGENT } from "./config.js";

// ============================================================================
// Types
// ============================================================================

export interface ProxySource {
  id: string;
  name: string;
  platform: "shopify";
  apiUrl: string;
  /** Roaster IDs this source carries */
  roasterIds: string[];
  /** Words to skip when matching (roaster names) */
  skipWords: string[];
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  variants: Array<{
    price: string;
    available: boolean;
  }>;
}

interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

// ============================================================================
// Configuration
// ============================================================================

export const PROXY_SOURCES: ProxySource[] = [
  {
    id: "sigmacoffee",
    name: "Sigma Coffee UK",
    platform: "shopify",
    apiUrl: "https://sigmacoffee.co.uk/products.json",
    roasterIds: ["dak", "hydrangea", "tanat"],
    skipWords: ["dak", "hydrangea", "tanat", "sigma"],
  },
  {
    id: "dayglow",
    name: "Dayglow",
    platform: "shopify",
    apiUrl: "https://dayglow.coffee/products.json",
    roasterIds: ["dak", "morgon", "luna", "quo", "fritz"],
    skipWords: ["dak", "morgon", "luna", "quo", "fritz", "dayglow"],
  },
  // NOTE: The Origin (theorigin.co.il) has YouNeedCoffee products but uses
  // Hebrew titles only. Would need transliteration or LLM matching to use.
];

/** Words to always skip when matching (roast types, marketing terms) */
const GLOBAL_SKIP_WORDS = new Set([
  // Roast types
  "filter",
  "espresso",
  "omni",
  "decaf",
  "decaffeinated",
  // Marketing/edition terms
  "limited",
  "edition",
  "birthday",
  "coffee",
  "christmas",
  "valentines",
  "valentine",
  "day",
  "special",
  "reserve",
  "reserva",
]);

/** Common coffee-producing countries */
const COUNTRIES = new Set([
  "ethiopia",
  "colombia",
  "kenya",
  "rwanda",
  "brazil",
  "guatemala",
  "costa",
  "rica",
  "costarica",
  "honduras",
  "peru",
  "nicaragua",
  "el",
  "salvador",
  "elsalvador",
  "panama",
  "burundi",
  "tanzania",
  "uganda",
  "yemen",
  "indonesia",
  "sumatra",
  "java",
  "vietnam",
  "mexico",
  "bolivia",
  "ecuador",
  "congo",
  "malawi",
  "zambia",
  "myanmar",
  "thailand",
  "china",
  "india",
  "png",
  "papua",
  "guinea",
]);

// ============================================================================
// Matching Logic
// ============================================================================

/**
 * Extract core tokens from a coffee name for matching.
 * Removes weights, countries, roaster names, and marketing terms.
 *
 * Examples:
 *   "DAK - Milky Cake | Colombia (200g)" → Set{"milky", "cake"}
 *   "Milky Cake - Colombia" → Set{"milky", "cake"}
 *   "Colombia MILKY CAKE - filter" → Set{"milky", "cake"}
 */
export function extractCoreTokens(
  name: string,
  sourceSkipWords: string[] = []
): Set<string> {
  // Extract alphanumeric words only
  const words = name.match(/[a-zA-Z0-9]+/g) || [];

  const skipWordsSet = new Set([
    ...GLOBAL_SKIP_WORDS,
    ...sourceSkipWords.map((w) => w.toLowerCase()),
  ]);

  const tokens = new Set<string>();

  for (const word of words) {
    const lower = word.toLowerCase();

    // Skip weight patterns like "200g", "1kg", "250"
    if (/^\d+g?$/.test(lower) || /^\d+kg$/.test(lower)) continue;

    // Skip configured words
    if (skipWordsSet.has(lower)) continue;

    // Skip countries
    if (COUNTRIES.has(lower)) continue;

    tokens.add(lower);
  }

  return tokens;
}

/**
 * Check if two token sets match exactly.
 */
function tokensMatch(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const token of a) {
    if (!b.has(token)) return false;
  }
  return true;
}

// ============================================================================
// Proxy Source Cache
// ============================================================================

/** Cache of fetched proxy catalogs (per scrape run) */
const proxyCache = new Map<string, ShopifyProduct[]>();

/**
 * Fetch and cache products from a proxy source.
 */
async function fetchProxyCatalog(source: ProxySource): Promise<ShopifyProduct[]> {
  if (proxyCache.has(source.id)) {
    return proxyCache.get(source.id)!;
  }

  try {
    const response = await fetch(`${source.apiUrl}?limit=250`, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      console.warn(`  [proxy] Failed to fetch ${source.name}: ${response.status}`);
      proxyCache.set(source.id, []);
      return [];
    }

    const data: ShopifyProductsResponse = await response.json();
    proxyCache.set(source.id, data.products);
    return data.products;
  } catch (err) {
    console.warn(`  [proxy] Error fetching ${source.name}:`, err);
    proxyCache.set(source.id, []);
    return [];
  }
}

/**
 * Clear the proxy cache (call at start of each scrape run).
 */
export function clearProxyCache(): void {
  proxyCache.clear();
}

// ============================================================================
// Main Search Function
// ============================================================================

export interface ProxyMatch {
  html: string;
  source: string;
  productTitle: string;
}

/**
 * Search proxy sources for a matching coffee.
 *
 * @param coffeeName - The coffee name from the original roaster
 * @param roasterId - The roaster ID (to find relevant proxy sources)
 * @param verbose - Whether to log match attempts
 * @returns The proxy product's body_html if found, null otherwise
 */
export async function searchProxySources(
  coffeeName: string,
  roasterId: string,
  verbose = false
): Promise<ProxyMatch | null> {
  // Find proxy sources that carry this roaster
  const relevantSources = PROXY_SOURCES.filter((s) =>
    s.roasterIds.includes(roasterId)
  );

  if (relevantSources.length === 0) {
    return null;
  }

  // Extract tokens from the query coffee name
  // Use all source skip words combined for the query
  const allSkipWords = relevantSources.flatMap((s) => s.skipWords);
  const queryTokens = extractCoreTokens(coffeeName, allSkipWords);

  if (queryTokens.size === 0) {
    if (verbose) console.log(`    [proxy] No tokens extracted from: ${coffeeName}`);
    return null;
  }

  if (verbose) {
    console.log(`    [proxy] Searching for: ${coffeeName}`);
    console.log(`    [proxy] Query tokens: ${[...queryTokens].join(", ")}`);
  }

  // Search each proxy source
  for (const source of relevantSources) {
    const products = await fetchProxyCatalog(source);

    for (const product of products) {
      const productTokens = extractCoreTokens(product.title, source.skipWords);

      if (tokensMatch(queryTokens, productTokens)) {
        if (verbose) {
          console.log(`    [proxy] Match found in ${source.name}: "${product.title}"`);
        }

        // Return the body_html wrapped in a basic HTML structure
        const html = `
          <html>
          <head><title>${product.title}</title></head>
          <body>
            <h1>${product.title}</h1>
            <div class="product-description">
              ${product.body_html || ""}
            </div>
          </body>
          </html>
        `;

        return {
          html,
          source: source.name,
          productTitle: product.title,
        };
      }
    }
  }

  if (verbose) {
    console.log(`    [proxy] No match found for: ${coffeeName}`);
  }

  return null;
}

/**
 * Check if a roaster has proxy sources available.
 */
export function hasProxySources(roasterId: string): boolean {
  return PROXY_SOURCES.some((s) => s.roasterIds.includes(roasterId));
}
