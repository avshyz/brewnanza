/**
 * Semantic search for coffees.
 *
 * Flow:
 * 1. Check vocabulary cache for query term
 * 2. Cache hit: use cached embedding + mappings
 * 3. Cache miss: call LLM to parse query, extract filters/mappings
 * 4. If coffeeId provided: use that coffee's embedding
 * 5. Vector search + apply filters
 * 6. Compute matchedAttributes
 * 7. Return ranked results
 */

import { v } from "convex/values";
import { action, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";

// Types
interface SearchResult {
  _id: Id<"coffees">;
  name: string;
  roasterId: string;
  url: string;
  notes: string[];
  process: string[];
  protocol: string[];
  country: string[];
  region: string[];
  variety: string[];
  roastLevel?: string | null;
  roastedFor?: string | null;
  prices: Doc<"coffees">["prices"];
  available: boolean;
  imageUrl: string | null;
  matchedAttributes: string[];
  score: number;
}

interface SearchResponse {
  results: SearchResult[];
  debug: {
    source: "cache" | "llm" | "fallback" | "similarity";
    parsedQuery: ParsedQuery | null;
  };
}

interface ParsedQuery {
  filters: {
    maxPrice?: number;
    minPrice?: number;
    country?: string;
    roasterId?: string;
    available?: boolean;
  };
  mappedNotes: string[];
  mappedProcesses: string[];
  semanticQuery: string;
}

// Internal query to get vocabulary cache entry
export const getVocabEntry = internalQuery({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    return await ctx.db
      .query("vocabularyCache")
      .withIndex("by_term", (q) => q.eq("term", term.toLowerCase().trim()))
      .first();
  },
});

// Internal query to get a coffee by ID
export const getCoffeeById = internalQuery({
  args: { id: v.id("coffees") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

// Internal query to get all active coffees
export const getActiveCoffees = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("coffees")
      .filter((q) =>
        q.and(q.eq(q.field("isActive"), true), q.eq(q.field("skipped"), false))
      )
      .collect();
  },
});

// Internal query to get coffees with embeddings for similarity search
export const getCoffeesWithEmbeddings = internalQuery({
  args: { excludeId: v.optional(v.id("coffees")) },
  handler: async (ctx, { excludeId }) => {
    const coffees = await ctx.db
      .query("coffees")
      .filter((q) =>
        q.and(q.eq(q.field("isActive"), true), q.eq(q.field("skipped"), false))
      )
      .collect();

    return coffees.filter(
      (c) => c.embedding !== undefined && c._id !== excludeId
    );
  },
});

// LLM system prompt for query parsing
const PARSE_SYSTEM_PROMPT = `You are a specialty coffee search assistant. Parse user queries into structured filters and semantic mappings.

Extract:
1. Explicit filters: price constraints, country names, roaster mentions
2. Semantic notes: map coffee jargon to specific tasting notes
3. Semantic processes: map terms to coffee processing methods

Return JSON only:
{
  "filters": {
    "maxPrice": number | null,
    "minPrice": number | null,
    "country": string | null
  },
  "mappedNotes": string[],
  "mappedProcesses": string[],
  "semanticQuery": string
}

Note mappings:
- "funky" → notes: ["fermented", "wild", "yeasty"], processes: ["natural", "anaerobic"]
- "berry bomb" → notes: ["berry", "blueberry", "strawberry", "raspberry"], processes: ["natural"]
- "clean cup" → notes: ["tea", "crisp", "bright"], processes: ["washed"]
- "fruity" → notes: ["berry", "citrus", "tropical", "stone fruit"]
- "floral" → notes: ["jasmine", "rose", "lavender", "violet"]
- "chocolatey" → notes: ["chocolate", "cocoa", "dark chocolate"]

Price patterns: "under $X" → maxPrice: X, "above $X" → minPrice: X
Country patterns: "Ethiopian" → country: "Ethiopia", "Kenyan" → country: "Kenya"

semanticQuery should be the core flavor/characteristic terms for embedding.`;

// Parse query using LLM (called on cache miss)
async function parseQueryWithLLM(query: string): Promise<{ parsed: ParsedQuery; usedFallback: boolean }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY not set, using fallback parsing");
    return { parsed: fallbackParse(query), usedFallback: true };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 256,
        system: PARSE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Parse this coffee search query: "${query}"` }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    let text = data.content[0].text.trim();

    // Handle markdown code blocks
    if (text.startsWith("```")) {
      text = text.split("```")[1];
      if (text.startsWith("json")) {
        text = text.slice(4);
      }
    }

    const parsed = JSON.parse(text);
    return {
      parsed: {
        filters: {
          maxPrice: parsed.filters?.maxPrice ?? undefined,
          minPrice: parsed.filters?.minPrice ?? undefined,
          country: parsed.filters?.country ?? undefined,
        },
        mappedNotes: parsed.mappedNotes || [],
        mappedProcesses: parsed.mappedProcesses || [],
        semanticQuery: parsed.semanticQuery || query,
      },
      usedFallback: false,
    };
  } catch (error) {
    console.error("LLM parsing failed:", error);
    return { parsed: fallbackParse(query), usedFallback: true };
  }
}

