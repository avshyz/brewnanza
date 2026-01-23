#!/usr/bin/env bun
/**
 * CLI for checking shipping rates.
 *
 * Usage:
 *   bun run src/shipping-cli.ts IL           # Check shipping to Israel
 *   bun run src/shipping-cli.ts US --dry-run # Preview without pushing
 *   bun run src/shipping-cli.ts DE -v        # Verbose output
 */

// Load .env.local from monorepo root
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dir, "../../../.env.local") });

import { getAllRoasters } from "./config.js";
import { checkAllShipping } from "./shipping/index.js";

// Import index to register roasters
import "./index.js";

const args = process.argv.slice(2);

// Flags
const verbose = args.includes("-v") || args.includes("--verbose");
const dryRun = args.includes("--dry-run");

// Get country code (first non-flag argument)
const countryCode = args.find((a) => !a.startsWith("-"))?.toUpperCase();

// Convex HTTP URL
const CONVEX_SITE_URL =
  process.env.CONVEX_SITE_URL || "https://healthy-dodo-333.convex.site";

async function pushShippingRates(
  roasterId: string,
  rates: Array<{
    countryCode: string;
    available: boolean;
    price?: number;
    priceUsd?: number;
    currency: string;
    checkedAt: number;
  }>
): Promise<void> {
  const url = `${CONVEX_SITE_URL}/update-shipping`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roasterId, rates }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to push shipping rates: ${response.status} ${text}`);
  }
}

async function main() {
  if (!countryCode || countryCode.length !== 2) {
    console.error("Usage: bun run shipping-cli.ts <COUNTRY_CODE> [--dry-run] [-v]");
    console.error("Example: bun run shipping-cli.ts IL");
    console.error("");
    console.error("Country codes: IL, US, GB, DE, NL, DK, SE, FR, ES, IT, CA, AU, JP");
    process.exit(1);
  }

  const roasters = getAllRoasters();
  console.log(`Checking shipping to ${countryCode} for ${roasters.length} roasters...`);
  if (dryRun) console.log("[DRY RUN - not pushing to Convex]");
  console.log("");

  const results = await checkAllShipping(roasters, countryCode, { verbose: true });

  // Summary
  const available = results.filter((r) => r.rates[0]?.available).length;
  const unavailable = results.filter((r) => r.rates[0] && !r.rates[0].available).length;
  const unknown = results.filter((r) => r.rates.length === 0).length;

  console.log("");
  console.log("=== Summary ===");
  console.log(`Available: ${available}`);
  console.log(`Unavailable: ${unavailable}`);
  console.log(`Unknown/Custom: ${unknown}`);

  if (dryRun) {
    console.log("\n[DRY RUN] Would push rates for:", available + unavailable, "roasters");
    return;
  }

  // Push to Convex
  console.log("\nPushing to Convex...");
  let pushed = 0;
  for (const result of results) {
    if (result.rates.length === 0) continue;
    try {
      await pushShippingRates(result.roasterId, result.rates);
      pushed++;
      if (verbose) console.log(`  Pushed: ${result.roasterId}`);
    } catch (error) {
      console.error(`  Failed to push ${result.roasterId}:`, error);
    }
  }
  console.log(`Pushed shipping rates for ${pushed} roasters`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
