/**
 * DAK Coffee Roasters scraper.
 * Uses Playwright for SPA rendering (optional dependency).
 * Catalog-only scrape; AI extraction happens in CLI for new items.
 */

import { BaseScraper } from "./base.js";
import type { Coffee } from "../models.js";
import { createPriceVariant } from "../models.js";

interface SnipcartProduct {
  name: string;
  id: string;
  price: string; // JSON: {"eur":"19.95","cad":"30.00"}
  image: string;
}

/**
 * Parse DAK product name like "Milky Cake - Colombia" into name, country, and slug.
 */
function parseProductName(fullName: string): { name: string; country: string | null; slug: string } {
  const parts = fullName.split(" - ");
  if (parts.length >= 2) {
    const country = parts[parts.length - 1].trim();
    const name = parts.slice(0, -1).join(" - ").trim();
    // Create URL slug from coffee name: "Milky Cake" -> "milky-cake"
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    return { name, country, slug };
  }
  const slug = fullName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return { name: fullName, country: null, slug };
}


/**
 * Scraper for DAK Coffee Roasters (SPA using Snipcart).
 * Catalog-only: extracts product list from shop page.
 * AI extraction for new items happens in CLI using fetchRenderedHtml().
 */
export class DakScraper extends BaseScraper {
  /**
   * Scrape catalog from DAK shop page.
   */
  async scrape(): Promise<Coffee[]> {
    const { page, browser } = await this.launchBrowser();

    try {
      await page.goto(this.config.collectionUrl, { waitUntil: "networkidle" });
      await page.waitForSelector(".snipcart-add-item", { timeout: 15000 });
      await page.waitForTimeout(2000);

      const products = await page.evaluate(() => {
        return [...document.querySelectorAll(".snipcart-add-item")].map(
          (el) => ({
            name: (el as HTMLElement).dataset.itemName || "",
            id: (el as HTMLElement).dataset.itemId || "",
            price: (el as HTMLElement).dataset.itemPrice || "{}",
            image: (el as HTMLElement).dataset.itemImage || "",
          })
        );
      });

      return this.parseProducts(products);
    } finally {
      await browser.close();
    }
  }

  /**
   * Fetch rendered HTML from multiple product pages (for AI extraction).
   * Uses a single browser instance for efficiency.
   */
  async fetchRenderedHtmlBatch(urls: string[]): Promise<Map<string, string>> {
    const { page, browser } = await this.launchBrowser();
    const results = new Map<string, string>();

    try {
      for (const url of urls) {
        try {
          await page.goto(url, { waitUntil: "networkidle" });
          await page.waitForTimeout(1000);
          results.set(url, await page.content());
        } catch (err) {
          console.error(`Failed to fetch ${url}:`, err);
          results.set(url, "");
        }
      }
      return results;
    } finally {
      await browser.close();
    }
  }

  /**
   * Fetch rendered HTML from a product page (for AI extraction).
   * Called by CLI for new items only.
   */
  async fetchRenderedHtml(url: string): Promise<string> {
    const results = await this.fetchRenderedHtmlBatch([url]);
    return results.get(url) || "";
  }

  private async launchBrowser() {
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
    return { browser, page };
  }

  /**
   * Parse Snipcart products into Coffee models.
   * Uses fixed 250g/1kg weights.
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

        // Fixed weights: 250g base price, 1kg = base + 57.25
        const currency = this.config.currency;
        const prices = [
          createPriceVariant(basePrice, currency, 250),
          createPriceVariant(basePrice + 57.25, currency, 1000),
        ];

        // Parse name and country from "Coffee Name - Country" format
        const { country, slug } = parseProductName(product.name);

        coffees.push({
          name: product.name,
          url: `${this.config.baseUrl}/shop/coffee/${slug}`,
          roasterId: this.config.id,
          prices,
          country: country ? [country] : [],
          region: [],
          producer: [],
          process: [],
          protocol: [],
          variety: [],
          notes: [],
          caffeine: null,
          roastLevel: null,
          roastedFor: null, // AI will extract this
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
