#!/usr/bin/env bun
/**
 * Compare Anthropic models (Haiku, Sonnet, Opus) on La Cabra HTML pages.
 * Tests tasting note extraction quality and cost.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as cheerio from "cheerio";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, "..", "cache", "model_comparison.json");

const URLS = [
  "https://lacabra.com/products/la-divina-natural-sl28-1",
  "https://lacabra.com/products/santa-teresa-typica",
  "https://lacabra.com/products/santa-rosa-1900",
  "https://lacabra.com/products/la-divina-washed-sl28",
  "https://lacabra.com/products/fredy-sabillon-2",
];

const MODELS = [
  { name: "haiku", id: "claude-3-haiku-20240307" },
  { name: "sonnet", id: "claude-sonnet-4-20250514" },
  // { name: "opus", id: "claude-opus-4-20250514" }, // Skip - same quality as sonnet, 5x more expensive
] as const;

// Pricing per million tokens (Claude 3 Haiku is cheaper than 3.5 Haiku)
const PRICING: Record<string, { input: number; output: number }> = {
  haiku: { input: 0.25, output: 1.25 },
  sonnet: { input: 3.0, output: 15.0 },
  opus: { input: 15.0, output: 75.0 },
};

const PROMPT = `Extract coffee information from this product page. Return ONLY raw JSON, no markdown/explanation.

## Field definitions (use null if not found):

- name: Product name exactly as shown
- country: Origin country (e.g., "Ethiopia", "Colombia")
- region: Specific growing region within the country (e.g., "Yirgacheffe", "Huila")
- producer: Name of the farmer, family, or cooperative who grew the coffee
- farm: Name of the farm, estate, or mill (e.g., "La Divina Providencia") - this is the PLACE, not the person
- process: ONLY the processing method name: "Washed", "Natural", "Honey", "Anaerobic", etc. Do NOT include details here.
- protocol: The DETAILED processing story - fermentation times, drying methods, special techniques. This is the "how" explanation.
- variety: Array of coffee varietals (e.g., ["SL28", "Gesha", "Bourbon"])
- altitude: Growing altitude normalized to "XXXX masl" format (e.g., "1700 masl")
- harvest_date: When the coffee was harvested (e.g., "February 2025", "2024/2025")
- notes: Array of tasting/flavor notes from descriptions (e.g., ["dark chocolate", "red berry", "caramel"])
- roast_for: "filter", "espresso", or "omni" (if "Both for filter and espresso" → "omni")

## Examples:
- process: "Natural" | protocol: "Cherries dried on raised beds for 21 days, turned every 4 hours"
- process: "Honey" | protocol: "Yellow honey process, 50% mucilage removed, dried for 15 days"
- process: "Washed" | protocol: "Fermented 36 hours underwater, then sun-dried on patios"

Extract notes from prose like "with notes of X and Y" or "flavours of A, B". Look for farm names on product images/bags.

Text:
`;

type CacheEntry = {
  result: Record<string, unknown>;
  input_tokens: number;
  output_tokens: number;
};

type Cache = Record<string, CacheEntry>;

function loadCache(): Cache {
  if (existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

function saveCache(cache: Cache): void {
  const cacheDir = dirname(CACHE_FILE);
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function cacheKey(url: string, model: string): string {
  return `${url}|${model}`;
}

async function fetchHtml(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

/**
 * Strip HTML to just main product text - remove scripts, styles, nav, footer, etc.
 */
