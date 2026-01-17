/**
 * Translation utilities using Anthropic Claude.
 * Translates non-English coffee data to English.
 * Includes file-based cache to avoid re-translating during development.
 */

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Coffee } from "./models.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, "..", "cache", "translations.json");

// Fields to translate
const TRANSLATABLE_FIELDS = [
  "name",
  "description",
  "producer",
  "farm",
  "region",
  "process",
  "protocol",
] as const;

// Roasters that need translation
export const ROASTERS_NEEDING_TRANSLATION = new Set([
  "tanat", // French
  "coffeeorg", // Hebrew
  "jera", // Hebrew
]);

let client: Anthropic | null = null;
let cache: Map<string, string> | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTRHOPIC_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTRHOPIC_KEY or ANTHROPIC_API_KEY environment variable is required for translation");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * Load translation cache from disk.
 */
function loadCache(): Map<string, string> {
  if (cache) return cache;

  cache = new Map();

  if (existsSync(CACHE_FILE)) {
    try {
      const data = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
      if (Array.isArray(data)) {
        for (const entry of data) {
          const key = Object.keys(entry)[0];
          if (key) {
            cache.set(key, entry[key]);
          }
        }
      }
    } catch {
      // Ignore cache read errors
    }
  }

  return cache;
}

/**
 * Save translation cache to disk.
 */
function saveCache(): void {
  if (!cache) return;

  const cacheDir = dirname(CACHE_FILE);
  if (!existsSync(cacheDir)) {
    const { mkdirSync } = require("fs");
    mkdirSync(cacheDir, { recursive: true });
  }

  const data = Array.from(cache.entries()).map(([key, value]) => ({
    [key]: value,
  }));

  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

/**
 * Get cached translation or null if not cached.
 */
function getCached(text: string): string | null {
  const c = loadCache();
  return c.get(text) ?? null;
}

/**
 * Store translation in cache.
 */
function setCache(original: string, translated: string): void {
  const c = loadCache();
  c.set(original, translated);
  saveCache();
}

/**
 * Detect if text contains non-Latin characters (Hebrew, French accents, etc.)
 */
function needsTranslation(text: string | null): boolean {
  if (!text) return false;
  // Hebrew characters: \u0590-\u05FF
  const hebrewPattern = /[\u0590-\u05FF]/;
  if (hebrewPattern.test(text)) return true;

  // Check for French - has accented chars
  const frenchPattern = /[àâäéèêëïîôùûüçœæ]/i;
  if (frenchPattern.test(text)) return true;

  return false;
}

/**
 * Translate a single coffee's fields using Claude.
 */
async function translateCoffee(coffee: Coffee): Promise<void> {
  // Collect fields that need translation
  const toTranslate: Record<string, string> = {};

  for (const field of TRANSLATABLE_FIELDS) {
    const value = coffee[field];
    if (typeof value === "string" && needsTranslation(value)) {
      toTranslate[field] = value;
    }
  }

  // Also check array fields
  if (coffee.notes.some(needsTranslation)) {
    toTranslate["notes"] = coffee.notes.join(", ");
  }
  if (coffee.variety.some(needsTranslation)) {
    toTranslate["variety"] = coffee.variety.join(", ");
  }

  if (Object.keys(toTranslate).length === 0) {
    return; // Nothing to translate
  }

  // Check cache first
  const cacheKey = JSON.stringify(toTranslate);
  const cached = getCached(cacheKey);

  if (cached) {
    // Apply cached translations
    const translated = JSON.parse(cached);
    applyTranslations(coffee, translated);
    return;
  }

  const client = getClient();

  const prompt = `Translate the following coffee product fields from Hebrew or French to English.
Keep coffee terminology accurate (varietals, processes, regions should use standard English coffee terms).

IMPORTANT: Return ONLY raw JSON. No markdown, no code blocks, no explanation. Just the JSON object.

Fields to translate:
${JSON.stringify(toTranslate, null, 2)}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") return;

    // Strip markdown code blocks if present
    let jsonText = content.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    // Parse and cache the result
    const translated = JSON.parse(jsonText);
    setCache(cacheKey, JSON.stringify(translated));

    // Apply translations
    applyTranslations(coffee, translated);
  } catch (error) {
    console.error(`Translation error for ${coffee.name}:`, error);
    // Don't fail the scrape, just skip translation
  }
}

/**
 * Apply translated fields back to coffee object.
 */
function applyTranslations(coffee: Coffee, translated: Record<string, unknown>): void {
  for (const [field, value] of Object.entries(translated)) {
    if (field === "notes" && typeof value === "string") {
      coffee.notes = value.split(/,\s*/).filter(Boolean);
    } else if (field === "variety" && typeof value === "string") {
      coffee.variety = value.split(/,\s*/).filter(Boolean);
    } else if (field in coffee && typeof value === "string") {
      (coffee as Record<string, unknown>)[field] = value;
    }
  }
}

/**
 * Translate all coffees from non-English roasters.
 * Batches requests to avoid rate limits.
 */
export async function translateCoffees(
  coffees: Coffee[],
  roasterId: string
): Promise<void> {
  if (!ROASTERS_NEEDING_TRANSLATION.has(roasterId)) {
    return;
  }

  if (!process.env.ANTRHOPIC_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.warn(`Skipping translation for ${roasterId}: ANTRHOPIC_KEY not set`);
    return;
  }

  console.log(`  Translating ${coffees.length} coffees...`);

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < coffees.length; i += batchSize) {
    const batch = coffees.slice(i, i + batchSize);
    await Promise.all(batch.map(translateCoffee));

    // Small delay between batches
    if (i + batchSize < coffees.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}
