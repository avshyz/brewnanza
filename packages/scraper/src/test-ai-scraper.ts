#!/usr/bin/env bun
/**
 * Test the AI-enhanced scraper on La Cabra.
 *
 * Usage:
 *   bun run src/test-ai-scraper.ts           # Test with 3 products
 *   bun run src/test-ai-scraper.ts --all     # Test all products
 */

import { getRoaster } from "./config.js";
import { scrapeRoasterWithAI } from "./ai-scraper.js";
import { globalFieldRemapper } from "./normalizers.js";

// Import index to register roasters
import "./index.js";

const args = process.argv.slice(2);
const processAll = args.includes("--all");
const limit = processAll ? undefined : 3;

async function main() {
  const config = getRoaster("lacabra");
  if (!config) {
    console.error("La Cabra config not found");
    process.exit(1);
  }

  console.log("=".repeat(80));
  console.log("AI-ENHANCED SCRAPER TEST");
  console.log("=".repeat(80));
  console.log(`Roaster: ${config.name}`);
  console.log(`Limit: ${limit || "all"}`);
  console.log("");

  const result = await scrapeRoasterWithAI(config, {
    verbose: true,
    limit,
  });

  // Apply normalizations
  for (const coffee of result.coffees) {
    globalFieldRemapper(coffee);
  }

  console.log("\n" + "=".repeat(80));
  console.log("RESULTS");
  console.log("=".repeat(80));

  for (const coffee of result.coffees) {
    console.log(`\n--- ${coffee.name} ---`);
    console.log(`URL: ${coffee.url}`);
    console.log(`Skipped: ${coffee.skipped}`);

    if (!coffee.skipped) {
      console.log(`Country: ${coffee.country || "-"}`);
      console.log(`Region: ${coffee.region || "-"}`);
      console.log(`Producer: ${coffee.producer || "-"}`);
      console.log(`Farm: ${coffee.farm || "-"}`);
      console.log(`Process: ${coffee.process || "-"}`);
      console.log(`Protocol: ${coffee.protocol || "-"}`);
      console.log(`Variety: ${JSON.stringify(coffee.variety)}`);
      console.log(`Altitude: ${coffee.altitude || "-"}`);
      console.log(`Harvest: ${coffee.harvestDate || "-"}`);
      console.log(`Notes: ${JSON.stringify(coffee.notes)}`);
      console.log(`Roast for: ${coffee.roastedFor || "-"}`);
      console.log(`Prices: ${JSON.stringify(coffee.prices)}`);
      console.log(`Available: ${coffee.available}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total products: ${result.coffees.length}`);
  console.log(`Skipped (non-coffee): ${result.skippedCount}`);
  console.log(`Extracted: ${result.coffees.length - result.skippedCount}`);
  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors.join(", ")}`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
