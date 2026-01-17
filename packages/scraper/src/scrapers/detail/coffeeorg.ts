/**
 * CoffeeOrg detail scraper - parses pipe-separated format from description.
 */

import { DetailScraper } from "./base.js";
import type { Coffee } from "../../models.js";
import { splitListField } from "../../utils.js";

// Label to field mapping
const LABEL_MAP: Record<string, string> = {
  variety: "variety",
  varietal: "variety",
  region: "region",
  producer: "producer",
  farm: "farm",
  process: "process",
  altitude: "altitude",
  elevation: "altitude",
};

/**
 * CoffeeOrg uses pipe-separated format: "Variety - Value | Region - Value | ..."
 */
export class CoffeeOrgDetailScraper extends DetailScraper {
  async enhance(coffee: Coffee): Promise<void> {
    if (!coffee.description) return;

    const details = this.parseDescription(coffee.description);

    // Apply fields that are currently empty
    if (details.variety && coffee.variety.length === 0) {
      coffee.variety = splitListField(details.variety);
    }
    if (details.region && !coffee.region) {
      coffee.region = details.region;
    }
    if (details.producer && !coffee.producer) {
      coffee.producer = details.producer;
    }
    if (details.farm && !coffee.farm) {
      coffee.farm = details.farm;
    }
    if (details.process && !coffee.process) {
      coffee.process = details.process;
    }
    if (details.altitude && !coffee.altitude) {
      // Clean trailing "m" if present
      coffee.altitude = details.altitude.replace(/\s*m$/, "");
    }
    if (details.notes && coffee.notes.length === 0) {
      coffee.notes = splitListField(details.notes);
    }
  }

  private parseDescription(text: string): Record<string, string> {
    const result: Record<string, string> = {};

    // Notes are often the first sentence (before period or before first "Label - ")
    // Example: "Peach, lemongrass, black tea. Variety - Heirloom | Region..."
    const notesMatch = text.match(/^([^.|]+?)(?:\.\s*|\s*(?=\w+\s*-\s*))/);
    if (notesMatch) {
      const notes = notesMatch[1].trim();
      // Only use if it doesn't look like a label
      if (!notes.match(/^\w+\s*$/)) {
        result.notes = notes;
      }
    }

    // Parse "Label - Value" patterns separated by | or .
    const parts = text.split(/[|.]/);
    for (const part of parts) {
      const match = part.match(/^\s*([^-]+)\s*-\s*(.+?)\s*$/);
      if (match) {
        const label = match[1].toLowerCase().trim();
        const value = match[2].trim();

        const field = LABEL_MAP[label];
        if (field) {
          result[field] = value;
        }
      }
    }

    return result;
  }
}
