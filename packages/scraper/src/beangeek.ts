/**
 * The Bean Geek scraper - extracts coffee data from thebeangeek.com
 *
 * This is a third-party coffee aggregator with rich tasting notes and metadata.
 * Data is SSR'd so no Playwright needed - simple HTML fetch + cheerio.
 *
 * Usage:
 *   const coffees = await fetchBeanGeekRoastery("dak-coffee-roasters");
 *   const coffee = await fetchBeanGeekCoffee("milky-cake-colombia");
 */

import * as cheerio from "cheerio";
import { USER_AGENT, REQUEST_DELAY } from "./config.js";

// ============================================================================
// Types
// ============================================================================

export interface BeanGeekCoffee {
  slug: string;
  name: string;
  roaster: string;
  roasterSlug: string;
  buyUrl: string | null;
  imageUrl: string | null;
  type: string | null; // "SINGLE ORIGIN" | "BLEND"
  roastedFor: ("FILTER" | "ESPRESSO")[];
  notes: string[];
  origin: string | null; // "1730m - Colombia" or just "Colombia"
  altitude: number | null;
  country: string | null;
  variety: string | null;
  processing: string | null;
}

export interface BeanGeekRoastery {
  slug: string;
  name: string;
  coffeeCount: number;
  coffees: { slug: string; name: string }[];
}

// ============================================================================
// Helpers
// ============================================================================

const BASE_URL = "https://www.thebeangeek.com";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }
  return response.text();
}

/**
 * Parse origin string like "1730m - Colombia" into altitude and country.
 */
function parseOrigin(origin: string | null): { altitude: number | null; country: string | null } {
  if (!origin) return { altitude: null, country: null };

  // Match patterns like "1730m - Colombia" or "1730m Colombia" or just "Colombia"
  const altMatch = origin.match(/(\d+)m/);
  const altitude = altMatch ? parseInt(altMatch[1], 10) : null;

  // Remove altitude part and clean up
  const country = origin
    .replace(/\d+m\s*[-\u2022]?\s*/g, "")
    .trim() || null;

  return { altitude, country };
}

// ============================================================================
// Roastery Page Scraper
// ============================================================================

/**
 * Fetch all coffee slugs from a roastery page.
 */
export async function fetchBeanGeekRoastery(roasterSlug: string): Promise<BeanGeekRoastery> {
  const url = `${BASE_URL}/roastery/${roasterSlug}`;
  const html = await fetchHtml(url);

  if (html.includes("404") && html.length < 5000) {
    throw new Error(`Roastery not found: ${roasterSlug}`);
  }

  const $ = cheerio.load(html);

  // Extract roastery name from h1 or title
  const name =
    $("h1").first().text().trim() ||
    $("title").text().replace(/ - specialty.*/, "").trim();

  // Extract all coffee links
  const seen = new Set<string>();
  const coffees: { slug: string; name: string }[] = [];

  $('a[href*="/coffee/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().trim();

    // Extract slug from href
    const match = href.match(/\/coffee\/([^/]+)/);
    if (!match) return;

    const slug = match[1];
    if (seen.has(slug)) return;
    if (text === "Show details" || text.length < 3) return;

    seen.add(slug);
    coffees.push({ slug, name: text });
  });

  return {
    slug: roasterSlug,
    name,
    coffeeCount: coffees.length,
    coffees,
  };
}

// ============================================================================
// Coffee Page Scraper
// ============================================================================

/**
 * Fetch detailed coffee data from a coffee page.
 */
