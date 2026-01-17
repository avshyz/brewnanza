#!/usr/bin/env bun
/**
 * CLI for running the coffee scraper.
 *
 * Scrapes roaster catalogs, diffs against DB, runs AI extraction on new items,
 * and pushes changes to Convex.
 *
 * Usage:
 *   bun run src/cli.ts                    # Scrape all roasters
 *   bun run src/cli.ts lacabra kbcoffee   # Scrape specific roasters
 *   bun run src/cli.ts --list             # List available roasters
 *   bun run src/cli.ts --dry-run          # Preview changes without writing
 *   bun run src/cli.ts -v                 # Verbose output
 */

import { getAllRoasters, getRoaster, type RoasterConfig } from "./config.js";
import type { Coffee, ScrapeResult } from "./models.js";
import {
  qualifyProduct,
  extractDetails,
  applyExtractedDetails,
} from "./ai-extractor.js";

// Import index to register roasters
import "./index.js";

const args = process.argv.slice(2);

// Flags
const verbose = args.includes("-v") || args.includes("--verbose");
const listOnly = args.includes("--list");
const dryRun = args.includes("--dry-run");

// Convex HTTP URL (note: .convex.site for HTTP endpoints, not .convex.cloud)
const CONVEX_SITE_URL =
  process.env.CONVEX_SITE_URL || "https://healthy-dodo-333.convex.site";

// Filter out flags to get roaster IDs
const roasterIds = args.filter((a) => !a.startsWith("-"));

async function pushResult(result: ScrapeResult): Promise<void> {
  const url = `${CONVEX_SITE_URL}/ingest`;

  // Ensure all coffees have required fields with defaults
  const coffees = result.coffees.map((c) => ({
    ...c,
    notes: c.notes ?? [],
    caffeine: c.caffeine ?? null,
  }));

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roasterId: result.roasterId,
      roasterName: result.roasterName,
      coffees,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Failed to push to Convex (${response.status}): ${text}`);
  }

  const data = JSON.parse(text);
  console.log(`  Pushed: ${data.inserted} new, ${data.deactivated} replaced`);
}

interface ActiveUrlEntry {
  url: string;
}

async function fetchActiveUrls(roasterId: string): Promise<Set<string>> {
  const url = `${CONVEX_SITE_URL}/active-urls?roasterId=${encodeURIComponent(roasterId)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch active URLs: ${response.status}`);
  }

  const data: ActiveUrlEntry[] = await response.json();
  return new Set(data.map((d) => d.url));
}

async function updateAvailability(
  roasterId: string,
  updates: Array<{ url: string; prices: Coffee["prices"]; available: boolean }>
): Promise<{ updated: number }> {
  const url = `${CONVEX_SITE_URL}/update-availability`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roasterId, updates }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update availability: ${response.status} ${text}`);
  }

  return response.json();
}

async function deactivateUrls(
  roasterId: string,
  urls: string[]
): Promise<{ deactivated: number }> {
  const url = `${CONVEX_SITE_URL}/deactivate`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roasterId, urls }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to deactivate: ${response.status} ${text}`);
  }

  return response.json();
}

async function fetchProductHtml(productUrl: string): Promise<string> {
  const response = await fetch(productUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${productUrl}: ${response.status}`);
  }
  return response.text();
}

