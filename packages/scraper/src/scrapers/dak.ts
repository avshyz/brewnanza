/**
 * DAK Coffee Roasters scraper.
 * Uses Playwright for SPA rendering (optional dependency).
 */

import { BaseScraper } from "./base.js";
import type { Coffee, PriceVariant } from "../models.js";
import { createPriceVariant } from "../models.js";
import { parseWeightGrams } from "../currency.js";
import { DEFAULT_WEIGHT_GRAMS } from "../config.js";

interface SnipcartProduct {
  name: string;
  id: string;
  price: string; // JSON: {"eur":"19.95","cad":"30.00"}
  image: string;
  custom1Options?: string; // Weight: "250g[+0.00]|1kg[+57.25]"
  custom2Options?: string; // Roast: "espresso|filter"
}

/**
 * Parse weight options like "250g[+0.00]|1kg[+57.25]" into price variants.
 */
function parseWeightOptions(
  options: string | undefined,
  basePrice: number,
  currency: string
): PriceVariant[] {
  if (!options) {
    return [createPriceVariant(basePrice, currency, DEFAULT_WEIGHT_GRAMS)];
  }

  const variants: PriceVariant[] = [];
  const parts = options.split("|");

  for (const part of parts) {
    // Format: "250g[+0.00]" or "1kg[+57.25]"
    const match = part.match(/^([^[]+)\[([+-]?\d+\.?\d*)\]$/);
    if (!match) continue;

    const [, weightStr, priceModStr] = match;
    const weight = parseWeightGrams(weightStr) || DEFAULT_WEIGHT_GRAMS;
    const priceMod = parseFloat(priceModStr) || 0;
    const finalPrice = basePrice + priceMod;

    variants.push(createPriceVariant(finalPrice, currency, weight));
  }

  return variants.length > 0
    ? variants
    : [createPriceVariant(basePrice, currency, DEFAULT_WEIGHT_GRAMS)];
}

/**
 * Parse roast options like "espresso|filter" into roastedFor value.
 */
function parseRoastOptions(
  options: string | undefined
): "filter" | "espresso" | null {
  if (!options) return null;

  const lower = options.toLowerCase();
  const hasFilter = lower.includes("filter");
  const hasEspresso = lower.includes("espresso");

  // If both or neither, return null (omni)
  if (hasFilter && hasEspresso) return null;
  if (hasFilter) return "filter";
  if (hasEspresso) return "espresso";
  return null;
}

/**
 * Scraper for DAK Coffee Roasters (SPA using Snipcart).
 * Requires Playwright to be installed: `bun add playwright && bunx playwright install chromium`
 */
export class DakScraper extends BaseScraper {
  /**
   * Scrape all coffees from DAK using Playwright.
   */
  async scrape(): Promise<Coffee[]> {
    // Dynamic import - fails gracefully if Playwright not installed
    let playwright;
    try {
      playwright = await import("playwright");
    } catch {
      throw new Error(
        "Playwright is required for DAK scraper but not installed.\n" +
          "Install with: bun add playwright && bunx playwright install chromium"
      );
    }

    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.goto(this.config.collectionUrl, { waitUntil: "networkidle" });

      // Wait for Snipcart products to render
      await page.waitForSelector(".snipcart-add-item", { timeout: 15000 });

      // Extra wait for React to fully render all products
      await page.waitForTimeout(2000);

      // Extract product data from Snipcart elements
      const products = await page.evaluate(() => {
        return [...document.querySelectorAll(".snipcart-add-item")].map(
          (el) => ({
            name: (el as HTMLElement).dataset.itemName || "",
            id: (el as HTMLElement).dataset.itemId || "",
            price: (el as HTMLElement).dataset.itemPrice || "{}",
            image: (el as HTMLElement).dataset.itemImage || "",
            custom1Options: (el as HTMLElement).dataset.itemCustom1Options,
            custom2Options: (el as HTMLElement).dataset.itemCustom2Options,
          })
        );
      });

      return this.parseProducts(products);
    } finally {
      await browser.close();
    }
  }

  /**
   * Parse Snipcart products into Coffee models.
   */
  private parseProducts(products: SnipcartProduct[]): Coffee[] {
    const coffees: Coffee[] = [];

    for (const product of products) {
      // Skip non-coffee items (merch, etc)
      const nameLower = product.name.toLowerCase();
      if (
        nameLower.includes("tee") ||
        nameLower.includes("shirt") ||
        nameLower.includes("mug") ||
        nameLower.includes("gift") ||
        nameLower.includes("cold brew") ||
        nameLower.includes("nitro")
      ) {
        continue;
      }

      try {
        // Parse price JSON: {"eur":"19.95","cad":"30.00"}
        const priceData = JSON.parse(product.price);
        const basePrice = parseFloat(priceData.eur || priceData.cad || "0");

        if (basePrice <= 0) continue;

        const prices = parseWeightOptions(
          product.custom1Options,
          basePrice,
          this.config.currency
        );

        const roastedFor = parseRoastOptions(product.custom2Options);

        coffees.push({
          name: product.name,
          url: `${this.config.baseUrl}/shop#${product.id}`, // Use product ID for unique URL
          roasterId: this.config.id,
          prices,
          // Origin fields - AI will populate from name
          country: [],
          region: [],
          producer: [],
          process: [],
          protocol: [],
          variety: [],
          notes: [],
          caffeine: null,
          roastLevel: null,
          roastedFor,
          available: true,
          imageUrl: product.image || null,
          skipped: false,
        });
      } catch (error) {
        console.error(`Failed to parse DAK product: ${product.name}`, error);
      }
    }

    return coffees;
  }
}
