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
 *   bun run src/cli.ts --clear-db         # Clear all coffees and roasters
 *   bun run src/cli.ts --sample 3         # Limit to N new items (saves API costs)
 *   bun run src/cli.ts -v                 # Verbose output
 */

// Load .env.local from monorepo root
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dir, "../../../.env.local") });

import pLimit from "p-limit";
import { getAllRoasters, getRoaster, type RoasterConfig } from "./config.js";
import type { Coffee, ScrapeResult } from "./models.js";
import {
  qualifyProduct,
  extractDetails,
  applyExtractedDetails,
} from "./ai-extractor.js";
import type { BaseScraper } from "./scrapers/base.js";
import {
  searchProxySources,
  hasProxySources,
  clearProxyCache,
} from "./proxy-sources.js";

// Import index to register roasters
import "./index.js";

const args = process.argv.slice(2);

// Flags
const verbose = args.includes("-v") || args.includes("--verbose");
const listOnly = args.includes("--list");
const dryRun = args.includes("--dry-run");
const clearDb = args.includes("--clear-db");
const forceAi = args.includes("--force-ai");

// Sample limit: --sample N limits new items to N (saves API costs during testing)
const sampleIdx = args.findIndex((a) => a === "--sample");
const sampleLimit = sampleIdx !== -1 && args[sampleIdx + 1]
  ? parseInt(args[sampleIdx + 1], 10)
  : Infinity;

// Convex HTTP URL (note: .convex.site for HTTP endpoints, not .convex.cloud)
const CONVEX_SITE_URL =
  process.env.CONVEX_SITE_URL || "https://healthy-dodo-333.convex.site";

// Filter out flags and their values to get roaster IDs
const roasterIds = args.filter((a, i) => {
  if (a.startsWith("-")) return false;
  // Skip value after --sample
  if (i > 0 && args[i - 1] === "--sample") return false;
  return true;
});

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

interface DbCoffee {
  url: string;
  name: string;
  country: string[];
  region: string[];
  producer: string[];
  process: string[];
  protocol: string[];
  variety: string[];
  notes: string[];
  caffeine: "decaf" | "lowcaf" | null;
  roastLevel: "light" | "medium" | "dark" | null;
  roastedFor: "filter" | "espresso" | null;
}

async function fetchDbCoffees(roasterId: string): Promise<Map<string, DbCoffee>> {
  const url = `${CONVEX_SITE_URL}/coffees?roasterId=${encodeURIComponent(roasterId)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch coffees: ${response.status}`);
  }

  const data: DbCoffee[] = await response.json();
  return new Map(data.map((c) => [c.url, c]));
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

/** Print all extracted fields for a coffee */
function printCoffeeDetails(coffee: Coffee, dbCoffee?: DbCoffee): void {
  console.log(`\n  [${coffee.name}]`);
  console.log(`    url: ${coffee.url}`);
  console.log(`    country: ${JSON.stringify(coffee.country)}`);
  console.log(`    region: ${JSON.stringify(coffee.region)}`);
  console.log(`    producer: ${JSON.stringify(coffee.producer)}`);
  console.log(`    process: ${JSON.stringify(coffee.process)}`);
  console.log(`    variety: ${JSON.stringify(coffee.variety)}`);
  console.log(`    notes: ${JSON.stringify(coffee.notes)}`);
  console.log(`    caffeine: ${coffee.caffeine}`);
  console.log(`    roastLevel: ${coffee.roastLevel}`);
  console.log(`    roastedFor: ${coffee.roastedFor}`);

  if (dbCoffee) {
    const fields = ["country", "region", "producer", "process", "variety", "notes", "caffeine", "roastLevel", "roastedFor"] as const;
    const mismatches: string[] = [];

    for (const field of fields) {
      const extracted = coffee[field];
      const db = dbCoffee[field];
      const match = JSON.stringify(extracted) === JSON.stringify(db);
      if (!match) {
        mismatches.push(`${field} (DB: ${JSON.stringify(db)})`);
      }
    }

    if (mismatches.length === 0) {
      console.log(`    DB match: all fields ✓`);
    } else {
      console.log(`    DB mismatch: ${mismatches.join(", ")}`);
    }
  }
}

