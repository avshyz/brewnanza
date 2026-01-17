/**
 * Generic Shopify JSON API scraper.
 * Gets catalog data: name, url, prices, availability, imageUrl.
 * Origin fields left empty for AI extraction.
 */

import { BaseScraper } from "./base.js";
import type { Coffee, PriceVariant } from "../models.js";
import { createPriceVariant } from "../models.js";
import { parseWeightGrams } from "../currency.js";
import { DEFAULT_WEIGHT_GRAMS, SKIP_PRODUCT_TYPES, SKIP_TAGS } from "../config.js";
import { getFirstImage, logScrapeError } from "../utils.js";

interface ShopifyProduct {
  title?: string;
  handle?: string;
  product_type?: string;
  tags?: string[];
  variants?: ShopifyVariant[];
  images?: Array<{ src?: string }>;
}

interface ShopifyVariant {
  price?: string;
  grams?: number;
  title?: string;
  available?: boolean;
}

interface ShopifyProductsResponse {
  products?: ShopifyProduct[];
}

/**
 * Scraper for Shopify stores that expose /products.json API.
 * Only extracts catalog data - origin fields populated by AI extraction.
 */
export class ShopifyJsonScraper extends BaseScraper {
  private _productsJsonUrl?: string;

  private get productsJsonUrl(): string {
    if (!this._productsJsonUrl) {
      const base = this.config.apiUrl || `${this.config.collectionUrl}/products.json`;
      this._productsJsonUrl = `${base}?limit=250`;
    }
    return this._productsJsonUrl;
  }

  /**
   * Parse Shopify variants into PriceVariants, deduped by (price, weight).
   */
  private parseVariants(variants: ShopifyVariant[], currency?: string): PriceVariant[] {
    const cur = currency || this.config.currency;
    const seen = new Set<string>();
    const result: PriceVariant[] = [];

    for (const v of variants) {
      const price = parseFloat(v.price || "0");
      if (isNaN(price) || price <= 0) continue;

      const weight = v.grams || parseWeightGrams(v.title) || DEFAULT_WEIGHT_GRAMS;
      const available = v.available ?? true;

      const key = `${price}:${weight}`;
      if (seen.has(key)) continue;
      seen.add(key);

      result.push(createPriceVariant(price, cur, weight, available));
    }

    return result;
  }

  /**
   * Parse a single Shopify product into our Coffee model.
   * Origin fields are empty arrays - AI extraction will populate them.
   */
  private parseProduct(product: ShopifyProduct): Coffee {
    const variants = product.variants || [];

    return {
      name: product.title || "Unknown",
      url: `${this.config.baseUrl}/products/${product.handle || ""}`,
      roasterId: this.config.id,
      prices: this.parseVariants(variants),
      // Origin fields - empty arrays, AI will populate
      country: [],
      region: [],
      producer: [],
      process: [],
      protocol: [],
      variety: [],
      notes: [],
      caffeine: null,
      // Metadata
      available: variants.some((v) => v.available !== false),
      imageUrl: getFirstImage(product.images),
      skipped: false,
    };
  }

  /**
   * Check if product should be scraped (is coffee and in stock).
   */
  private isValidProduct(product: ShopifyProduct): boolean {
    const productType = (product.product_type || "").toLowerCase();
    if (SKIP_PRODUCT_TYPES.has(productType)) return false;

    const tags = new Set((product.tags || []).map((t) => t.toLowerCase()));
    for (const skipTag of SKIP_TAGS) {
      if (tags.has(skipTag)) return false;
    }

    const title = (product.title || "").toLowerCase();
    if (
      ["giftcard", "gift card", "subscription", "sample box"].some((kw) =>
        title.includes(kw)
      )
    ) {
      return false;
    }

    const variants = product.variants || [];
    return variants.some((v) => v.available !== false);
  }

  /**
   * Scrape all coffees from Shopify JSON API.
   */
  async scrape(): Promise<Coffee[]> {
    const data = await this.fetchJson<ShopifyProductsResponse>(this.productsJsonUrl);
    const products = data.products || [];
    const coffees: Coffee[] = [];

    for (const product of products) {
      if (!this.isValidProduct(product)) continue;

      try {
        coffees.push(this.parseProduct(product));
      } catch (error) {
        logScrapeError(`product ${product.title}`, error);
      }
    }

    return coffees;
  }
}
