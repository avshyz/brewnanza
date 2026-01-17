/**
 * AI-enhanced coffee scraper.
 *
 * This scraper combines:
 * 1. Platform scrapers (Shopify, WooCommerce) for catalogue + prices + availability
 * 2. AI qualification (filter out non-coffee products)
 * 3. AI extraction (detailed fields from HTML)
 * 4. Translation to English
 *
 * The split ensures we can:
 * - Update prices/availability frequently without AI costs
 * - Only AI-extract new products (cached by URL)
 * - Mark bundles/subscriptions as skipped
 */

import type { RoasterConfig } from "./config.js";
import type { Coffee } from "./models.js";
import { REQUEST_TIMEOUT, USER_AGENT, REQUEST_DELAY } from "./config.js";
import {
  qualifyProduct,
  extractDetails,
  applyExtractedDetails,
} from "./ai-extractor.js";

// ============================================================================
// HTTP Fetching
// ============================================================================

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// AI-Enhanced Scraper
// ============================================================================

export interface ScrapeOptions {
  /** Skip AI qualification (use platform scraper filtering only) */
  skipQualification?: boolean;
  /** Skip AI detail extraction (use platform scraper data only) */
  skipExtraction?: boolean;
  /** Verbose logging */
  verbose?: boolean;
  /** Max products to process (for testing) */
  limit?: number;
}

export interface ScrapeResult {
  roasterId: string;
  roasterName: string;
  coffees: Coffee[];
  skippedCount: number;
  scrapedAt: string;
  errors: string[];
}

/**
 * Scrape a roaster with AI enhancement.
 *
 * Flow:
 * 1. Platform scraper gets catalogue (products + prices + availability)
 * 2. AI qualifier filters out non-coffee products (marks as skipped)
 * 3. AI extractor gets detailed fields from HTML (cached by URL, includes translation)
 */
export async function scrapeRoasterWithAI(
  config: RoasterConfig,
  options: ScrapeOptions = {}
): Promise<ScrapeResult> {
  const { skipQualification, skipExtraction, verbose, limit } = options;
  const errors: string[] = [];
  let skippedCount = 0;

  const log = verbose ? console.log : () => {};

  // Step 1: Get catalogue from platform scraper
  log(`[${config.id}] Fetching catalogue...`);
  const scraper = new config.scraper(config);
  let coffees = await scraper.scrape();
  log(`[${config.id}] Found ${coffees.length} products in catalogue`);

  // Apply limit if specified
  if (limit && coffees.length > limit) {
    log(`[${config.id}] Limiting to ${limit} products`);
    coffees = coffees.slice(0, limit);
  }

  // Step 2: Qualify products (filter out non-coffee)
  if (!skipQualification) {
    log(`[${config.id}] Qualifying products...`);
    for (const coffee of coffees) {
      try {
        const isCoffee = await qualifyProduct(coffee.name);
        if (!isCoffee) {
          coffee.skipped = true;
          skippedCount++;
          log(`  [SKIP] ${coffee.name}`);
        }
      } catch (error) {
        errors.push(`Qualification error for ${coffee.name}: ${error}`);
      }
    }
    log(`[${config.id}] Qualified: ${coffees.length - skippedCount} coffee, ${skippedCount} skipped`);
  }

  // Step 3: Extract details for non-skipped products
  if (!skipExtraction) {
    const toExtract = coffees.filter((c) => !c.skipped);
    log(`[${config.id}] Extracting details for ${toExtract.length} products...`);

    for (let i = 0; i < toExtract.length; i++) {
      const coffee = toExtract[i];
      log(`  [${i + 1}/${toExtract.length}] ${coffee.name}`);

      try {
        // Fetch HTML
        const html = await fetchHtml(coffee.url);
        await delay(REQUEST_DELAY);

        // Extract details via AI (includes translation and normalization)
        const details = await extractDetails(coffee.url, html);

        if (details) {
          applyExtractedDetails(coffee, details);
          log(`    ✓ Extracted`);
        } else {
          log(`    ✗ No details extracted`);
        }
      } catch (error) {
        errors.push(`Extraction error for ${coffee.url}: ${error}`);
        log(`    ✗ Error: ${error}`);
      }
    }
  }

  return {
    roasterId: config.id,
    roasterName: config.name,
    coffees,
    skippedCount,
    scrapedAt: new Date().toISOString(),
    errors,
  };
}

/**
 * Update prices and availability only (no AI, fast).
 * Use this for frequent updates.
 */
export async function updatePricesOnly(config: RoasterConfig): Promise<Coffee[]> {
  const scraper = new config.scraper(config);
  return scraper.scrape();
}