async function syncRoaster(
  config: RoasterConfig,
  isDryRun: boolean,
  isVerbose: boolean,
  maxNewItems: number = Infinity,
  isForceAi: boolean = false
): Promise<{
  updated: number;
  deactivated: number;
  inserted: number;
  skipped: number;
  errors: string[];
  timing?: { total: number; aiExtraction: number; itemCount: number };
  comparison?: { matched: number; mismatched: number };
}> {
  const errors: string[] = [];

  // 1. Scrape catalog (no AI)
  if (isVerbose) console.log(`  Scraping catalog...`);
  const ScraperClass = config.scraper;
  const scraper = new ScraperClass(config) as BaseScraper & { fetchRenderedHtml?: (url: string) => Promise<string> };
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

  // For --force-ai: treat ALL available catalog items as needing extraction
  const forceAiItems: Coffee[] = isForceAi
    ? Array.from(catalogMap.values()).filter((c) => c.available)
    : [];

  if (isForceAi && isVerbose) {
    console.log(`  [FORCE-AI] Processing ${forceAiItems.length} items for AI extraction`);
  }

  if (isDryRun && !isForceAi) {
    console.log(`  [DRY RUN] Would update ${toUpdate.length}, deactivate ${toDeactivate.length}, insert ${toInsert.length}`);
    return { updated: 0, deactivated: 0, inserted: 0, skipped: 0, errors };
  }

  const startTime = Date.now();
  let aiExtractionTime = 0;

  // 4. Execute updates (skip in dry-run)
  let updated = 0;
  if (!isDryRun && toUpdate.length > 0) {
    if (isVerbose) console.log(`  Updating availability...`);
    const res = await updateAvailability(config.id, toUpdate);
    updated = res.updated;
  }

  // 5. Execute deactivations (skip in dry-run)
  let deactivated = 0;
  if (!isDryRun && toDeactivate.length > 0) {
    if (isVerbose) console.log(`  Deactivating removed items...`);
    const res = await deactivateUrls(config.id, toDeactivate);
    deactivated = res.deactivated;
  }

  // 6. AI extract items
  // In force-ai mode: extract ALL available items
  // Otherwise: only extract new items
  let inserted = 0;
  let skipped = 0;
  const coffeesToInsert: Coffee[] = [];
  const itemsToProcess = isForceAi
    ? forceAiItems.slice(0, maxNewItems)
    : toInsert.slice(0, maxNewItems);

  if (itemsToProcess.length < (isForceAi ? forceAiItems.length : toInsert.length) && isVerbose) {
    console.log(`  Limiting to ${maxNewItems} items (--sample)`);
  }

  // Pre-qualify items in parallel
  const toExtract: Coffee[] = [];
  const needsQualification: Coffee[] = [];

  for (const coffee of itemsToProcess) {
    // In force-ai mode, always extract (ignore already-enriched check)
    if (isForceAi) {
      needsQualification.push(coffee);
    } else {
      // Skip AI extraction only if notes already filled (notes require AI)
      const alreadyEnriched = coffee.notes.length > 0;
      if (alreadyEnriched) {
        if (isVerbose) console.log(`    Pre-enriched: ${coffee.name}`);
        coffeesToInsert.push(coffee);
      } else {
        needsQualification.push(coffee);
      }
    }
  }

  if (needsQualification.length > 0) {
    if (isVerbose) console.log(`  Qualifying ${needsQualification.length} items...`);
    const qualifyLimit = pLimit(10);
    const qualifyResults = await Promise.all(
      needsQualification.map((coffee) =>
        qualifyLimit(async () => {
          const isCoffee = await qualifyProduct(coffee.name);
          return { coffee, isCoffee };
        })
      )
    );

    for (const { coffee, isCoffee } of qualifyResults) {
      if (!isCoffee) {
        if (isVerbose) console.log(`    Skip (not coffee): ${coffee.name}`);
        skipped++;
      } else {
        toExtract.push(coffee);
      }
    }
  }

  // Fetch HTML for AI extraction
  // Priority: 1) Proxy sources (fast), 2) SPA rendering (slow), 3) Simple fetch
  const scraperWithBatch = scraper as BaseScraper & { fetchSpaHtmlBatch?: (urls: string[]) => Promise<Map<string, string>> };
  let htmlMap: Map<string, string> = new Map();

  if (toExtract.length > 0) {
    // Step 1: Try proxy sources first (for SPA roasters like DAK)
    const needsSpaFetch: Coffee[] = [];
    const needsSimpleFetch: Coffee[] = [];

    if (hasProxySources(config.id)) {
      if (isVerbose) console.log(`  Checking proxy sources for ${toExtract.length} items...`);

      for (const coffee of toExtract) {
        const proxyMatch = await searchProxySources(coffee.name, config.id, isVerbose);
        if (proxyMatch) {
          htmlMap.set(coffee.url, proxyMatch.html);
          if (isVerbose) console.log(`    ✓ Proxy: ${coffee.name} → ${proxyMatch.source}`);
        } else {
          // No proxy match - need SPA fetch
          needsSpaFetch.push(coffee);
        }
      }

      if (isVerbose && needsSpaFetch.length > 0) {
        console.log(`  ${needsSpaFetch.length} items need SPA rendering`);
      }
    } else if (scraperWithBatch.fetchSpaHtmlBatch) {
      // SPA scraper without proxy sources - all items need SPA fetch
      needsSpaFetch.push(...toExtract);
    } else {
      // Non-SPA scraper - all items need simple fetch
      needsSimpleFetch.push(...toExtract);
    }

    // Step 2: SPA rendering for items not found in proxy
    if (scraperWithBatch.fetchSpaHtmlBatch && needsSpaFetch.length > 0) {
      if (isVerbose) console.log(`  Fetching ${needsSpaFetch.length} product pages via SPA...`);
      const spaHtmlMap = await scraperWithBatch.fetchSpaHtmlBatch(needsSpaFetch.map((c) => c.url));
      for (const [url, html] of spaHtmlMap) {
        htmlMap.set(url, html);
      }
    } else if (needsSpaFetch.length > 0) {
      // Fallback: SPA items without SPA capability go to simple fetch
      needsSimpleFetch.push(...needsSpaFetch);
    }

    // Step 3: Simple fetch for non-SPA scrapers
    if (needsSimpleFetch.length > 0) {
      if (isVerbose) console.log(`  Fetching ${needsSimpleFetch.length} product pages...`);
      const htmlLimit = pLimit(10);
      const htmlEntries = await Promise.all(
        needsSimpleFetch.map((c) =>
          htmlLimit(async () => {
            try {
              const html = await fetchProductHtml(c.url);
              return [c.url, html] as const;
            } catch (err) {
              errors.push(`Fetch failed: ${c.url}`);
              return [c.url, ""] as const;
            }
          })
        )
      );
      for (const [url, html] of htmlEntries) {
        htmlMap.set(url, html);
      }
    }
  }

  // Fetch DB coffees for comparison (only in force-ai + verbose mode)
  let dbCoffees: Map<string, DbCoffee> | null = null;
  if (isForceAi && isVerbose) {
    try {
      dbCoffees = await fetchDbCoffees(config.id);
      if (isVerbose) console.log(`  Fetched ${dbCoffees.size} coffees from DB for comparison`);
    } catch (err) {
      console.log(`  Warning: Could not fetch DB coffees for comparison: ${err}`);
    }
  }

  // Extract details from each coffee in parallel
  const extractedCoffees: Coffee[] = [];
  if (toExtract.length > 0) {
    if (isVerbose) console.log(`  Extracting ${toExtract.length} items...`);
    const aiStartTime = Date.now();
    const aiLimit = pLimit(5); // Claude rate limit ~50 req/min
    const extractResults = await Promise.all(
      toExtract.map((coffee) =>
        aiLimit(async () => {
          try {
            const html = htmlMap?.get(coffee.url) || "";
            if (!html) {
              return { coffee, success: false, error: `No HTML for ${coffee.url}` };
            }

            const details = await extractDetails(coffee.url, html);
            if (!details) {
              return { coffee, success: false, error: `Extract failed: ${coffee.url}` };
            }

            applyExtractedDetails(coffee, details);
            return { coffee, success: true, error: null };
          } catch (err) {
            return { coffee, success: false, error: `Error: ${coffee.url} - ${err}` };
          }
        })
      )
    );
    aiExtractionTime = Date.now() - aiStartTime;

    for (const result of extractResults) {
      if (result.success) {
        extractedCoffees.push(result.coffee);
        if (!isForceAi) {
          coffeesToInsert.push(result.coffee);
        }
      } else if (result.error) {
        if (isVerbose) console.log(`    ${result.error}`);
        errors.push(result.error);
      }
    }
  }

  // Verbose output and DB comparison
  let matched = 0;
  let mismatched = 0;
  if (isVerbose && extractedCoffees.length > 0) {
    for (const coffee of extractedCoffees) {
      const dbCoffee = dbCoffees?.get(coffee.url);
      printCoffeeDetails(coffee, dbCoffee);

      if (dbCoffee) {
        const fields = ["country", "region", "producer", "process", "variety", "notes", "caffeine", "roastLevel", "roastedFor"] as const;
        const hasMismatch = fields.some(
          (f) => JSON.stringify(coffee[f]) !== JSON.stringify(dbCoffee[f])
        );
        if (hasMismatch) {
          mismatched++;
        } else {
          matched++;
        }
      }
    }
  }

  // 7. Push new items (skip in dry-run)
  if (!isDryRun && coffeesToInsert.length > 0) {
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

  const totalTime = Date.now() - startTime;

  return {
    updated,
    deactivated,
    inserted,
    skipped,
    errors,
    timing: { total: totalTime, aiExtraction: aiExtractionTime, itemCount: extractedCoffees.length },
    comparison: dbCoffees ? { matched, mismatched } : undefined,
  };
}

async function clearAllData(): Promise<void> {
  const url = `${CONVEX_SITE_URL}/clear-all`;
  const response = await fetch(url, { method: "POST" });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to clear DB: ${response.status} ${text}`);
  }

  const result = await response.json();
  console.log(`Cleared: ${result.coffeesDeleted} coffees, ${result.roastersDeleted} roasters`);
}

async function main() {
  // Clear proxy cache at start of run
  clearProxyCache();

  const allRoasters = getAllRoasters();

  if (clearDb) {
    await clearAllData();
    return;
  }

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
    console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}${forceAi ? " + FORCE-AI" : ""}`);
    if (!dryRun) console.log(`Convex: ${CONVEX_SITE_URL}`);
  }

  // Run roasters in parallel (different domains, no rate limit needed)
  const roasterLimit = pLimit(5);
  const results = await Promise.all(
    roastersToScrape
      .filter((config): config is RoasterConfig => config !== undefined)
      .map((config) =>
        roasterLimit(async () => {
          console.log(`\n[${config.name}]`);
          try {
            const stats = await syncRoaster(config, dryRun, verbose, sampleLimit, forceAi);
            if (stats.errors.length > 0) {
              console.log(`  [${config.name}] Errors: ${stats.errors.length}`);
            }
            return stats;
          } catch (error) {
            console.error(`  [${config.name}] Failed:`, error);
            return { updated: 0, deactivated: 0, inserted: 0, skipped: 0, errors: [String(error)] };
          }
        })
      )
  );

  // Aggregate results
  const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
  const totalDeactivated = results.reduce((sum, r) => sum + r.deactivated, 0);
  const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

  // Aggregate timing
  const totalTime = results.reduce((sum, r) => sum + (r.timing?.total || 0), 0);
  const totalAiTime = results.reduce((sum, r) => sum + (r.timing?.aiExtraction || 0), 0);
  const totalItems = results.reduce((sum, r) => sum + (r.timing?.itemCount || 0), 0);

  // Aggregate comparison
  const totalMatched = results.reduce((sum, r) => sum + (r.comparison?.matched || 0), 0);
  const totalMismatched = results.reduce((sum, r) => sum + (r.comparison?.mismatched || 0), 0);
  const hasComparison = results.some((r) => r.comparison);

  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${totalUpdated}`);
  console.log(`Deactivated: ${totalDeactivated}`);
  console.log(`Inserted: ${totalInserted}`);
  console.log(`Skipped: ${totalSkipped}`);

  if (totalItems > 0) {
    console.log(`\n=== Timing ===`);
    console.log(`Total: ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`AI extraction: ${(totalAiTime / 1000).toFixed(1)}s (${totalItems} items, avg ${(totalAiTime / totalItems / 1000).toFixed(2)}s/item)`);
  }

  if (hasComparison) {
    console.log(`\n=== Comparison ===`);
    console.log(`Matched: ${totalMatched}/${totalMatched + totalMismatched}`);
    console.log(`Mismatched: ${totalMismatched}`);
  }

  // Exit explicitly - Anthropic SDK keeps HTTP connections alive
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
