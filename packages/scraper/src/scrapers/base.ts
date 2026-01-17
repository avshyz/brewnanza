/**
 * Base scraper class - all scrapers inherit from this.
 * Ported from Python's scrapers/base.py
 */

import type { RoasterConfig } from "../config.js";
import type { Coffee, ScrapeResult } from "../models.js";
import { REQUEST_TIMEOUT, USER_AGENT, REQUEST_DELAY } from "../config.js";

export type ScraperConstructor = new (config: RoasterConfig) => BaseScraper;

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff.
 */
async function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(Math.min(delay, 10000));
      }
    }
  }
  throw lastError;
}

/**
 * Abstract base class for all coffee scrapers.
 */
export abstract class BaseScraper {
  protected config: RoasterConfig;
  private lastRequestTime = 0;

  constructor(config: RoasterConfig) {
    this.config = config;
  }

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
   * Fetch a URL with throttling and retry on transient errors.
   */
  async fetch(url: string): Promise<Response> {
    await this.throttle();

    return retry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      try {
        const response = await fetch(url, {
          headers: { "User-Agent": USER_AGENT },
          signal: controller.signal,
          redirect: "follow",
        });
        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    });
  }

  /**
   * Fetch JSON from a URL with retry.
   */
  async fetchJson<T = unknown>(url: string): Promise<T> {
    const response = await this.fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  /**
   * Fetch HTML from a URL with retry.
   */
  async fetchHtml(url: string): Promise<string> {
    const response = await this.fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.text();
  }

  /**
   * Scrape all coffees from this roaster. Must be implemented by subclasses.
   */
  abstract scrape(): Promise<Coffee[]>;

  /**
   * Run the scraper and return results.
   */
  async run(): Promise<ScrapeResult> {
    const errors: string[] = [];
    let coffees: Coffee[] = [];

    try {
      coffees = await this.scrape();
    } catch (error) {
      errors.push(`Scraper error: ${error}`);
    }

    return {
      roasterId: this.config.id,
      roasterName: this.config.name,
      coffees,
      scrapedAt: new Date().toISOString(),
      errors,
    };
  }
}
