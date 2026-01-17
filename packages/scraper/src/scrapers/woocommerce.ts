/**
 * Generic WooCommerce Store API scraper.
 * Ported from Python's scrapers/woocommerce.py
 *
 * Handles stores using WooCommerce Store API (Tanat, Manhattan, etc.).
 */

import { BaseScraper } from "./base.js";
import type { Coffee, PriceVariant } from "../models.js";
import { createPriceVariant } from "../models.js";
import { parseWeightGrams } from "../currency.js";
import { DEFAULT_WEIGHT_GRAMS, DEFAULT_CURRENCY } from "../config.js";
import { getFirstImage, logScrapeError } from "../utils.js";

interface WooVariation {
  id?: number;
  attributes?: Array<{ name?: string; value?: string }>;
}

interface WooAttribute {
  name: string;
  terms?: Array<{ name?: string }>;
}

interface WooProduct {
  id?: number;
  name?: string;
  permalink?: string;
  sku?: string;
  description?: string;
  short_description?: string;
  prices?: {
    price?: string;
    currency_code?: string;
    currency_minor_unit?: number;
  };
  variations?: WooVariation[];
  attributes?: WooAttribute[];
  is_in_stock?: boolean;
  images?: Array<{ src?: string }>;
}

interface WooVariationDetail {
  prices?: {
    price?: string;
    currency_code?: string;
    currency_minor_unit?: number;
  };
  is_in_stock?: boolean;
}

/**
 * Scraper for WooCommerce stores using Store API.
 */
export class WooCommerceScraper extends BaseScraper {
  private get apiUrl(): string {
    return `${this.config.baseUrl}/wp-json/wc/store/products`;
  }

  /**
   * Fetch price details for each variation.
   */
  private async fetchVariationPrices(variations: WooVariation[]): Promise<PriceVariant[]> {
    const results: PriceVariant[] = [];

    for (const v of variations) {
      const varId = v.id;
      if (!varId) continue;

      // Extract weight from attributes
      let weight: number | null = null;
      for (const attr of v.attributes || []) {
        const attrName = (attr.name || "").toLowerCase().replace(/ /g, "_");
        if (["poids", "bag_size", "weight", "size", "contents", "משקל"].includes(attrName)) {
          const rawValue = decodeURIComponent(attr.value || "").replace(/-/g, " ");
          weight = parseWeightGrams(rawValue);
          break;
        }
      }

      if (!weight) continue;

      try {
        const varData = await this.fetchJson<WooVariationDetail>(`${this.apiUrl}/${varId}`);
        const pricesInfo = varData.prices || {};
        const priceStr = pricesInfo.price;
        if (!priceStr) continue;

        const minorUnit = pricesInfo.currency_minor_unit ?? 2;
        const price = parseFloat(priceStr) / Math.pow(10, minorUnit);
        const currency = pricesInfo.currency_code || DEFAULT_CURRENCY;
        const available = varData.is_in_stock ?? true;

        results.push(createPriceVariant(price, currency, weight, available));
      } catch {
        // Ignore variation fetch errors
      }
    }

    return results;
  }

  /**
   * Parse a WooCommerce product into our Coffee model.
   */
  private async parseProduct(product: WooProduct): Promise<Coffee> {
    const pricesData = product.prices || {};
    const currency = pricesData.currency_code || DEFAULT_CURRENCY;

    // Get variation prices or single price
    let priceVariants: PriceVariant[];
    if (product.variations && product.variations.length > 0) {
      priceVariants = await this.fetchVariationPrices(product.variations);
    } else {
      priceVariants = [];
      const priceStr = pricesData.price;
      if (priceStr) {
        const minorUnit = pricesData.currency_minor_unit ?? 2;
        const price = parseFloat(priceStr) / Math.pow(10, minorUnit);
        if (!isNaN(price)) {
          priceVariants.push(createPriceVariant(price, currency, DEFAULT_WEIGHT_GRAMS));
        }
      }
    }

    // Build attribute lookup
    const attrs = new Map<string, string[]>();
    for (const a of product.attributes || []) {
      const terms = (a.terms || []).map((t) => t.name || "").filter(Boolean);
      attrs.set(a.name.toLowerCase(), terms);
    }

    const getAttr = (keys: string[]): string[] => {
      for (const key of keys) {
        const terms = attrs.get(key);
        if (terms && terms.length > 0) return terms;
      }
      return [];
    };

    const getFirst = (keys: string[]): string | null => {
      const values = getAttr(keys);
      return values.length > 0 ? values[0] : null;
    };

    // Extract fields (AI extractor handles normalization and translation)
    const country = getFirst(["country", "origine", "origin", "pays"]);
    const region = getFirst(["region", "région"]);
    const producer = getFirst(["producer", "producteur", "farm", "ferme"]);
    const process = getFirst(["process", "procédé", "processing"]);
    const variety = getAttr(["variety", "variété", "varietal", "varieties"]);

    return {
      name: product.name || "Unknown",
      url: product.permalink || "",
      roasterId: this.config.id,
      prices: priceVariants,
      country: country ? [country] : [],
      region: region ? [region] : [],
      producer: producer ? [producer] : [],
      process: process ? [process] : [],
      protocol: [],
      variety,
      notes: [],
      caffeine: null,
      available: product.is_in_stock ?? true,
      imageUrl: getFirstImage(product.images),
      skipped: false,
    };
  }

  /**
   * Iterate through paginated API results.
   */
  private async *iterProducts(): AsyncGenerator<WooProduct> {
    let page = 1;
    const perPage = 100;
    const categoryParam = this.config.categoryFilter
      ? `&category=${this.config.categoryFilter}`
      : "";

    while (true) {
      const url = `${this.apiUrl}?per_page=${perPage}&page=${page}${categoryParam}`;
      const data = await this.fetchJson<WooProduct[]>(url);

      if (!data || data.length === 0) break;

      for (const product of data) {
        yield product;
      }

      if (data.length < perPage) break;
      page++;
    }
  }

  /**
   * Skip keywords to filter out non-coffee products.
   */
  private readonly SKIP_KEYWORDS = [
    "subscription",
    "abonnement",
    "gift card",
    "giftcard",
    "sample box",
    "sample pack",
  ];

  /**
   * Check if product should be scraped (is coffee, not subscription).
   */
  private isValidProduct(product: WooProduct): boolean {
    const name = (product.name || "").toLowerCase();
    if (this.SKIP_KEYWORDS.some((kw) => name.includes(kw))) return false;
    return product.is_in_stock !== false;
  }

  /**
   * Scrape all coffees from WooCommerce Store API.
   */
  async scrape(): Promise<Coffee[]> {
    const coffees: Coffee[] = [];

    for await (const product of this.iterProducts()) {
      if (!this.isValidProduct(product)) continue;

      try {
        coffees.push(await this.parseProduct(product));
      } catch (error) {
        logScrapeError(`product ${product.name}`, error);
      }
    }

    return coffees;
  }
}
