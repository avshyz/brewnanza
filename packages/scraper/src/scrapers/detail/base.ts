/**
 * Base detail scraper class for per-roaster HTML parsing.
 * Ported from Python's scrapers/detail/base.py
 */

import type { Coffee } from "../../models.js";
import { REQUEST_TIMEOUT, USER_AGENT, REQUEST_DELAY } from "../../config.js";

export type DetailScraperConstructor = new () => DetailScraper;

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Base class for detail scrapers that enhance Coffee objects with HTML data.
 */
export abstract class DetailScraper {
  private lastRequestTime = 0;

  /**
   * Respect rate limits between requests.
   */
  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < REQUEST_DELAY) {
      await sleep(REQUEST_DELAY - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch HTML from a URL.
   */
  protected async fetchHtml(url: string): Promise<string> {
    await this.throttle();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Enhance a coffee with data from its product page.
   * Must be implemented by subclasses.
   */
  abstract enhance(coffee: Coffee): Promise<void>;

  /**
   * Enhance multiple coffees.
   */
  async enhanceAll(coffees: Coffee[]): Promise<void> {
    for (const coffee of coffees) {
      try {
        await this.enhance(coffee);
      } catch (error) {
        console.warn(`Error enhancing ${coffee.name}:`, error);
      }
    }
  }
}