// Fallback parsing when LLM is unavailable
function fallbackParse(query: string): ParsedQuery {
  const lower = query.toLowerCase();

  // Extract price filters
  let maxPrice: number | undefined;
  let minPrice: number | undefined;
  const underMatch = lower.match(/under\s*\$?(\d+)/);
  const aboveMatch = lower.match(/(?:above|over)\s*\$?(\d+)/);
  if (underMatch) maxPrice = parseInt(underMatch[1]);
  if (aboveMatch) minPrice = parseInt(aboveMatch[1]);

  // Extract country
  let country: string | undefined;
  const countries = ["ethiopia", "kenya", "colombia", "brazil", "guatemala", "rwanda", "burundi", "panama", "costa rica"];
  for (const c of countries) {
    if (lower.includes(c) || lower.includes(c.slice(0, -1))) {
      country = c.charAt(0).toUpperCase() + c.slice(1);
      break;
    }
  }

  // Simple keyword mappings
  const mappedNotes: string[] = [];
  const mappedProcesses: string[] = [];

  if (lower.includes("funky")) {
    mappedNotes.push("fermented", "wild", "yeasty");
    mappedProcesses.push("natural", "anaerobic");
  }
  if (lower.includes("berry") || lower.includes("fruit bomb")) {
    mappedNotes.push("berry", "blueberry", "strawberry", "raspberry");
    mappedProcesses.push("natural");
  }
  if (lower.includes("clean")) {
    mappedNotes.push("tea", "crisp", "bright");
    mappedProcesses.push("washed");
  }
  if (lower.includes("floral")) {
    mappedNotes.push("jasmine", "rose", "lavender", "violet", "floral");
  }
  if (lower.includes("chocolat")) {
    mappedNotes.push("chocolate", "cocoa", "dark chocolate");
  }
  if (lower.includes("fruity")) {
    mappedNotes.push("berry", "citrus", "tropical", "stone fruit");
  }

  return {
    filters: { maxPrice, minPrice, country },
    mappedNotes,
    mappedProcesses,
    semanticQuery: query,
  };
}

// Compute matched attributes between query mappings and coffee data
function computeMatchedAttributes(
  coffee: Doc<"coffees">,
  mappedNotes: string[],
  mappedProcesses: string[]
): string[] {
  const matched: string[] = [];

  // Check note matches
  const coffeeNotes = new Set(coffee.notes.map((n) => n.toLowerCase()));
  for (const note of mappedNotes) {
    if (coffeeNotes.has(note.toLowerCase())) {
      matched.push(note);
    }
  }

  // Check process matches
  const coffeeProcesses = new Set([
    ...coffee.process.map((p) => p.toLowerCase()),
    ...coffee.protocol.map((p) => p.toLowerCase()),
  ]);
  for (const process of mappedProcesses) {
    if (coffeeProcesses.has(process.toLowerCase())) {
      matched.push(process);
    }
  }

  return matched;
}

// Helper to convert coffee doc to search result
function coffeeToSearchResult(
  coffee: Doc<"coffees">,
  matchedAttributes: string[],
  score: number
): SearchResult {
  return {
    _id: coffee._id,
    name: coffee.name,
    roasterId: coffee.roasterId,
    url: coffee.url,
    notes: coffee.notes,
    process: coffee.process,
    protocol: coffee.protocol,
    country: coffee.country,
    region: coffee.region,
    variety: coffee.variety,
    roastLevel: coffee.roastLevel,
    roastedFor: coffee.roastedFor,
    prices: coffee.prices,
    available: coffee.available,
    imageUrl: coffee.imageUrl,
    matchedAttributes,
    score,
  };
}

/**
 * Main semantic search action.
 */
