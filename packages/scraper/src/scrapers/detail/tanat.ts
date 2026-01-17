/**
 * Tanat detail scraper - extracts data from product page HTML.
 * Ported from Python's scrapers/detail/tanat.py
 */

import * as cheerio from "cheerio";
import { DetailScraper } from "./base.js";
import type { Coffee } from "../../models.js";
import { splitListField, findMainContent, logScrapeError } from "../../utils.js";
import { KNOWN_REGIONS } from "../../countries.js";

/**
 * Extracts tasting notes from Tanat product pages.
 *
 * The WooCommerce Store API often omits 'Profil Aromatique' attribute
 * but it's rendered in the HTML product attributes table.
 */
export class TanatDetailScraper extends DetailScraper {
  async enhance(coffee: Coffee): Promise<void> {
    if (!coffee.url) return;

    const needsRegion = !coffee.region;

    try {
      const html = await this.fetchHtml(coffee.url);
      const $ = cheerio.load(html);

      // Always extract notes from HTML - more accurate than WooCommerce API
      const notes = this.extractNotes($);
      if (notes.length > 0) {
        coffee.notes = notes;
      }

      if (needsRegion) {
        const region = this.extractRegion($);
        if (region) {
          coffee.region = region;
        }
      }
    } catch (error) {
      logScrapeError(`Tanat detail for ${coffee.url}`, error);
    }
  }

  /**
   * Extract notes from product page.
   * Scope to main content to avoid related products.
   * Look for .detail-value with "Note de dégustation" label.
   */
  private extractNotes($: cheerio.CheerioAPI): string[] {
    const noteLabels = [
      "note de dégustation",
      "notes de dégustation",
      "profil aromatique",
    ];

    // Scope to main content - avoids related products entirely
    const main = findMainContent($);

    // Look for .detail-label + .detail-value pairs
    const labelEls = main.find(".detail-label");
    for (let i = 0; i < labelEls.length; i++) {
      const labelEl = labelEls.eq(i);
      const label = labelEl.text().trim().toLowerCase().replace(/:$/, "");

      if (noteLabels.includes(label)) {
        const valueEl = labelEl.next(".detail-value");
        if (valueEl.length) {
          const raw = valueEl.text().trim();
          // French uses " - " as separator
          return splitListField(raw, /\s*-\s*|,\s*/);
        }
      }
    }

    // Fallback: meta description for products without .detail-value
    const meta = $('meta[name="description"]');
    if (meta.length) {
      const content = meta.attr("content") || "";
      const match = content.match(
        /notes?\s+(?:de\s+)?([^.]+?)(?:\.|Profil|$)/i
      );
      if (match) {
        const rawNotes = match[1].trim();
        return splitListField(rawNotes, /,\s*|\s+et\s+/);
      }
    }

    return [];
  }

  /**
   * Extract region from page text.
   * 1. Try French patterns: "région de X", "la région X"
   * 2. Fall back to matching KNOWN_REGIONS list
   */
  private extractRegion($: cheerio.CheerioAPI): string | null {
    const text = $("body").text().replace(/\s+/g, " ").trim();

    // French/English patterns: "région de X", "region of X", "la région X"
    const regionPatterns = [
      /r[eé]gion\s+de\s+([A-Z][a-zéèêë]+(?:\s+[A-Z][a-zéèêë]+)?)/,
      /la\s+r[eé]gion\s+([A-Z][a-zéèêë]+(?:\s+[A-Z][a-zéèêë]+)?)/,
      /region\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    ];

    for (const pattern of regionPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Fall back to known regions list
    const textLower = text.toLowerCase();
    for (const region of KNOWN_REGIONS) {
      if (textLower.includes(region.toLowerCase())) {
        return region;
      }
    }

    return null;
  }
}
