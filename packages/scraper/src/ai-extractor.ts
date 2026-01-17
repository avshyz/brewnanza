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

## TRANSLATION (CRITICAL)
ALL fields MUST be in ENGLISH. Translate Hebrew, French, Spanish, etc.:
- Product names: Translate fully to English
- Descriptions: Translate fully to English
- Countries: Mexique → Mexico, Brésil → Brazil, אתיופיה → Ethiopia
- All other fields: Use standard English coffee terminology

## NORMALIZATION
Countries: Use official English names (Ethiopia, not Éthiopie/ethiopie/אתיופיה)
Infer country from region if missing:
- Yirgacheffe, Sidamo, Guji, Gedeo → Ethiopia
- Huila, Nariño, Cauca → Colombia
- Tarrazú → Costa Rica
- Nyeri, Kirinyaga → Kenya
- Aceh, Gayo → Indonesia

Varieties: Use canonical names:
- SL-28 (not sl28, SL28, "SL 28")
- SL-34 (not sl34, SL34)
- Gesha (not Geisha)
- Catuaí (not Catuai)
- JARC 74112 (not 74112, jarc74112)
- Heirloom (for Ethiopian landraces)

## SANITIZE
- Decode HTML entities: &#8211; → –, &amp; → &
- Remove extra whitespace, normalize spacing
- No HTML tags in output values

## ALL FIELDS ARE ARRAYS (to support blends)

For SINGLE ORIGIN coffee: use arrays with one element, e.g., country: ["Ethiopia"]
For BLENDS: use arrays with multiple elements, e.g., country: ["Ethiopia", "Colombia"]

## FIELDS TO EXTRACT (use empty array [] or null if not found):

1. **name** (string): Product name translated to English. null if not found.

2. **description** (string): Product description translated to English. null if not found.

3. **country** (array): Origin countries where the coffee was grown.
   Single origin: ["Ethiopia"]
   Blend: ["Ethiopia", "Colombia"]

4. **region** (array): Specific growing regions within the countries.
   Single origin: ["Yirgacheffe"]
   Blend: ["Yirgacheffe", "Huila"]

5. **producer** (array): Names of farmers, families, cooperatives who grew the coffee.
   Single origin: ["Fredy Sabillon"]
   Blend: ["Fredy Sabillon", "Finca El Paraiso"]
   - ONLY the name (max 5 words), not descriptions

6. **process** (array): Processing method names ONLY (1-3 words each).
   Single origin: ["natural"]
   Blend: ["natural", "washed"]
   Valid values: "washed", "natural", "honey", "anaerobic", "carbonic maceration", etc.

7. **protocol** (array): Detailed processing descriptions.
   Example: ["Cherries dried on raised beds for 21 days"]
   - Leave empty [] if only process name is mentioned without details

8. **variety** (array): Coffee varietals/cultivars with canonical names.
   Example: ["SL-28", "Gesha", "Bourbon"]

## OUTPUT FORMAT:

{
  "name": "Ethiopia Yirgacheffe Natural",
  "description": "A bright and fruity coffee with notes of blueberry and jasmine.",
  "country": ["Ethiopia"],
  "region": ["Yirgacheffe"],
  "producer": ["Smallholder Farmers"],
  "process": ["natural"],
  "protocol": [],
  "variety": ["Heirloom"]
}

For a blend:
{
  "name": "House Blend",
  "description": "Our signature blend combining Ethiopian and Colombian beans.",
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
  name: string | null;
  description: string | null;
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
      max_tokens: 2000,
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

    // Ensure string fields are strings or null
    if (typeof result.name !== "string") result.name = null;
    if (typeof result.description !== "string") result.description = null;

    // Ensure all array fields are arrays
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
 * Note: description is extracted but not stored in Coffee (use for display purposes elsewhere).
 */
export function applyExtractedDetails(coffee: Coffee, details: ExtractedDetails): void {
  if (details.name) coffee.name = details.name;
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