export const search = action({
  args: {
    query: v.string(),
    coffeeId: v.optional(v.id("coffees")),
    roasterId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { query, coffeeId, roasterId, limit = 20 }): Promise<SearchResponse> => {
    const normalizedQuery = query.toLowerCase().trim();

    // If coffeeId is provided, use that coffee's embedding for "similar to" search
    if (coffeeId) {
      const coffee = await ctx.runQuery(internal.search.getCoffeeById, { id: coffeeId });
      if (!coffee || !coffee.embedding) {
        return { results: [], debug: { source: "similarity", parsedQuery: null } };
      }

      // Get coffees with embeddings for similarity search
      const coffees = await ctx.runQuery(internal.search.getCoffeesWithEmbeddings, {
        excludeId: coffeeId,
      });

      // For now, return coffees sorted by note overlap (simplified similarity)
      // In production with real vector search, this would use cosine similarity
      const results = coffees
        .map((c: Doc<"coffees">) => {
          const noteOverlap = c.notes.filter((n: string) => coffee.notes.includes(n));
          return coffeeToSearchResult(c, noteOverlap, noteOverlap.length / Math.max(coffee.notes.length, 1));
        })
        .sort((a: SearchResult, b: SearchResult) => b.score - a.score)
        .slice(0, limit);

      return { results, debug: { source: "similarity", parsedQuery: null } };
    }

    // Check vocabulary cache first
    const cachedEntry = await ctx.runQuery(internal.search.getVocabEntry, { term: normalizedQuery });

    let parsedQuery: ParsedQuery;
    let source: "cache" | "llm" | "fallback" = "llm";

    if (cachedEntry) {
      // Cache hit - use pre-computed mappings
      source = "cache";
      parsedQuery = {
        filters: { roasterId },
        mappedNotes: cachedEntry.mappedNotes,
        mappedProcesses: cachedEntry.mappedProcesses,
        semanticQuery: cachedEntry.term,
      };
    } else {
      // Cache miss - parse query with LLM (may fall back internally)
      const { parsed, usedFallback } = await parseQueryWithLLM(query);
      parsedQuery = parsed;
      source = usedFallback ? "fallback" : "llm";
      if (roasterId) {
        parsedQuery.filters.roasterId = roasterId;
      }
    }

    // Get all active coffees via internal query
    let coffees = await ctx.runQuery(internal.search.getActiveCoffees, {});

    // Apply explicit filters
    if (parsedQuery.filters.roasterId) {
      coffees = coffees.filter((c: Doc<"coffees">) => c.roasterId === parsedQuery.filters.roasterId);
    }
    if (parsedQuery.filters.country) {
      const country = parsedQuery.filters.country.toLowerCase();
      coffees = coffees.filter((c: Doc<"coffees">) =>
        c.country.some((co: string) => co.toLowerCase().includes(country))
      );
    }
    if (parsedQuery.filters.maxPrice !== undefined) {
      coffees = coffees.filter((c: Doc<"coffees">) =>
        c.prices.some((p) => p.priceUsd !== null && p.priceUsd <= parsedQuery.filters.maxPrice!)
      );
    }
    if (parsedQuery.filters.minPrice !== undefined) {
      coffees = coffees.filter((c: Doc<"coffees">) =>
        c.prices.some((p) => p.priceUsd !== null && p.priceUsd >= parsedQuery.filters.minPrice!)
      );
    }

    // Score coffees by matched attributes (semantic relevance)
    const hasSemanticTerms = parsedQuery.mappedNotes.length > 0 || parsedQuery.mappedProcesses.length > 0;

    const scored = coffees.map((c: Doc<"coffees">) => {
      const matchedAttributes = computeMatchedAttributes(c, parsedQuery.mappedNotes, parsedQuery.mappedProcesses);

      // Simple scoring: number of matched attributes
      const score = matchedAttributes.length / Math.max(parsedQuery.mappedNotes.length + parsedQuery.mappedProcesses.length, 1);

      return coffeeToSearchResult(c, matchedAttributes, score);
    });

    // If semantic terms were provided, filter to only coffees with at least one match
    const filtered = hasSemanticTerms
      ? scored.filter((r: SearchResult) => r.matchedAttributes.length > 0)
      : scored;

    // Sort by score descending, then by name
    filtered.sort((a: SearchResult, b: SearchResult) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });

    return {
      results: filtered.slice(0, limit),
      debug: { source, parsedQuery },
    };
  },
});

/**
 * Text search for coffee autocomplete (public, for TipTap @mentions).
 */
export const autocompleteCoffees = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { query, limit = 10 }) => {
    const lower = query.toLowerCase();
    const coffees = await ctx.db
      .query("coffees")
      .filter((q) =>
        q.and(q.eq(q.field("isActive"), true), q.eq(q.field("skipped"), false))
      )
      .collect();

    const filtered = coffees
      .filter((c) => c.name.toLowerCase().includes(lower))
      .slice(0, limit);

    // Fetch roaster names
    const roasterIds = [...new Set(filtered.map((c) => c.roasterId))];
    const roasters = await ctx.db.query("roasters").collect();
    const roasterMap = new Map(roasters.map((r) => [r.roasterId, r.name]));

    return filtered.map((c) => ({
      id: c._id,
      name: c.name,
      roasterName: roasterMap.get(c.roasterId) ?? c.roasterId,
    }));
  },
});

/**
 * Text search for roaster autocomplete (public, for TipTap #mentions).
 */
export const autocompleteRoasters = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { query, limit = 10 }) => {
    const lower = query.toLowerCase();
    const roasters = await ctx.db.query("roasters").collect();

    return roasters
      .filter((r) => r.name.toLowerCase().includes(lower) || r.roasterId.toLowerCase().includes(lower))
      .slice(0, limit)
      .map((r) => ({
        id: r.roasterId,
        name: r.name,
      }));
  },
});
