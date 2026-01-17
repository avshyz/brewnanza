/**
 * La Cabra detail scraper - extracts data from product page HTML.
 * Ported from Python's scrapers/detail/lacabra.py
 */

import * as cheerio from "cheerio";
import { DetailScraper } from "./base.js";
import type { Coffee } from "../../models.js";
import { splitListField, findMainContent, logScrapeError } from "../../utils.js";

// Label -> field mapping for Technical Data accordion
const LABEL_MAP: Record<string, string> = {
  producer: "producer",
  region: "region",
  varietal: "variety",
  process: "process",
};

/**
 * Extracts Technical Data from La Cabra product pages.
 *
 * La Cabra stores technical data (Producer, Region, Varietal, Process)
 * in a rendered accordion that's not available in the products.json API.
 */
export class LaCabraDetailScraper extends DetailScraper {
  async enhance(coffee: Coffee): Promise<void> {
    if (!coffee.url) return;

    try {
      const html = await this.fetchHtml(coffee.url);
      const $ = cheerio.load(html);
      const details = this.parsePage($);

      // Apply extracted details (only fill if empty)
      if (details.country && !coffee.country) coffee.country = details.country;
      if (details.region && !coffee.region) coffee.region = details.region;
      if (details.producer && !coffee.producer) coffee.producer = details.producer;
      if (details.process && !coffee.process) coffee.process = details.process;
      if (details.variety && coffee.variety.length === 0) {
        coffee.variety = splitListField(details.variety);
      }
    } catch (error) {
      logScrapeError(`La Cabra detail for ${coffee.url}`, error);
    }
  }

  private parsePage($: cheerio.CheerioAPI): Record<string, string | null> {
    const result: Record<string, string | null> = {};

    // Scope to main content to avoid related products
    const main = findMainContent($);

    // Extract country from product__text element
    const countryEl = main.find(".product__text").first();
    if (countryEl.length) {
      const country = countryEl.text().trim();
      if (country) result.country = country;
    }

    // Extract labeled fields from <strong> tags in Technical Data
    main.find("strong").each((_, el) => {
      const label = $(el).text().trim().toLowerCase();
      const field = LABEL_MAP[label];
      if (!field) return;

      // Get next sibling text
      const sibling = el.nextSibling;
      if (!sibling) return;

      const value = (sibling as unknown as Text).data?.trim() || "";
      if (!value) return;

      // Validate: reject sentence fragments (bad HTML parse)
      if (field === "process" && this.isInvalidProcess(value)) return;

      // Producer should be just a name (max 5 words), not a description
      if (field === "producer" && this.isInvalidProducer(value)) return;

      result[field] = value;
    });

    // Filter out empty values
    return Object.fromEntries(
      Object.entries(result).filter(([_, v]) => v)
    ) as Record<string, string | null>;
  }

  private isInvalidProcess(value: string): boolean {
    // Too many words for a process name
    if (value.split(/\s+/).length > 6) return true;

    // Sentence fragment indicators
    const badStarts = ["in ", "by ", "from ", "the ", "this ", "a ", "an "];
    const lower = value.toLowerCase();
    return badStarts.some((s) => lower.startsWith(s));
  }

  private isInvalidProducer(value: string): boolean {
    // Producer name should be max 5 words (e.g., "Roger and Alex Ureña")
    if (value.split(/\s+/).length > 6) return true;

    // Sentence indicators - producer shouldn't be a sentence
    const lower = value.toLowerCase();
    if (lower.includes(" is ") || lower.includes(" has ") || lower.includes(" we ")) return true;

    return false;
  }
}
