/**
 * AI-powered coffee data extraction using Anthropic Claude.
 *
 * This module handles:
 * 1. Product qualification (is this actual coffee or bundle/subscription?)
 * 2. Detail extraction (extract structured coffee data from HTML)
 * 3. File-based caching to avoid re-processing
 */

import Anthropic from "@anthropic-ai/sdk";
import sanitizeHtml from "sanitize-html";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Coffee } from "./models.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, "..", "cache");
const DETAILS_CACHE_FILE = join(CACHE_DIR, "ai_details.json");
const QUALIFY_CACHE_FILE = join(CACHE_DIR, "ai_qualify.json");

const MODEL = "claude-sonnet-4-20250514";

// ============================================================================
// Prompts
// ============================================================================

const QUALIFY_PROMPT = `Classify this product. Is it ACTUAL COFFEE BEANS to scrape, or something else to skip?

ACTUAL COFFEE (isCoffee: true):
- Single origin coffee beans (e.g., "Ethiopia Yirgacheffe Natural")
- Coffee blends (e.g., "House Blend", "Espresso Blend")
- Named lots/micro-lots (e.g., "Fredy Sabillon Honey")

NOT COFFEE - SKIP (isCoffee: false):
- Subscriptions, bundles, sample packs, taster sets
- Gift cards, vouchers
- Brewing equipment (grinders, kettles, scales, drippers, filters)
- Merchandise (t-shirts, mugs, tote bags, caps)
- Books, accessories
- Capsules, pods, instant coffee
- Brewing classes, courses

Product name: "{name}"

Return ONLY: {"isCoffee": true} or {"isCoffee": false}`;

const EXTRACT_PROMPT = `Extract coffee information from this product page.

IMPORTANT: Return ONLY raw JSON. No markdown, no code blocks, no explanation, no preamble.
CRITICAL: Extract data ONLY from the MAIN PRODUCT. Ignore "Related Products" or "You might also like" sections.
LANGUAGE: ALL values MUST be in ENGLISH. Translate any non-English text (French, Spanish, etc.):
- Countries: Mexique → Mexico, Brésil → Brazil, Équateur → Ecuador, Pérou → Peru
- Protocols: Translate processing descriptions to English
- All other fields: Use English equivalents
SANITIZE: Clean all output values:
- Decode HTML entities: &#8211; → –, &amp; → &, etc.
- Remove extra whitespace, normalize spacing
- No HTML tags in output values

## ALL FIELDS ARE ARRAYS (to support blends)

For SINGLE ORIGIN coffee: use arrays with one element, e.g., country: ["Ethiopia"]
For BLENDS: use arrays with multiple elements, e.g., country: ["Ethiopia", "Colombia"]

## FIELDS TO EXTRACT (use empty array [] if not found):

1. **country** (array): Origin countries where the coffee was grown.
   Single origin: ["Ethiopia"]
   Blend: ["Ethiopia", "Colombia"]

2. **region** (array): Specific growing regions within the countries.
   Single origin: ["Yirgacheffe"]
   Blend: ["Yirgacheffe", "Huila"]

3. **producer** (array): Names of farmers, families, cooperatives who grew the coffee.
   Single origin: ["Fredy Sabillon"]
   Blend: ["Fredy Sabillon", "Finca El Paraiso"]
   - ONLY the name (max 5 words), not descriptions

4. **process** (array): Processing method names ONLY (1-3 words each).
   Single origin: ["natural"]
   Blend: ["natural", "washed"]
   Valid values: "washed", "natural", "honey", "anaerobic", "carbonic maceration", etc.

5. **protocol** (array): Detailed processing descriptions.
   Example: ["Cherries dried on raised beds for 21 days"]
   - Leave empty [] if only process name is mentioned without details

6. **variety** (array): Coffee varietals/cultivars.
   Example: ["SL28", "Gesha", "Bourbon"]

## OUTPUT FORMAT:

{
  "country": ["Ethiopia"],
  "region": ["Yirgacheffe"],
  "producer": ["Smallholder Farmers"],
  "process": ["natural"],
  "protocol": [],
  "variety": ["Heirloom"]
}

For a blend:
{
  "country": ["Ethiopia", "Colombia"],
  "region": ["Sidama", "Huila"],
  "producer": [],
  "process": ["natural", "washed"],
  "protocol": [],
  "variety": ["Heirloom", "Castillo"]
}

Text to extract from:
`;

// ============================================================================
// Cache Management
// ============================================================================

type DetailsCache = Record<string, ExtractedDetails>;
type QualifyCache = Record<string, boolean>;

let detailsCache: DetailsCache | null = null;
let qualifyCache: QualifyCache | null = null;

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function loadDetailsCache(): DetailsCache {
  if (detailsCache) return detailsCache;
  ensureCacheDir();
  if (existsSync(DETAILS_CACHE_FILE)) {
    try {
      detailsCache = JSON.parse(readFileSync(DETAILS_CACHE_FILE, "utf-8"));
      return detailsCache!;
    } catch {
      // Ignore
    }
  }
  detailsCache = {};
  return detailsCache;
}

