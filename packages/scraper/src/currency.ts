/**
 * Currency conversion utilities.
 * Ported from Python's currency.py
 *
 * Uses static ECB rates (no API calls).
 * Rates last updated: 2025-01-01
 */

// Static exchange rates to USD (from ECB data)
// These are approximations - update periodically for accuracy
const EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.27,
  DKK: 0.145,
  SEK: 0.095,
  ILS: 0.27,
  NOK: 0.09,
  CHF: 1.12,
  CAD: 0.74,
  AUD: 0.64,
  JPY: 0.0067,
  NZD: 0.59,
};

const cache = new Map<string, number | null>();

/** Convert amount from given currency to USD (cached) */
export function toUsd(amount: number, currency: string): number | null {
  if (currency === "USD") {
    return Math.round(amount * 100) / 100;
  }

  const cacheKey = `${amount}:${currency}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }

  const rate = EXCHANGE_RATES[currency.toUpperCase()];
  if (!rate) {
    cache.set(cacheKey, null);
    return null;
  }

  const result = Math.round(amount * rate * 100) / 100;
  cache.set(cacheKey, result);
  return result;
}

// Hebrew weight pattern
const HEBREW_WEIGHT = /([\d.]+)\s*(?:קג|ק"ג|גר|גרם)/;
const PLAIN_NUMBER = /^\d+$/;
// Standard weight patterns
const WEIGHT_PATTERNS: [RegExp, number][] = [
  [/(\d+(?:\.\d+)?)\s*kg/i, 1000],
  [/(\d+(?:\.\d+)?)\s*g(?:r(?:ams?)?)?/i, 1],
  [/(\d+(?:\.\d+)?)\s*oz/i, 28.35],
  [/(\d+(?:\.\d+)?)\s*lb/i, 453.6],
];

/**
 * Parse weight string to grams.
 * Examples: "250g" -> 250, "1kg" -> 1000, "200gr" -> 200
 * Handles Hebrew units (קג, גרם) as fallback.
 */
export function parseWeightGrams(weightStr: string | null | undefined): number | null {
  if (!weightStr) return null;

  const text = weightStr.trim();

  // Try Hebrew patterns first
  const hebrewMatch = text.match(HEBREW_WEIGHT);
  if (hebrewMatch) {
    const value = parseFloat(hebrewMatch[1]);
    const unit = hebrewMatch[0].slice(hebrewMatch[1].length).trim();
    if (unit.includes("קג") || unit.includes('ק"ג')) {
      return Math.round(value * 1000);
    }
    return Math.round(value);
  }

  // Try plain number (assume grams)
  if (PLAIN_NUMBER.test(text)) {
    return parseInt(text, 10);
  }

  // Try standard weight patterns
  for (const [pattern, multiplier] of WEIGHT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return Math.round(parseFloat(match[1]) * multiplier);
    }
  }

  return null;
}
