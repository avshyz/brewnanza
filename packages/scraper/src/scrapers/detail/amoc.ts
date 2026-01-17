/**
 * AMOC (A Matter of Concrete) detail scraper - parses HTML tables.
 */

import * as cheerio from "cheerio";
import { DetailScraper } from "./base.js";
import type { Coffee } from "../../models.js";
import { findMainContent, logScrapeError, splitListField } from "../../utils.js";
import { normalizeCountry } from "../../countries.js";

// Label to field mapping
const LABEL_MAP: Record<string, string> = {
  origin: "origin", // Special: split into region + country
  country: "country",
  region: "region",
  producer: "producer",
  farm: "farm",
  variety: "variety",
  varietal: "variety",
  process: "process",
  processing: "process",
  altitude: "altitude",
  elevation: "altitude",
  notes: "notes",
  "tasting notes": "notes",
  "flavor notes": "notes",
};

/**
 * AMOC uses HTML tables for coffee details.
 */
export class AmocDetailScraper extends DetailScraper {
  async enhance(coffee: Coffee): Promise<void> {
    if (!coffee.url) return;

    try {
      const html = await this.fetchHtml(coffee.url);
      const $ = cheerio.load(html);
      const details = this.parsePage($);

      // Apply extracted fields
      if (details.country && !coffee.country) {
        coffee.country = details.country;
      }
      if (details.region && !coffee.region) {
        coffee.region = details.region;
      }
      if (details.producer && !coffee.producer) {
        coffee.producer = details.producer;
      }
      if (details.variety && coffee.variety.length === 0) {
        coffee.variety = splitListField(details.variety);
      }
      if (details.process && !coffee.process) {
        coffee.process = details.process;
      }
      if (details.altitude && !coffee.altitude) {
        coffee.altitude = details.altitude;
      }
      if (details.notes && coffee.notes.length === 0) {
        coffee.notes = splitListField(details.notes);
      }
    } catch (error) {
      logScrapeError(`AMOC detail for ${coffee.url}`, error);
    }
  }

  private parsePage($: cheerio.CheerioAPI): Record<string, string> {
    const result: Record<string, string> = {};

    // Scope to main content
    const main = findMainContent($);

    // Find tables with th/td pairs
    main.find("table tr, .product-attributes tr").each((_, row) => {
      const $row = $(row);
      const th = $row.find("th").text().trim().toLowerCase();
      const td = $row.find("td").text().trim();

      if (!th || !td) return;

      const field = LABEL_MAP[th];
      if (!field) return;

      if (field === "origin") {
        // Split "Region, Country" format
        this.parseOrigin(td, result);
      } else {
        result[field] = td;
      }
    });

    // Fallback: look for heading/text patterns
    if (Object.keys(result).length === 0) {
      main.find("h3, h4, .attribute-label, strong").each((_, el) => {
        const $el = $(el);
        const label = $el.text().trim().toLowerCase();
        const field = LABEL_MAP[label];

        if (field) {
          // Get next sibling text
          const value = $el.next().text().trim();
          if (value) {
            if (field === "origin") {
              this.parseOrigin(value, result);
            } else {
              result[field] = value;
            }
          }
        }
      });
    }

    return result;
  }

  private parseOrigin(value: string, result: Record<string, string>): void {
    // Try "Region, Country" format
    if (value.includes(",")) {
      const parts = value.split(",").map((s) => s.trim());

      // Last part is usually country
      for (let i = parts.length - 1; i >= 0; i--) {
        const normalized = normalizeCountry(parts[i]);
        if (normalized) {
          result.country = normalized;
          const regionParts = parts.slice(0, i);
          if (regionParts.length > 0) {
            result.region = regionParts.join(", ");
          }
          return;
        }
      }
    }

    // Try as country directly
    const normalized = normalizeCountry(value);
    if (normalized) {
      result.country = normalized;
    }
  }
}