function saveDetailsCache(): void {
  if (!detailsCache) return;
  ensureCacheDir();
  writeFileSync(DETAILS_CACHE_FILE, JSON.stringify(detailsCache, null, 2));
}

function loadQualifyCache(): QualifyCache {
  if (qualifyCache) return qualifyCache;
  ensureCacheDir();
  if (existsSync(QUALIFY_CACHE_FILE)) {
    try {
      qualifyCache = JSON.parse(readFileSync(QUALIFY_CACHE_FILE, "utf-8"));
      return qualifyCache!;
    } catch {
      // Ignore
    }
  }
  qualifyCache = {};
  return qualifyCache;
}

function saveQualifyCache(): void {
  if (!qualifyCache) return;
  ensureCacheDir();
  writeFileSync(QUALIFY_CACHE_FILE, JSON.stringify(qualifyCache, null, 2));
}

// ============================================================================
// HTML Processing
// ============================================================================

/**
 * Strip HTML to plain text - remove scripts, styles, nav, footer, related products.
 */
export function stripHtml(html: string): string {
  const clean = sanitizeHtml(html, {
    allowedTags: [], // Strip all tags, return text only
    allowedAttributes: {},
    exclusiveFilter: (frame) => {
      // Remove these elements entirely (including their text content)
      const tagsToRemove = [
        "script",
        "style",
        "noscript",
        "iframe",
        "svg",
        "nav",
        "footer",
        "header",
      ];
      return tagsToRemove.includes(frame.tag);
    },
  });

  // Clean up whitespace
  return clean
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

// ============================================================================
// AI Client
// ============================================================================

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTRHOPIC_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable required");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// ============================================================================
// AI Functions
// ============================================================================

export interface ExtractedDetails {
  country: string[];
  region: string[];
  producer: string[];
  process: string[];
  protocol: string[];
  variety: string[];
}

/**
 * Qualify if a product name represents actual coffee (vs bundle/subscription).
 * Uses cache to avoid re-querying.
 */
export async function qualifyProduct(name: string): Promise<boolean> {
  const cache = loadQualifyCache();

  // Check cache
  if (name in cache) {
    return cache[name];
  }

  const client = getClient();
  const prompt = QUALIFY_PROMPT.replace("{name}", name);

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const result = JSON.parse(text.trim());
    const isCoffee = result.isCoffee === true;

    // Cache result
    cache[name] = isCoffee;
    saveQualifyCache();

    return isCoffee;
  } catch (error) {
    console.warn(`Failed to qualify "${name}":`, error);
    // Default to true (include) on error
    return true;
  }
}

/**
 * Extract coffee details from HTML using AI.
 * Uses cache to avoid re-querying.
 */
export async function extractDetails(url: string, html: string): Promise<ExtractedDetails | null> {
  const cache = loadDetailsCache();

  // Check cache
  if (url in cache) {
    return cache[url];
  }

  const client = getClient();
  const strippedHtml = stripHtml(html);

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: "user", content: EXTRACT_PROMPT + strippedHtml }],
    });

    let text = response.content[0].type === "text" ? response.content[0].text : "";

    // Handle markdown code blocks
    if (text.includes("```json")) {
      text = text.split("```json")[1].split("```")[0];
    } else if (text.includes("```")) {
      text = text.split("```")[1].split("```")[0];
    }

    const result = JSON.parse(text.trim()) as ExtractedDetails;

    // Ensure all fields are arrays
    if (!Array.isArray(result.country)) result.country = [];
    if (!Array.isArray(result.region)) result.region = [];
    if (!Array.isArray(result.producer)) result.producer = [];
    if (!Array.isArray(result.process)) result.process = [];
    if (!Array.isArray(result.protocol)) result.protocol = [];
    if (!Array.isArray(result.variety)) result.variety = [];

    // Cache result
    cache[url] = result;
    saveDetailsCache();

    return result;
  } catch (error) {
    console.warn(`Failed to extract details for ${url}:`, error);
    return null;
  }
}

/**
 * Apply extracted details to a Coffee object.
 */
export function applyExtractedDetails(coffee: Coffee, details: ExtractedDetails): void {
  if (details.country?.length) coffee.country = details.country;
  if (details.region?.length) coffee.region = details.region;
  if (details.producer?.length) coffee.producer = details.producer;
  if (details.process?.length) coffee.process = details.process;
  if (details.protocol?.length) coffee.protocol = details.protocol;
  if (details.variety?.length) coffee.variety = details.variety;
}

/**
 * Clear all AI caches (for testing).
 */
export function clearCaches(): void {
  detailsCache = {};
  qualifyCache = {};
  saveDetailsCache();
  saveQualifyCache();
}
