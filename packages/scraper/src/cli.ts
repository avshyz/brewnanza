#!/usr/bin/env bun
/**
 * CLI for running the coffee scraper.
 *
 * Usage:
 *   bun run src/cli.ts                    # Scrape all roasters
 *   bun run src/cli.ts lacabra kbcoffee   # Scrape specific roasters
 *   bun run src/cli.ts --list             # List available roasters
 *   bun run src/cli.ts -v --stdout        # Verbose + output to stdout
 *   bun run src/cli.ts --push             # Push to Convex
 *   bun run src/cli.ts --translate        # Translate non-English content
 */

import { getAllRoasters, getRoaster } from "./config.js";
import { globalFieldRemapper } from "./normalizers.js";
import { translateCoffees } from "./translate.js";
import type { ScrapeResult } from "./models.js";

// Import index to register roasters
import "./index.js";

const args = process.argv.slice(2);

// Flags
const verbose = args.includes("-v") || args.includes("--verbose");
const toStdout = args.includes("--stdout");
const listOnly = args.includes("--list");
const pushToConvex = args.includes("--push");
const doTranslate = args.includes("--translate");

// Convex HTTP URL (note: .convex.site for HTTP endpoints, not .convex.cloud)
const CONVEX_SITE_URL =
  process.env.CONVEX_SITE_URL || "https://healthy-dodo-333.convex.site";

// Filter out flags to get roaster IDs
const roasterIds = args.filter((a) => !a.startsWith("-"));

async function pushResult(result: ScrapeResult): Promise<void> {
  const url = `${CONVEX_SITE_URL}/ingest`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roasterId: result.roasterId,
      roasterName: result.roasterName,
      coffees: result.coffees,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Failed to push to Convex (${response.status}): ${text}`);
  }

  const data = JSON.parse(text);
  console.log(`  Pushed: ${data.inserted} new, ${data.updated} updated`);
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
    if (pushToConvex) {
      console.log(`Will push to Convex: ${CONVEX_SITE_URL}`);
    }
  }

  const results: ScrapeResult[] = [];

  for (const config of roastersToScrape) {
    if (!config) continue;

    if (verbose) {
      console.log(`\nScraping ${config.name}...`);
    }

    const ScraperClass = config.scraper;
    const scraper = new ScraperClass(config);

    try {
      const result = await scraper.run();

      // Apply global normalizations
      for (const coffee of result.coffees) {
        globalFieldRemapper(coffee);
        // Apply per-roaster remapper if defined
        if (config.fieldRemapper) {
          config.fieldRemapper(coffee);
        }
      }

      // Translate non-English content if requested
      if (doTranslate) {
        await translateCoffees(result.coffees, config.id);
      }

      results.push(result);

      if (verbose) {
        console.log(`  Found ${result.coffees.length} coffees`);
        if (result.errors.length > 0) {
          console.log(`  Errors: ${result.errors.join(", ")}`);
        }
      }

      // Push to Convex if requested
      if (pushToConvex && result.coffees.length > 0) {
        try {
          await pushResult(result);
        } catch (error) {
          console.error(`  Failed to push to Convex:`, error);
        }
      }
    } catch (error) {
      console.error(`Error scraping ${config.name}:`, error);
      results.push({
        roasterId: config.id,
        roasterName: config.name,
        coffees: [],
        scrapedAt: new Date().toISOString(),
        errors: [String(error)],
      });
    }
  }

  // Output results
  const output = {
    scrapedAt: new Date().toISOString(),
    results,
    totalCoffees: results.reduce((sum, r) => sum + r.coffees.length, 0),
  };

  if (toStdout) {
    console.log(JSON.stringify(output, null, 2));
  } else if (!pushToConvex) {
    // Write to output directory (skip if pushing to Convex)
    const fs = await import("fs/promises");
    const outputDir = "output";
    await fs.mkdir(outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${outputDir}/scrape-${timestamp}.json`;
    await fs.writeFile(filename, JSON.stringify(output, null, 2));

    console.log(`\nResults written to ${filename}`);
  }

  console.log(`Total coffees: ${output.totalCoffees}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