export async function fetchBeanGeekCoffee(coffeeSlug: string): Promise<BeanGeekCoffee> {
  const url = `${BASE_URL}/coffee/${coffeeSlug}`;
  const html = await fetchHtml(url);

  if (html.includes("404") && html.length < 5000) {
    throw new Error(`Coffee not found: ${coffeeSlug}`);
  }

  const $ = cheerio.load(html);

  // Extract name from h1
  const name = $("h1").first().text().trim();

  // Extract roaster info - look for link with heading inside
  let roaster = "";
  let roasterSlug = "";
  $('a[href*="/roastery/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const heading = $(el).find("h2, h3, h4").text().trim();
    if (heading && !roasterSlug) {
      roaster = heading;
      roasterSlug = href.match(/\/roastery\/([^/]+)/)?.[1] || "";
    }
  });

  // Extract buy URL (external link to roaster's shop)
  const buyLink = $('a[href*="utm_source=thebeangeek"]').first();
  const buyUrl = buyLink.attr("href")?.replace(/\?utm_source=.*/, "") || null;

  // Extract image
  const imageUrl = $('img[alt*="Image of"]').first().attr("src") || null;

  // Extract type and roasted for from the HTML
  // Look in the section between Type</p> and Taste - this is the main coffee's type section
  let type: string | null = null;
  const roastedFor: ("FILTER" | "ESPRESSO")[] = [];

  const typeMatch = html.match(/>Type<\/p>([\s\S]*?)>Taste</);
  if (typeMatch) {
    const typeSection = typeMatch[1];
    if (typeSection.includes("SINGLE ORIGIN")) type = "SINGLE ORIGIN";
    if (typeSection.includes("BLEND")) type = "BLEND";
    if (typeSection.includes(">FILTER<")) roastedFor.push("FILTER");
    if (typeSection.includes(">ESPRESSO<")) roastedFor.push("ESPRESSO");
  }

  // Extract tasting notes - look for <p> tags after "Taste" section
  // The structure is: <p>Taste</p> followed by <div> with <p> tags containing notes
  const notes: string[] = [];

  // Use regex to find notes between Taste</p> and Details
  const tasteMatch = html.match(/>Taste<\/p>([\s\S]*?)>Details</);
  if (tasteMatch) {
    const notesHtml = tasteMatch[1];
    // Extract text from <p> tags with bg-soft class (these are the note pills)
    const noteMatches = notesHtml.matchAll(/<p[^>]*class="[^"]*bg-soft[^"]*"[^>]*>([^<]+)<\/p>/g);
    for (const match of noteMatches) {
      const note = match[1].trim();
      if (note.length > 1 && note.length < 30) {
        notes.push(note);
      }
    }
  }

  // Extract details - find text after Origin, Variety, Processing labels
  const extractDetail = (label: string): string | null => {
    // Pattern: >Label</p>...>Value</p> or similar
    const regex = new RegExp(`>${label}</p>[\\s\\S]*?<p[^>]*>([^<]+)</p>`, "i");
    const match = html.match(regex);
    return match ? match[1].trim() : null;
  };

  const originRaw = extractDetail("Origin");
  const { altitude, country } = parseOrigin(originRaw);
  const variety = extractDetail("Variety");
  const processing = extractDetail("Processing");

  return {
    slug: coffeeSlug,
    name,
    roaster,
    roasterSlug,
    buyUrl,
    imageUrl,
    type,
    roastedFor,
    notes,
    origin: originRaw,
    altitude,
    country,
    variety,
    processing,
  };
}

// ============================================================================
// Batch Scraper
// ============================================================================

/**
 * Fetch all coffees from a roastery with rate limiting.
 */
export async function fetchAllCoffeesFromRoastery(
  roasterSlug: string,
  options: { verbose?: boolean; limit?: number } = {}
): Promise<BeanGeekCoffee[]> {
  const { verbose = false, limit } = options;

  if (verbose) console.log(`[BeanGeek] Fetching roastery: ${roasterSlug}`);

  const roastery = await fetchBeanGeekRoastery(roasterSlug);

  if (verbose) console.log(`[BeanGeek] Found ${roastery.coffeeCount} coffees`);

  const coffeesToFetch = limit ? roastery.coffees.slice(0, limit) : roastery.coffees;
  const results: BeanGeekCoffee[] = [];

  for (const { slug, name } of coffeesToFetch) {
    try {
      await sleep(REQUEST_DELAY);
      const coffee = await fetchBeanGeekCoffee(slug);
      results.push(coffee);
      if (verbose) console.log(`  [BeanGeek] ${name}: ${coffee.notes.length} notes`);
    } catch (err) {
      if (verbose) console.log(`  [BeanGeek] Error fetching ${slug}: ${err}`);
    }
  }

  return results;
}

// ============================================================================
// Roaster Mapping
// ============================================================================

/**
 * Map of your roaster IDs to Bean Geek slugs.
 */
export const BEANGEEK_ROASTER_MAP: Record<string, string> = {
  dak: "dak-coffee-roasters",
  lacabra: "la-cabra",
  manhattan: "manhattan-coffee-roasters",
  tanat: "tanat-coffee",
  kbcoffee: "kb-coffee-roasters",
  friedhats: "friedhats",
  scenery: "scenery-coffee",
  standout: "standout-coffee",
  april: "april-coffee-roasters",
  devocion: "devocion",
};

/**
 * Check if a roaster is available on Bean Geek.
 */
export function hasBeanGeekSource(roasterId: string): boolean {
  return roasterId in BEANGEEK_ROASTER_MAP;
}

/**
 * Get the Bean Geek slug for a roaster.
 */
export function getBeanGeekSlug(roasterId: string): string | null {
  return BEANGEEK_ROASTER_MAP[roasterId] || null;
}
