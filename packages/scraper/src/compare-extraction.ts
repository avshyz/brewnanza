#!/usr/bin/env bun
/**
 * Test AI extraction on any roaster.
 * Usage: bun run src/compare-extraction.ts [roasterId]
 */

import { getRoaster } from "./config.js";
import { extractDetails, applyExtractedDetails, qualifyProduct } from "./ai-extractor.js";

let skippedCount = 0;
let coffeeCount = 0;

// Import index to register roasters
import "./index.js";

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; CoffeeScraper/1.0)",
    },
  });
  return response.text();
}

async function main() {
  const roasterId = process.argv[2] || "lacabra";
  const config = getRoaster(roasterId);
  if (!config) {
    console.error(`Roaster "${roasterId}" not found`);
    process.exit(1);
  }

  console.log("=".repeat(80));
  console.log(`AI EXTRACTION: ${config.name}`);
  console.log("=".repeat(80));

  // Run catalog scraper
  const scraper = new config.scraper(config);
  const coffees = await scraper.scrape();

  console.log(`Found ${coffees.length} coffees in catalog\n`);

  // Run AI extraction on each
  for (const coffee of coffees) {
    console.log(`--- ${coffee.name} ---`);
    console.log(`URL: ${coffee.url}`);

    try {
      // Check if this is actual coffee
      const isCoffee = await qualifyProduct(coffee.name);

      if (!isCoffee) {
        coffee.skipped = true;
        skippedCount++;
        console.log(`SKIPPED (not coffee)`);
        console.log("");
        continue;
      }

      coffeeCount++;
      const html = await fetchHtml(coffee.url);
      const details = await extractDetails(coffee.url, html);

      if (details) {
        applyExtractedDetails(coffee, details);

        console.log(`Country: ${JSON.stringify(coffee.country)}`);
        console.log(`Region: ${JSON.stringify(coffee.region)}`);
        console.log(`Producer: ${JSON.stringify(coffee.producer)}`);
        console.log(`Process: ${JSON.stringify(coffee.process)}`);
        console.log(`Protocol: ${JSON.stringify(coffee.protocol)}`);
        console.log(`Variety: ${JSON.stringify(coffee.variety)}`);
      } else {
        console.log("AI extraction failed");
      }
    } catch (error) {
      console.log(`Error: ${error}`);
    }

    console.log("");
  }

  console.log("=".repeat(80));
  console.log(`SUMMARY: ${coffeeCount} coffees, ${skippedCount} skipped`);

  // Output JSON with all items (including skipped)
  const outputFile = `output-${roasterId}.json`;
  const output = coffees.map(c => ({
    name: c.name,
    url: c.url,
    imageUrl: c.imageUrl,
    skipped: c.skipped,
    country: c.country || [],
    region: c.region || [],
    producer: c.producer || [],
    process: c.process || [],
    protocol: c.protocol || [],
    variety: c.variety || [],
    prices: c.prices,
  }));

  await Bun.write(outputFile, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${coffees.length} items (including ${skippedCount} skipped) to ${outputFile}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
