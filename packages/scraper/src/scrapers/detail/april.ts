/**
 * April detail scraper - splits country/region and process/variety fields.
 */

import { DetailScraper } from "./base.js";
import type { Coffee } from "../../models.js";
import { normalizeCountry } from "../../countries.js";

// Process keywords to extract from variety field
const PROCESS_KEYWORDS = [
  "washed",
  "natural",
  "honey",
  "anaerobic",
  "carbonic",
  "semi-washed",
  "wet-hulled",
  "pulped natural",
];

/**
 * April stores "Country, Region" in country field and "Process Variety" in variety.
 */
export class AprilDetailScraper extends DetailScraper {
  async enhance(coffee: Coffee): Promise<void> {
    // Split "Country, Region" or "Region, Country"
    if (coffee.country && coffee.country.includes(",") && !coffee.region) {
      const parts = coffee.country.split(",").map((s) => s.trim());

      // Try to find which part is the country
      for (let i = 0; i < parts.length; i++) {
        const normalized = normalizeCountry(parts[i]);
        if (normalized) {
          coffee.country = normalized;
          // Other parts become region
          const regionParts = parts.filter((_, j) => j !== i);
          if (regionParts.length > 0) {
            coffee.region = regionParts.join(", ");
          }
          break;
        }
      }
    }

    // Extract process from variety if present
    if (coffee.variety.length > 0 && !coffee.process) {
      const newVarieties: string[] = [];
      const processes: string[] = [];

      for (const v of coffee.variety) {
        const lower = v.toLowerCase();
        let isProcess = false;

        for (const kw of PROCESS_KEYWORDS) {
          if (lower.includes(kw)) {
            processes.push(v);
            isProcess = true;
            break;
          }
        }

        if (!isProcess) {
          // Split on "&" for multiple varieties
          const split = v.split(/\s*&\s*/);
          newVarieties.push(...split);
        }
      }

      if (processes.length > 0) {
        coffee.process = processes.join(", ");
      }
      if (newVarieties.length > 0) {
        coffee.variety = newVarieties;
      }
    }
  }
}
