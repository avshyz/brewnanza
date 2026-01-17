/**
 * Shared utility functions for coffee scrapers.
 * Ported from Python's utils.py
 */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { FIELD_PATTERNS } from "./config.js";

/**
 * Split a string field into a list, handling common delimiters.
 */
export function splitListField(text: string | null | undefined, delimiters = /[,&/]/): string[] {
  if (!text) return [];
  return text
    .split(delimiters)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Convert HTML to plain text using cheerio.
 */
export function htmlToText(html: string | null | undefined, separator = " "): string {
  if (!html) return "";

  const $ = cheerio.load(html);

  // Remove script and style elements
  $("script, style").remove();

  // Add newlines after block elements for better text extraction
  $("p, br, div, h1, h2, h3, h4, h5, h6, li").after("\n");

  // Get text and normalize whitespace
  const text = $("body").text();

  // Collapse multiple whitespace/newlines into single space or newline
  if (separator === "\n") {
    return text
      .replace(/[^\S\n]+/g, " ")  // collapse horizontal whitespace to single space
      .replace(/\n\s*\n/g, "\n")  // collapse multiple newlines
      .trim();
  }

  return text.replace(/\s+/g, " ").trim();
}

// Common main content selectors (order matters - more specific first)
const MAIN_CONTENT_SELECTORS = [
  ".uncont", // Tanat
  "product-info", // La Cabra (custom element)
  ".product__info-container", // La Cabra fallback
  ".product-single", // Shopify common
  ".product__info", // Shopify common
  "article.product", // Generic
  "main .product", // Generic
  "article", // Fallback
  "main", // Fallback
  ".main-content", // Fallback
];

/**
 * Find the main content container, avoiding related products/navigation.
 */
export function findMainContent(
  $: cheerio.CheerioAPI,
  selectors?: string[]
): cheerio.Cheerio<AnyNode> {
  const allSelectors = [...(selectors || []), ...MAIN_CONTENT_SELECTORS];

  for (const selector of allSelectors) {
    const el = $(selector);
    if (el.length > 0) {
      return el.first();
    }
  }

  return $("body"); // Fallback to whole page
}

/**
 * Extract structured fields from text using regex patterns.
 */
export function extractFieldsFromText(
  text: string | null | undefined,
  patterns: Record<string, string> = FIELD_PATTERNS
): Record<string, string> {
  if (!text) return {};

  const result: Record<string, string> = {};
  for (const [key, pattern] of Object.entries(patterns)) {
    const match = text.match(new RegExp(pattern, "i"));
    if (match?.[1]) {
      result[key] = match[1].trim();
    }
  }
  return result;
}

/**
 * Extract roastedFor from 'Best Brewed with:' line.
 * Returns null if both/omni, "filter" or "espresso" if specific.
 */
export function extractRoastedFor(text: string | null | undefined): "filter" | "espresso" | null {
  if (!text) return null;

  const match = text.match(/Best Brewed with[:\s]+([^\n]+)/i);
  if (!match) return null;

  const brewLine = match[1].toLowerCase();
  const hasFilter = brewLine.includes("filter");
  const hasEspresso = brewLine.includes("espresso") || brewLine.includes("moka");

  // null = omni (both filter and espresso)
  if (hasFilter && hasEspresso) return null;
  if (hasFilter) return "filter";
  if (hasEspresso) return "espresso";
  return null;
}

/**
 * Extract text from multilingual field (handles dict or string).
 */
export function getMultilingualText(
  obj: Record<string, string> | string | null | undefined,
  lang = "en"
): string | null {
  if (typeof obj === "string") return obj;
  if (obj && typeof obj === "object") {
    return obj[lang] || obj.nl || obj.fr || null;
  }
  return null;
}

/** Log scraper error with consistent format */
export function logScrapeError(context: string, error: unknown): void {
  console.warn(`Error parsing ${context}:`, error);
}

/**
 * Extract first image URL from various image data formats.
 */
export function getFirstImage(
  images: Array<Record<string, string>> | Record<string, string> | null | undefined,
  key = "src"
): string | null {
  if (Array.isArray(images) && images.length > 0) {
    return images[0]?.[key] ?? null;
  }
  if (images && typeof images === "object" && !Array.isArray(images)) {
    return images[key] || images.main || null;
  }
  return null;
}
