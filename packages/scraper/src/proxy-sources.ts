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
import {
  fetchBeanGeekRoastery,
  fetchBeanGeekCoffee,
  BEANGEEK_ROASTER_MAP,
  type BeanGeekCoffee,
} from "./beangeek.js";

// ============================================================================
// Types
// ============================================================================

export interface ProxySource {
  id: string;
  name: string;
  platform: "shopify" | "woocommerce";
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

interface WooCommerceProduct {
  id: number;
  name: string;
  slug: string;
  description: string;
  short_description: string;
}

/** Normalized product for internal matching */
interface NormalizedProduct {
  title: string;
  bodyHtml: string;
}

type ProxyCatalog = NormalizedProduct[];

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
  {
    id: "mygodshot",
    name: "My God Shot",
    platform: "woocommerce",
    apiUrl: "https://mygodshot.com/wp-json/wc/store/v1/products",
    roasterIds: ["dak"],
    skipWords: ["dak", "mygodshot", "god", "shot"],
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
const proxyCache = new Map<string, ProxyCatalog>();

/**
 * Fetch Shopify catalog and normalize.
 */
async function fetchShopifyCatalog(source: ProxySource): Promise<ProxyCatalog> {
  const response = await fetch(`${source.apiUrl}?limit=250`, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data: ShopifyProductsResponse = await response.json();
  return data.products.map((p) => ({
    title: p.title,
    bodyHtml: p.body_html || "",
  }));
}

/**
 * Fetch WooCommerce catalog and normalize.
 */
async function fetchWooCommerceCatalog(source: ProxySource): Promise<ProxyCatalog> {
  const response = await fetch(`${source.apiUrl}?per_page=100`, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data: WooCommerceProduct[] = await response.json();
  return data.map((p) => ({
    title: p.name,
    bodyHtml: p.description || p.short_description || "",
  }));
}

/**
 * Fetch and cache products from a proxy source.
 */
async function fetchProxyCatalog(source: ProxySource): Promise<ProxyCatalog> {
  if (proxyCache.has(source.id)) {
    return proxyCache.get(source.id)!;
  }

  try {
    const products =
      source.platform === "woocommerce"
        ? await fetchWooCommerceCatalog(source)
        : await fetchShopifyCatalog(source);

    proxyCache.set(source.id, products);
    return products;
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
  beanGeekCache.clear();
}

// ============================================================================
// Bean Geek Integration (for DAK only)
// ============================================================================

/** Cache of Bean Geek coffee data */
const beanGeekCache = new Map<string, BeanGeekCoffee[]>();

/**
 * Format Bean Geek data as HTML for AI extraction.
 * This creates clean, structured HTML that the AI can easily parse.
 */
function formatBeanGeekAsHtml(coffee: BeanGeekCoffee): string {
  const notes = coffee.notes.length > 0
    ? `<p>Tasting Notes: ${coffee.notes.join(", ")}</p>`
    : "";

  return `
    <html>
    <head><title>${coffee.name}</title></head>
    <body>
      <h1>${coffee.name}</h1>
      <div class="product-description">
        ${coffee.country ? `<p>Origin: ${coffee.country}</p>` : ""}
        ${coffee.variety ? `<p>Variety: ${coffee.variety}</p>` : ""}
        ${coffee.processing ? `<p>Processing: ${coffee.processing}</p>` : ""}
        ${coffee.altitude ? `<p>Altitude: ${coffee.altitude}m</p>` : ""}
        ${notes}
        ${coffee.type ? `<p>Type: ${coffee.type}</p>` : ""}
        ${coffee.roastedFor.length > 0 ? `<p>Roasted for: ${coffee.roastedFor.join(", ")}</p>` : ""}
      </div>
    </body>
    </html>
  `;
}

/**
 * Search Bean Geek for a matching coffee (DAK only).
 */
async function searchBeanGeek(
  coffeeName: string,
  roasterId: string,
  verbose = false
): Promise<ProxyMatch | null> {
  // Only use Bean Geek for DAK
  if (roasterId !== "dak") {
    return null;
  }

  const bgSlug = BEANGEEK_ROASTER_MAP[roasterId];
  if (!bgSlug) return null;

  // Fetch and cache Bean Geek coffees
  if (!beanGeekCache.has(roasterId)) {
    try {
      if (verbose) console.log(`    [beangeek] Fetching catalog...`);
      const roastery = await fetchBeanGeekRoastery(bgSlug);

      // Fetch all coffee details (with rate limiting built into fetchBeanGeekCoffee)
      const coffees: BeanGeekCoffee[] = [];
      for (const { slug } of roastery.coffees) {
        try {
          const coffee = await fetchBeanGeekCoffee(slug);
          coffees.push(coffee);
        } catch {
          // Skip failed fetches
        }
      }

      beanGeekCache.set(roasterId, coffees);
      if (verbose) console.log(`    [beangeek] Cached ${coffees.length} coffees`);
    } catch (err) {
      if (verbose) console.log(`    [beangeek] Error fetching catalog: ${err}`);
      beanGeekCache.set(roasterId, []);
      return null;
    }
  }

  const coffees = beanGeekCache.get(roasterId) || [];

  // Extract tokens from query
  const queryTokens = extractCoreTokens(coffeeName, ["dak"]);
  if (queryTokens.size === 0) return null;

  if (verbose) {
    console.log(`    [beangeek] Searching for: ${coffeeName}`);
    console.log(`    [beangeek] Query tokens: ${[...queryTokens].join(", ")}`);
  }

  // Search for match
  for (const coffee of coffees) {
    const bgTokens = extractCoreTokens(coffee.name, ["dak"]);

    if (tokensMatch(queryTokens, bgTokens)) {
      if (verbose) {
        console.log(`    [beangeek] Match found: "${coffee.name}"`);
        console.log(`    [beangeek] Notes: ${coffee.notes.join(", ")}`);
      }

      return {
        html: formatBeanGeekAsHtml(coffee),
        source: "The Bean Geek",
        productTitle: coffee.name,
      };
    }
  }

  if (verbose) {
    console.log(`    [beangeek] No match found`);
  }

  return null;
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
  // Try Bean Geek first for DAK (has pre-extracted tasting notes)
  if (roasterId === "dak") {
    const bgMatch = await searchBeanGeek(coffeeName, roasterId, verbose);
    if (bgMatch) return bgMatch;
  }

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

        // Return the bodyHtml wrapped in a basic HTML structure
        const html = `
          <html>
          <head><title>${product.title}</title></head>
          <body>
            <h1>${product.title}</h1>
            <div class="product-description">
              ${product.bodyHtml}
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