function stripHtml(html: string): string {
  const $ = cheerio.load(html);

  // Remove unnecessary tags
  $("script, style, noscript, iframe, svg, path, link, meta").remove();

  // Remove navigation, footer, header elements
  $(
    "nav, footer, header, .footer, .header, .nav, [role='navigation'], [role='banner'], [role='contentinfo']"
  ).remove();

  // Remove hidden elements
  $("[hidden]").remove();
  $("[style*='display:none'], [style*='display: none']").remove();

  // Try to find main product content
  const mainSelectors = [
    "product-info",
    ".product__info-container",
    ".product",
    "main",
    "article",
    "[role='main']",
    ".main-content",
  ];

  let main = $("body");
  for (const selector of mainSelectors) {
    const el = $(selector);
    if (el.length > 0) {
      main = el.first();
      break;
    }
  }

  // Get text, preserving some structure
  const text = main.text();

  // Clean up whitespace
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

async function callModel(
  client: Anthropic,
  modelId: string,
  content: string
): Promise<CacheEntry> {
  const response = await client.messages.create({
    model: modelId,
    max_tokens: 1024,
    messages: [{ role: "user", content: PROMPT + content }],
  });

  let text = response.content[0].type === "text" ? response.content[0].text : "";

  // Parse JSON from response
  let result: Record<string, unknown>;
  try {
    // Handle markdown code blocks
    if (text.includes("```json")) {
      text = text.split("```json")[1].split("```")[0];
    } else if (text.includes("```")) {
      text = text.split("```")[1].split("```")[0];
    }
    result = JSON.parse(text.trim());
  } catch {
    result = { raw_response: text };
  }

  return {
    result,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  };
}

async function main() {
  const apiKey = process.env.ANTRHOPIC_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY or ANTRHOPIC_KEY env var required");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const cache = loadCache();

  // Fetch and strip all HTML
  console.log("=".repeat(80));
  console.log("FETCHING AND STRIPPING HTML");
  console.log("=".repeat(80));

  const strippedPages: Record<string, string> = {};
  for (const url of URLS) {
    const slug = url.split("/").pop()!;
    const rawHtml = await fetchHtml(url);
    const stripped = stripHtml(rawHtml);
    strippedPages[url] = stripped;

    const pct = Math.round((100 * stripped.length) / rawHtml.length);
    console.log(`\n${slug}:`);
    console.log(`  Raw HTML: ${rawHtml.length.toLocaleString()} chars`);
    console.log(`  Stripped: ${stripped.length.toLocaleString()} chars (${pct}%)`);
  }

  // Run each model on each page
  console.log("\n" + "=".repeat(80));
  console.log("RUNNING MODELS");
  console.log("=".repeat(80));

  const results: Record<string, Record<string, CacheEntry>> = {};
  const totalUsage: Record<string, { input: number; output: number }> = {};
  for (const m of MODELS) {
    totalUsage[m.name] = { input: 0, output: 0 };
  }

  for (const url of URLS) {
    const slug = url.split("/").pop()!;
    results[url] = {};
    console.log(`\n### ${slug}`);

    for (const model of MODELS) {
      const key = cacheKey(url, model.name);

      if (cache[key]) {
        console.log(`  ${model.name}: cached`);
        results[url][model.name] = cache[key];
        totalUsage[model.name].input += cache[key].input_tokens;
        totalUsage[model.name].output += cache[key].output_tokens;
      } else {
        process.stdout.write(`  ${model.name}: calling API... `);
        try {
          const data = await callModel(client, model.id, strippedPages[url]);
          cache[key] = data;
          results[url][model.name] = data;
          totalUsage[model.name].input += data.input_tokens;
          totalUsage[model.name].output += data.output_tokens;
          console.log(`(${data.input_tokens} in, ${data.output_tokens} out)`);
          saveCache(cache);
        } catch (e) {
          console.log(`ERROR: ${e}`);
          results[url][model.name] = {
            result: { error: String(e) },
            input_tokens: 0,
            output_tokens: 0,
          };
        }
      }
    }
  }

  // Display results
  console.log("\n" + "=".repeat(80));
  console.log("RESULTS COMPARISON");
  console.log("=".repeat(80));

  for (const url of URLS) {
    const slug = url.split("/").pop()!;
    console.log(`\n${"=".repeat(80)}`);
    console.log(`## ${slug}`);
    console.log(`   Link: ${url}`);
    console.log("=".repeat(80));

    for (const model of MODELS) {
      const data = results[url][model.name];
      console.log(`\n### ${model.name.toUpperCase()}`);

      if (!data) {
        console.log("  No data");
        continue;
      }

      const r = data.result;
      if ("error" in r) {
        console.log(`  Error: ${r.error}`);
      } else if ("raw_response" in r) {
        const raw = String(r.raw_response);
        console.log(`  Raw: ${raw.slice(0, 200)}...`);
      } else {
        console.log(`  Name: ${r.name ?? "-"}`);
        console.log(`  Country: ${r.country ?? "-"}`);
        console.log(`  Region: ${r.region ?? "-"}`);
        console.log(`  Producer: ${r.producer ?? "-"}`);
        console.log(`  Farm: ${r.farm ?? "-"}`);
        console.log(`  Process: ${r.process ?? "-"}`);
        console.log(`  Protocol: ${r.protocol ?? "-"}`);
        console.log(`  Variety: ${JSON.stringify(r.variety) ?? "-"}`);
        console.log(`  Altitude: ${r.altitude ?? "-"}`);
        console.log(`  Harvest: ${r.harvest_date ?? "-"}`);
        console.log(`  Notes: ${JSON.stringify(r.notes) ?? "-"}`);
        console.log(`  Roast: ${r.roast_for ?? "-"}`);
      }
    }
  }

  // Cost summary
  console.log("\n" + "=".repeat(80));
  console.log("COST SUMMARY (5 pages)");
  console.log("=".repeat(80));

  for (const model of MODELS) {
    const u = totalUsage[model.name];
    const p = PRICING[model.name];
    const cost = (u.input / 1_000_000) * p.input + (u.output / 1_000_000) * p.output;
    console.log(`\n${model.name.toUpperCase()}:`);
    console.log(`  Tokens: ${u.input.toLocaleString()} input, ${u.output.toLocaleString()} output`);
    console.log(`  Cost: $${cost.toFixed(4)}`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("EXTRAPOLATED COST FOR 300 PAGES");
  console.log("=".repeat(80));

  for (const model of MODELS) {
    const u = totalUsage[model.name];
    const p = PRICING[model.name];
    const scale = 300 / 5;
    const cost300 =
      ((u.input / 1_000_000) * p.input + (u.output / 1_000_000) * p.output) * scale;
    console.log(`  ${model.name}: $${cost300.toFixed(2)}`);
  }
}

main().catch(console.error);