async function syncRoaster(
  config: RoasterConfig,
  isDryRun: boolean,
  isVerbose: boolean
): Promise<{
  updated: number;
  deactivated: number;
  inserted: number;
  skipped: number;
  errors: string[];
}> {
  const errors: string[] = [];

  // 1. Scrape catalog (no AI)
  if (isVerbose) console.log(`  Scraping catalog...`);
  const ScraperClass = config.scraper;
  const scraper = new ScraperClass(config);
  const result = await scraper.run();

  // Apply per-roaster remapper
  for (const coffee of result.coffees) {
    if (config.fieldRemapper) {
      config.fieldRemapper(coffee);
    }
  }

  const catalogMap = new Map<string, Coffee>(
    result.coffees.map((c) => [c.url, c])
  );

  if (isVerbose) console.log(`  Catalog: ${catalogMap.size} products`);

  // 2. Fetch active URLs from DB
  if (isVerbose) console.log(`  Fetching active URLs from DB...`);
  const activeUrls = await fetchActiveUrls(config.id);
  if (isVerbose) console.log(`  DB: ${activeUrls.size} active items`);

  // 3. Classify
  const toUpdate: Array<{ url: string; prices: Coffee["prices"]; available: boolean }> = [];
  const toDeactivate: string[] = [];
  const toInsert: Coffee[] = [];

  for (const [url, coffee] of catalogMap) {
    if (activeUrls.has(url)) {
      // Existing in DB
      if (coffee.available) {
        toUpdate.push({ url, prices: coffee.prices, available: true });
      } else {
        // Sold out → deactivate
        toDeactivate.push(url);
      }
      activeUrls.delete(url);
    } else {
      // New item
      if (coffee.available) {
        toInsert.push(coffee);
      }
      // Skip unavailable new items
    }
  }

  // Remaining activeUrls = removed from catalog → deactivate
  for (const url of activeUrls) {
    toDeactivate.push(url);
  }

  if (isVerbose) {
    console.log(`  To update: ${toUpdate.length}`);
    console.log(`  To deactivate: ${toDeactivate.length}`);
    console.log(`  New items: ${toInsert.length}`);
  }

  if (isDryRun) {
    console.log(`  [DRY RUN] Would update ${toUpdate.length}, deactivate ${toDeactivate.length}, insert ${toInsert.length}`);
    return { updated: 0, deactivated: 0, inserted: 0, skipped: 0, errors };
  }

  // 4. Execute updates
  let updated = 0;
  if (toUpdate.length > 0) {
    if (isVerbose) console.log(`  Updating availability...`);
    const res = await updateAvailability(config.id, toUpdate);
    updated = res.updated;
  }

  // 5. Execute deactivations
  let deactivated = 0;
  if (toDeactivate.length > 0) {
    if (isVerbose) console.log(`  Deactivating removed items...`);
    const res = await deactivateUrls(config.id, toDeactivate);
    deactivated = res.deactivated;
  }

  // 6. AI extract new items
  let inserted = 0;
  let skipped = 0;
  const coffeesToInsert: Coffee[] = [];

  for (const coffee of toInsert) {
    try {
      // Qualify
      const isCoffee = await qualifyProduct(coffee.name);
      if (!isCoffee) {
        if (isVerbose) console.log(`    Skip (not coffee): ${coffee.name}`);
        skipped++;
        continue;
      }

      // Fetch HTML and extract
      if (isVerbose) console.log(`    Extracting: ${coffee.name}`);
      const html = await fetchProductHtml(coffee.url);
      const details = await extractDetails(coffee.url, html);

      if (!details) {
        console.error(`    Failed to extract: ${coffee.url}`);
        errors.push(`Extract failed: ${coffee.url}`);
        continue;
      }

      applyExtractedDetails(coffee, details);
      coffeesToInsert.push(coffee);
    } catch (err) {
      console.error(`    Error processing ${coffee.url}:`, err);
      errors.push(`Error: ${coffee.url} - ${err}`);
    }
  }

  // 7. Push new items
  if (coffeesToInsert.length > 0) {
    if (isVerbose) console.log(`  Inserting ${coffeesToInsert.length} new items...`);
    await pushResult({
      roasterId: config.id,
      roasterName: config.name,
      coffees: coffeesToInsert,
      scrapedAt: new Date().toISOString(),
      errors: [],
    });
    inserted = coffeesToInsert.length;
  }

  return { updated, deactivated, inserted, skipped, errors };
}

async function main() {
  const allRoasters = getAllRoasters();

  if (listOnly) {
    console.log("Available roasters:");
    for (const r of allRoasters) {
      console.log(`  ${r.id.padEnd(20)} ${r.name}`);
    }
    return;
  }

  // Determine which roasters to scrape
  const roastersToScrape =
    roasterIds.length > 0
      ? roasterIds.map((id) => getRoaster(id)).filter(Boolean)
      : allRoasters;

  if (roastersToScrape.length === 0) {
    console.error("No valid roasters specified");
    process.exit(1);
  }

  if (verbose) {
    console.log(`Scraping ${roastersToScrape.length} roaster(s)...`);
    console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
    if (!dryRun) console.log(`Convex: ${CONVEX_SITE_URL}`);
  }

  let totalUpdated = 0;
  let totalDeactivated = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const config of roastersToScrape) {
    if (!config) continue;

    console.log(`\n[${config.name}]`);
    try {
      const stats = await syncRoaster(config, dryRun, verbose);
      totalUpdated += stats.updated;
      totalDeactivated += stats.deactivated;
      totalInserted += stats.inserted;
      totalSkipped += stats.skipped;

      if (stats.errors.length > 0) {
        console.log(`  Errors: ${stats.errors.length}`);
      }
    } catch (error) {
      console.error(`  Failed:`, error);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${totalUpdated}`);
  console.log(`Deactivated: ${totalDeactivated}`);
  console.log(`Inserted: ${totalInserted}`);
  console.log(`Skipped: ${totalSkipped}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
