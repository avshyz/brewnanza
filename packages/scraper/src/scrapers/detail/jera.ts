/**
 * Jera Coffee detail scraper - parses Hebrew labels.
 */

import * as cheerio from "cheerio";
import { DetailScraper } from "./base.js";
import type { Coffee } from "../../models.js";
import { findMainContent, logScrapeError, splitListField } from "../../utils.js";
import { normalizeCountry } from "../../countries.js";

// Hebrew label to field mapping
const HEBREW_LABELS: Record<string, string> = {
  גובה: "altitude", // Height
  זן: "variety", // Variety
  עיבוד: "process", // Processing
  "פרופיל טעם": "notes", // Taste profile
  "דרגת קליה": "roastLevel", // Roast level
  מקור: "origin", // Origin
  אזור: "region", // Region
  מדינה: "country", // Country
  חקלאי: "producer", // Farmer
  יצרן: "producer", // Producer
};

// Roast level mapping (Hebrew to roastedFor value)
// null = omni/both
const ROAST_MAP: Record<string, "filter" | "espresso" | null> = {
  קלה: "filter", // Light → filter
  בינונית: null, // Medium → omni (null)
  כהה: "espresso", // Dark → espresso
};

/**
 * Jera Coffee uses Hebrew labels in product pages.
 */
export class JeraDetailScraper extends DetailScraper {
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
      if (details.roastedFor !== undefined) {
        coffee.roastedFor = details.roastedFor as "filter" | "espresso" | null;
      }
    } catch (error) {
      logScrapeError(`Jera detail for ${coffee.url}`, error);
    }
  }

  private parsePage($: cheerio.CheerioAPI): Record<string, string> {
    const result: Record<string, string> = {};

    // Scope to main content
    const main = findMainContent($);
    const text = main.text();

    // First heading often contains "Country | Region" (e.g., "הונדורס | Santa Barbara, Lempira")
    const firstHeading = main.find("h1, h2, h3").first().text().trim();
    if (firstHeading && firstHeading.includes("|")) {
      this.parseOrigin(firstHeading, result);
    }

    // Look for Hebrew labels followed by values
    for (const [hebrew, field] of Object.entries(HEBREW_LABELS)) {
      // Pattern: "Label: Value" or "Label Value"
      const patterns = [
        new RegExp(`${hebrew}[:\\s]+([^\\n|]+)`, "u"),
        new RegExp(`${hebrew}\\s*[:-]?\\s*([א-ת\\w\\s,]+)`, "u"),
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          let value = match[1].trim();

          if (field === "origin") {
            // Split "Country | Region" or "Country, Region"
            this.parseOrigin(value, result);
          } else if (field === "roastLevel") {
            // Map Hebrew roast level to roastedFor
            for (const [hebrewLevel, roastedFor] of Object.entries(ROAST_MAP)) {
              if (value.includes(hebrewLevel)) {
                result.roastedFor = roastedFor;
                break;
              }
            }
          } else {
            result[field] = value;
          }
          break;
        }
      }
    }

    // Also try table-based extraction
    main.find("table tr, .product-attribute").each((_, el) => {
      const $el = $(el);
      const labelText = $el.find("th, .label, strong").text().trim();
      const valueText = $el.find("td, .value").text().trim();

      if (!labelText || !valueText) return;

      for (const [hebrew, field] of Object.entries(HEBREW_LABELS)) {
        if (labelText.includes(hebrew)) {
          if (field === "origin") {
            this.parseOrigin(valueText, result);
          } else if (field === "roastLevel") {
            for (const [hebrewLevel, roastedFor] of Object.entries(ROAST_MAP)) {
              if (valueText.includes(hebrewLevel)) {
                result.roastedFor = roastedFor;
                break;
              }
            }
          } else {
            result[field] = valueText;
          }
          break;
        }
      }
    });

    return result;
  }

  private parseOrigin(value: string, result: Record<string, string>): void {
    // Try "Country | Region" or "Country, Region" format
    const separators = ["|", ",", "-"];

    for (const sep of separators) {
      if (value.includes(sep)) {
        const parts = value.split(sep).map((s) => s.trim());

        for (let i = 0; i < parts.length; i++) {
          const normalized = normalizeCountry(parts[i]);
          if (normalized) {
            result.country = normalized;
            const regionParts = parts.filter((_, j) => j !== i);
            if (regionParts.length > 0) {
              result.region = regionParts.join(", ");
            }
            return;
          }
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
