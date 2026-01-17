/**
 * Standout detail scraper - extracts notes from description text.
 */

import { DetailScraper } from "./base.js";
import type { Coffee } from "../../models.js";
import { splitListField } from "../../utils.js";

// Note extraction patterns
const NOTES_PATTERNS = [
  /notes?\s+of\s+([^.]+)/i,
  /in\s+the\s+cup[,:]?\s+([^.]+)/i,
  /aroma\s+of\s+([^.]+)/i,
  /flavor\s+profile[:\s]+([^.]+)/i,
  /tasting\s+notes[:\s]+([^.]+)/i,
  /expect\s+([^.]+)/i,
];

/**
 * Standout embeds tasting notes in prose descriptions.
 */
export class StandoutDetailScraper extends DetailScraper {
  async enhance(coffee: Coffee): Promise<void> {
    // Only extract if no notes already
    if (coffee.notes.length > 0) return;
    if (!coffee.description) return;

    const notes = this.extractNotes(coffee.description);
    if (notes.length > 0) {
      coffee.notes = notes;
    }
  }

  private extractNotes(text: string): string[] {
    for (const pattern of NOTES_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        let notesText = match[1].trim();

        // Clean trailing conjunctions
        notesText = notesText.replace(/\s+and\s+a\s*$/i, "");
        notesText = notesText.replace(/\s+with\s*$/i, "");

        // Split on common delimiters
        const notes = splitListField(notesText, /,\s*|\s+and\s+|\s+with\s+/);

        // Remove duplicates while preserving order
        const seen = new Set<string>();
        return notes.filter((n) => {
          const lower = n.toLowerCase();
          if (seen.has(lower)) return false;
          seen.add(lower);
          return true;
        });
      }
    }

    return [];
  }
}
