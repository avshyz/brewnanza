/**
 * Devocion detail scraper - sets country to Colombia if not set.
 */

import { DetailScraper } from "./base.js";
import type { Coffee } from "../../models.js";

/**
 * Devocion coffees are all from Colombia.
 */
export class DevocionDetailScraper extends DetailScraper {
  async enhance(coffee: Coffee): Promise<void> {
    if (!coffee.country) {
      coffee.country = "Colombia";
    }
  }
}
