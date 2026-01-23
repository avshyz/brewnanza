/**
 * Shopify Hydrogen (headless) scraper.
 * Parses JSON-LD from server-rendered HTML and extracts coffee attributes
 * from individual product pages (Remix state).
 * Used for Shopify stores using Hydrogen/Oxygen that don't expose /products.json
 */

import { BaseScraper } from "./base.js";
import type { Coffee } from "../models.js";
import { createPriceVariant } from "../models.js";
import { SKIP_PRODUCT_TYPES, SKIP_TAGS } from "../config.js";
import { logScrapeError } from "../utils.js";
import pLimit from "p-limit";

interface JsonLdProduct {
  "@type": string;
  "@id"?: string;
  name?: string;
  url?: string;
  image?: string;
  offers?: {
    "@type": string;
    price?: string;
    priceCurrency?: string;
  };
}

interface JsonLdListItem {
  "@type": "ListItem";
  position: number;
  item: JsonLdProduct;
}

interface JsonLdCollectionPage {
  "@context": string;
  "@type": "CollectionPage";
  mainEntity?: {
    "@type": "ItemList";
    numberOfItems?: number;
    itemListElement?: JsonLdListItem[];
  };
}

/**
 * Extract JSON-LD from HTML.
 */
function extractJsonLd(html: string): JsonLdCollectionPage | null {
  const match = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
  );
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Attribute field mapping from Friedhats to Coffee model.
 * Some attributes have a "value" key prefix (like Variety), others don't.
 */
interface AttrConfig {
  field: keyof Coffee;
  hasValueKey: boolean;
}

const ATTRIBUTE_MAP: Record<string, AttrConfig> = {
  Country: { field: "country", hasValueKey: false },
  Region: { field: "region", hasValueKey: false },
  Processing: { field: "process", hasValueKey: false },
  Variety: { field: "variety", hasValueKey: true },
  "Flavour Notes": { field: "notes", hasValueKey: false },
  Exporter: { field: "producer", hasValueKey: false },
};

/**
 * Extract product attributes from Remix state embedded in HTML.
 * Friedhats embeds data in two formats:
 * - Direct: Country\",\"Colombia\"
 * - With value key: Variety\",\"value\",\"Castillo, Colombia\"
 */
function extractProductAttributes(
  html: string
): Partial<Record<keyof Coffee, string[]>> {
  const result: Partial<Record<keyof Coffee, string[]>> = {};

  for (const [attrName, config] of Object.entries(ATTRIBUTE_MAP)) {
    // Build regex based on whether attribute has "value" key
    const escapedName = attrName.replace(/\s+/g, "\\s*");
    let regex: RegExp;

    if (config.hasValueKey) {
      // Pattern: AttrName\",\"value\",\"ActualValue\"
      regex = new RegExp(
        `${escapedName}\\\\",\\\\"value\\\\",\\\\"([^"]+)\\\\"`,
        "i"
      );
    } else {
      // Pattern: AttrName\",\"ActualValue\" (value must be >2 chars to skip locale codes)
      regex = new RegExp(`${escapedName}\\\\",\\\\"([^"]{3,})\\\\"`, "i");
    }

    const match = html.match(regex);

    if (match?.[1]) {
      const value = match[1];
      // Split comma-separated values and trim
      const values = value
        .split(/,\s*/)
        .map((v) => v.trim())
        .filter((v) => v.length > 0);

      if (values.length > 0) {
        result[config.field] = values;
      }
    }
  }

  return result;
}

/**
 * Scraper for Shopify Hydrogen stores.
 * Parses JSON-LD schema from server-rendered HTML.
 */
export class ShopifyHydrogenScraper extends BaseScraper {
  /**
   * Check if product should be scraped based on name.
   */
  private isValidProduct(name: string): boolean {
    const nameLower = name.toLowerCase();

    // Skip non-coffee items
    for (const skipType of SKIP_PRODUCT_TYPES) {
      if (nameLower.includes(skipType)) return false;
    }

    for (const skipTag of SKIP_TAGS) {
      if (nameLower.includes(skipTag)) return false;
    }

    // Skip common non-coffee keywords
    if (
      ["giftcard", "gift card", "subscription", "sample box", "sampler"].some(
        (kw) => nameLower.includes(kw)
      )
    ) {
      return false;
    }

    return true;
  }

  /**
   * Parse a JSON-LD product into basic Coffee model (without attributes).
   */
  private parseBasicProduct(item: JsonLdListItem): Coffee | null {
    const product = item.item;
    if (!product || product["@type"] !== "Product") return null;

    const name = product.name || "Unknown";
    if (!this.isValidProduct(name)) return null;

    const url = product.url || product["@id"] || "";
    const offers = product.offers;
    const basePrice = parseFloat(offers?.price || "0");
    const currency = offers?.priceCurrency || this.config.currency;

    if (basePrice <= 0) return null;

    // Create variants: 250g base price, 1000g ~3.4x (observed ratio for Friedhats)
    const prices = [
      createPriceVariant(basePrice, currency, 250),
      createPriceVariant(basePrice * 3.4, currency, 1000),
    ];

    return {
      name,
      url,
      roasterId: this.config.id,
      prices,
      // Origin fields - populated from product page
      country: [],
      region: [],
      producer: [],
      process: [],
      protocol: [],
      variety: [],
      notes: [],
      caffeine: null,
      roastLevel: null,
      roastedFor: null,
      // Metadata
      available: true,
      imageUrl: product.image || null,
      skipped: false,
    };
  }

  /**
   * Fetch product page and extract attributes.
   */
  private async enrichWithProductPage(coffee: Coffee): Promise<Coffee> {
    try {
      const html = await this.fetchHtml(coffee.url);
      const attrs = extractProductAttributes(html);

      // Apply extracted attributes
      if (attrs.country?.length) coffee.country = attrs.country;
      if (attrs.region?.length) coffee.region = attrs.region;
      if (attrs.producer?.length) coffee.producer = attrs.producer;
      if (attrs.process?.length) coffee.process = attrs.process;
      if (attrs.variety?.length) coffee.variety = attrs.variety;
      if (attrs.notes?.length) coffee.notes = attrs.notes;
    } catch (error) {
      logScrapeError(`enriching ${coffee.name}`, error);
    }

    return coffee;
  }

  /**
   * Scrape all coffees from Hydrogen store's JSON-LD,
   * then enrich with attributes from individual product pages.
   */
  async scrape(): Promise<Coffee[]> {
    const html = await this.fetchHtml(this.config.collectionUrl);
    const jsonLd = extractJsonLd(html);

    if (!jsonLd?.mainEntity?.itemListElement) {
      console.warn(`No JSON-LD found for ${this.config.id}`);
      return [];
    }

    const items = jsonLd.mainEntity.itemListElement;
    const basicCoffees: Coffee[] = [];

    for (const item of items) {
      try {
        const coffee = this.parseBasicProduct(item);
        if (coffee) {
          basicCoffees.push(coffee);
        }
      } catch (error) {
        logScrapeError(`product ${item.item?.name}`, error);
      }
    }

    // Fetch product pages in parallel (limit concurrency to avoid rate limiting)
    const limit = pLimit(5);
    const enriched = await Promise.all(
      basicCoffees.map((coffee) => limit(() => this.enrichWithProductPage(coffee)))
    );

    return enriched;
  }
}
