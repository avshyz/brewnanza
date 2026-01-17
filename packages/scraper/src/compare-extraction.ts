#!/usr/bin/env bun
/**
 * Compare detail scraper vs AI extraction for La Cabra.
 */

import { getRoaster } from "./config.js";
import { ShopifyJsonScraper } from "./scrapers/shopify-json.js";
import { extractDetails, applyExtractedDetails } from "./ai-extractor.js";
import { globalFieldRemapper } from "./normalizers.js";
import type { Coffee } from "./models.js";

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
  const config = getRoaster("lacabra");
  if (!config) {
    console.error("La Cabra config not found");
    process.exit(1);
  }

  console.log("=".repeat(80));
  console.log("AI EXTRACTION (no detail scraper)");
  console.log("=".repeat(80));

  // Run catalog scraper only (no detail scraper)
  const scraper = new ShopifyJsonScraper(config);
  const coffees = await scraper.scrape();

  console.log(`Found ${coffees.length} coffees in catalog\n`);

  // Run AI extraction on each
  for (const coffee of coffees) {
    console.log(`--- ${coffee.name} ---`);
    console.log(`URL: ${coffee.url}`);

    try {
      const html = await fetchHtml(coffee.url);
      const details = await extractDetails(coffee.url, html);

      if (details) {
        applyExtractedDetails(coffee, details);
        globalFieldRemapper(coffee);

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
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
