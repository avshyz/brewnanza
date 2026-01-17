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
import { KNOWN_REGIONS, countryFromSku } from "../countries.js";
import { htmlToText, getFirstImage, logScrapeError } from "../utils.js";

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
   * Extract known coffee region from description text.
   */
  private regionFromDescription(description: string): string | null {
    if (!description) return null;
    const descLower = description.toLowerCase();
    const found = KNOWN_REGIONS.filter((r) => descLower.includes(r.toLowerCase()));
    return found.length > 0 ? found.join(", ") : null;
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

    // Get description
    const rawDesc = product.description || product.short_description || "";
    const description = htmlToText(rawDesc, " ");

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

    // Extract fields
    const country =
      getFirst(["country", "origine", "origin", "pays"]) || countryFromSku(product.sku);
    const region =
      getFirst(["region", "région"]) || this.regionFromDescription(description);
    const producer = getFirst(["producer", "producteur", "farm", "ferme"]);
    const process = getFirst(["process", "procédé", "processing"]);
    const variety = getAttr(["variety", "variété", "varietal", "varieties"]);
    let notes = getAttr([
      "aromatic profile",
      "profil aromatique",
      "aromatics",
      "tasting notes",
      "notes de dégustation",
      "notes",
    ]);

    // Fallback: extract notes from French description
    if (notes.length === 0 && description) {
      const match = description.match(
        /notes?\s+(?:de\s+|élégantes?\s+de\s+|aromatiques?\s+de\s+)([^.]+)/i
      );
      if (match) {
        notes = match[1]
          .split(/,\s*|\s+et\s+/)
          .map((n) => n.trim())
          .filter(Boolean);
      }
    }

    // Fallback: extract altitude from description
    let altitude = getFirst(["altitude", "élévation"]);
    if (!altitude && description) {
      const match = description.match(/(\d{3,4})\s*m(?:asl|ètres)?(?:\s|$|,)/);
      if (match) altitude = `${match[1]}m`;
    }

    return {
      name: product.name || "Unknown",
      url: product.permalink || "",
      roasterId: this.config.id,
      prices: priceVariants,
      country,
      region,
      producer,
      farm: null,
      altitude,
      process,
      protocol: null,
      variety,
      harvestDate: null,
      notes,
      blendComponents: [],
      roastedFor: getFirst(["torréfaction", "roasted for", "roast", "roast type"]),
      available: product.is_in_stock ?? true,
      imageUrl: getFirstImage(product.images),
      description,
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
