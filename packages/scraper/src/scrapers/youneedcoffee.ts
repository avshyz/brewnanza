/**
 * You Need Coffee scraper.
 * Uses Playwright for Wix SPA rendering.
 * Catalog-only scrape; AI extraction happens in CLI for new items.
 */

import { BaseScraper } from "./base.js";
import type { Coffee } from "../models.js";
import { createPriceVariant } from "../models.js";

interface WixProduct {
  name: string;
  url: string;
  price: number;
  isOutOfStock: boolean;
  ribbon: string | null;
  imageUrl: string | null;
}

/**
 * Scraper for You Need Coffee (Wix store).
 * Catalog-only: extracts product list from shop pages.
 * AI extraction for new items happens in CLI using fetchRenderedHtml().
 */
export class YouNeedCoffeeScraper extends BaseScraper {
  /**
   * Scrape catalog from all shop pages.
   */
  async scrape(): Promise<Coffee[]> {
    const { page, browser } = await this.launchBrowser();

    try {
      const allProducts: WixProduct[] = [];

      // Scrape all pages (site has 3 pages)
      for (let pageNum = 1; pageNum <= 10; pageNum++) {
        const url = pageNum === 1
          ? this.config.collectionUrl
          : `${this.config.collectionUrl}?page=${pageNum}`;

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

        // Wait for Wix to render products
        await page.waitForTimeout(3000);

        // Wait for products to load
        try {
          await page.waitForSelector('[data-hook="product-item-root"]', { timeout: 15000 });
        } catch {
          // No products on this page, we've reached the end
          break;
        }

        await page.waitForTimeout(1000);

        const products = await page.evaluate(() => {
          const items: WixProduct[] = [];
          const productItems = document.querySelectorAll('[data-hook="product-item-root"]');

          productItems.forEach(item => {
            const link = item.querySelector('[data-hook="product-item-product-details-link"]') as HTMLAnchorElement;
            const nameEl = item.querySelector('[data-hook="product-item-name"]');
            const priceEl = item.querySelector('[data-wix-price]');
            const addToCartBtn = item.querySelector('[data-hook="product-item-add-to-cart-button"]');
            const ribbonEl = item.querySelector('[data-hook="RibbonDataHook.RibbonOnImage"]');
            const imgEl = item.querySelector('img[src*="wixstatic"]') as HTMLImageElement;

            const url = link ? link.href : '';
            const name = nameEl ? nameEl.textContent?.trim() || '' : '';
            const priceText = priceEl ? priceEl.textContent?.trim() || '' : '';
            // Remove currency symbol (first character ₪) and parse
            const priceNum = priceText.length > 1 ? parseFloat(priceText.slice(1)) : 0;
            const price = isNaN(priceNum) ? 0 : priceNum;
            const isOutOfStock = addToCartBtn ? addToCartBtn.textContent?.includes('Out of Stock') || false : false;
            const ribbon = ribbonEl ? ribbonEl.textContent?.trim() || null : null;
            const imageUrl = imgEl ? imgEl.src : null;

            if (url && name) {
              items.push({ name, url, price, isOutOfStock, ribbon, imageUrl });
            }
          });

          return items;
        });

        if (products.length === 0) break;

        allProducts.push(...products);

        // Check if there's a next page
        const hasNextPage = await page.evaluate(() => {
          const lastLink = document.querySelector('[data-hook="last"]') as HTMLAnchorElement;
          const currentUrl = window.location.href;
          return lastLink && lastLink.href !== currentUrl;
        });

        if (!hasNextPage) break;
      }

      return this.parseProducts(allProducts);
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
          console.log(`  Fetching: ${url}`);
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
          // Wait for Wix to render product details
          await page.waitForTimeout(2000);
          results.set(url, await page.content());
        } catch (err) {
          console.error(`  Failed to fetch ${url}:`, err);
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
        "Playwright is required for YouNeedCoffee scraper but not installed.\n" +
          "Install with: bun add playwright && bunx playwright install chromium"
      );
    }

    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    return { browser, page };
  }

  /**
   * Parse Wix products into Coffee models.
   * Price is for 250g bags.
   */
  private parseProducts(products: WixProduct[]): Coffee[] {
    const coffees: Coffee[] = [];

    for (const product of products) {
      // Skip non-coffee items
      const nameLower = product.name.toLowerCase();
      if (
        nameLower.includes("gift") ||
        nameLower.includes("merch") ||
        nameLower.includes("equipment")
      ) {
        continue;
      }

      try {
        if (product.price <= 0) continue;

        // Fixed weight: 250g (site sells 250g bags)
        const currency = this.config.currency;
        const prices = [createPriceVariant(product.price, currency, 250)];

        // Try to extract country from name (e.g., "Rwanda Gitesi" -> "Rwanda")
        const country = this.extractCountry(product.name);

        coffees.push({
          name: product.name,
          url: product.url,
          roasterId: this.config.id,
          prices,
          country: country ? [country] : [],
          region: [],
          producer: [],
          process: [],
          protocol: [],
          variety: [],
          notes: [],
          caffeine: product.ribbon === "Organic" ? null : null,
          roastLevel: null,
          roastedFor: null, // AI will extract this
          available: !product.isOutOfStock,
          imageUrl: product.imageUrl,
          skipped: false,
        });
      } catch (error) {
        console.error(`Failed to parse product: ${product.name}`, error);
      }
    }

    return coffees;
  }

  /**
   * Extract country from product name.
   * E.g., "Rwanda Gitesi" -> "Rwanda", "Colombia Pink Bourbon" -> "Colombia"
   */
  private extractCountry(name: string): string | null {
    const countries = [
      "Ethiopia",
      "Colombia",
      "Kenya",
      "Rwanda",
      "Costa Rica",
      "Guatemala",
      "Brazil",
      "Peru",
      "Honduras",
      "Nicaragua",
      "El Salvador",
      "Panama",
      "Burundi",
      "Tanzania",
      "Uganda",
      "Yemen",
      "Indonesia",
      "Vietnam",
      "Vietnamese",
    ];

    const nameLower = name.toLowerCase();
    for (const country of countries) {
      if (nameLower.includes(country.toLowerCase())) {
        // Normalize "Vietnamese" to "Vietnam"
        if (country === "Vietnamese") return "Vietnam";
        return country;
      }
    }

    return null;
  }
}
