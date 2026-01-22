/**
 * Semantic search for coffees.
 *
 * Flow:
 * 1. Try taxonomy lookup (fast path, <50ms)
 * 2. Taxonomy miss: call LLM to parse query
 * 3. If coffeeId provided: use that coffee's embedding for similarity
 * 4. Apply filters + compute matchedAttributes
 * 5. Return ranked results
 */

import { v } from "convex/values";
import { action, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";
import Fuse from "fuse.js";
import { taxonomySearch, getCategoryForNote } from "./taxonomy";

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
    source: "llm" | "fallback" | "similarity" | "taxonomy";
    parsedQuery: ParsedQuery | null;
    candidateNotes?: string[];
    taxonomyMatch?: string[];
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

// Internal query to get note embeddings by IDs
export const getNoteEmbeddingsByIds = internalQuery({
  args: { ids: v.array(v.id("noteEmbeddings")) },
  handler: async (ctx, { ids }) => {
    const results = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return results.filter((r) => r !== null);
  },
});

// Internal query to get distinct notes and processes from all active coffees
export const getDistinctVocabulary = internalQuery({
  args: {},
  handler: async (ctx) => {
    const coffees = await ctx.db
      .query("coffees")
      .filter((q) =>
        q.and(q.eq(q.field("isActive"), true), q.eq(q.field("skipped"), false))
      )
      .collect();

    const notes = new Set<string>();
    const processes = new Set<string>();

    for (const coffee of coffees) {
      for (const note of coffee.notes) {
        notes.add(note.toLowerCase());
      }
      for (const proc of coffee.process) {
        processes.add(proc.toLowerCase());
      }
      for (const prot of coffee.protocol) {
        processes.add(prot.toLowerCase());
      }
    }

    return {
      notes: Array.from(notes).sort(),
      processes: Array.from(processes).sort(),
    };
  },
});

/**
 * Find candidate notes via fuzzy matching using fuse.js.
 * Handles typos like "choclate" → "chocolate", "rasberry" → "raspberry".
 * Also includes exact/substring matches for precise queries.
 */
function findCandidateNotes(query: string, allNotes: string[]): string[] {
  if (allNotes.length === 0) return [];

  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const candidates = new Set<string>();

  // First: exact and substring matches (for precise queries like "pear")
  for (const word of words) {
    for (const note of allNotes) {
      const noteLower = note.toLowerCase();
      if (noteLower.includes(word) || word.includes(noteLower)) {
        candidates.add(note);
      }
    }
  }

  // Second: fuzzy matches for typos (fuse.js)
  const fuse = new Fuse(allNotes, {
    threshold: 0.4,      // 0 = exact match, 1 = match anything
    distance: 100,       // how far to search for a match
    minMatchCharLength: 3,
  });

  for (const word of words) {
    const results = fuse.search(word);
    for (const result of results.slice(0, 5)) {
      candidates.add(result.item);
    }
  }

  // Also search the full query for multi-word notes like "black cherry"
  const fullResults = fuse.search(query);
  for (const result of fullResults.slice(0, 5)) {
    candidates.add(result.item);
  }

  return Array.from(candidates).slice(0, 15);
}

/**
 * Find candidate processes via fuzzy matching using fuse.js.
 * Includes exact/substring matches plus fuzzy for typos.
 */
function findCandidateProcesses(query: string, allProcesses: string[]): string[] {
  if (allProcesses.length === 0) return [];

  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const candidates = new Set<string>();

  // Exact/substring matches
  for (const word of words) {
    for (const proc of allProcesses) {
      const procLower = proc.toLowerCase();
      if (procLower.includes(word) || word.includes(procLower)) {
        candidates.add(proc);
      }
    }
  }

  // Fuzzy matches for typos
  const fuse = new Fuse(allProcesses, {
    threshold: 0.4,
    distance: 100,
    minMatchCharLength: 3,
  });

  for (const word of words) {
    const results = fuse.search(word);
    for (const result of results.slice(0, 3)) {
      candidates.add(result.item);
    }
  }

  return Array.from(candidates);
}

// Type for action ctx needed by hybrid search
type HybridSearchCtx = {
  vectorSearch: (
    tableName: "noteEmbeddings",
    indexName: "by_embedding",
    options: { vector: number[]; limit: number }
  ) => Promise<Array<{ _id: Id<"noteEmbeddings">; _score: number }>>;
  runQuery: typeof internal.search.getNoteEmbeddingsByIds extends infer T
    ? (fn: T, args: { ids: Id<"noteEmbeddings">[] }) => Promise<Doc<"noteEmbeddings">[]>
    : never;
};

/**
 * Hybrid note search: combines Fuse.js (typos) + Vector embeddings (semantic).
 * Weights: fuse 0.4, vector 0.6
 * Falls back to fuse-only if OpenAI API unavailable.
 */
async function findCandidateNotesHybrid(
  ctx: HybridSearchCtx,
  query: string,
  allNotes: string[]
): Promise<string[]> {
  // 1. Run Fuse.js (fast, handles typos)
  const fuseResults = findCandidateNotes(query, allNotes);

  // 2. Try vector search
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fallback: fuse-only
    return fuseResults;
  }

  let vectorResults: Array<{ note: string; score: number }> = [];
  try {
    // Use fuse-corrected term for vector search (handles typos like "florar" → "floral")
    // This ensures we embed a real word, not a typo
    const vectorQuery = fuseResults.length > 0 ? fuseResults[0] : query;

    // Embed query using OpenAI API
    const embedResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: vectorQuery,
        dimensions: 1024,
      }),
    });

    if (!embedResponse.ok) {
      console.warn(`OpenAI API error: ${embedResponse.status}, falling back to fuse-only`);
      return fuseResults;
    }

    const embedData = await embedResponse.json();
    const queryEmbedding = embedData.data[0].embedding;

    // Vector search noteEmbeddings table - returns _id and _score only
    const searchResults = await ctx.vectorSearch("noteEmbeddings", "by_embedding", {
      vector: queryEmbedding,
      limit: 15,
    });

    // Fetch actual note data from IDs
    const ids = searchResults.map((r) => r._id);
    const noteEmbeddings = await ctx.runQuery(
      internal.search.getNoteEmbeddingsByIds,
      { ids }
    );

    // Map IDs to scores, then combine with note data
    const scoreById = new Map(searchResults.map((r) => [r._id.toString(), r._score]));
    vectorResults = noteEmbeddings.map((ne) => ({
      note: ne.note,
      score: scoreById.get(ne._id.toString()) ?? 0,
    }));
  } catch (error) {
    console.warn("Vector search failed:", error);
    return fuseResults;
  }

  // 3. Merge results with weighted scoring
  // Fuse weight: 0.4, Vector weight: 0.6
  const FUSE_WEIGHT = 0.4;
  const VECTOR_WEIGHT = 0.6;

  const scoreMap = new Map<string, number>();

  // Add fuse scores (position-based: 1.0 for first, decreasing)
  fuseResults.forEach((note, i) => {
    const fuseScore = 1 - i / fuseResults.length;
    scoreMap.set(note, (scoreMap.get(note) || 0) + fuseScore * FUSE_WEIGHT);
  });

  // Add vector scores (already normalized 0-1)
  for (const { note, score } of vectorResults) {
    scoreMap.set(note, (scoreMap.get(note) || 0) + score * VECTOR_WEIGHT);
  }

  // Sort by combined score, return top 15
  const merged = Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([note]) => note);

  return merged;
}

// LLM system prompt - simpler, asks to validate candidates
function buildParsePrompt(candidateNotes: string[], candidateProcesses: string[]): string {
  return `Parse this coffee search query. Extract filters and select relevant tasting notes/processes.

Return JSON only:
{
  "filters": { "maxPrice": number|null, "minPrice": number|null, "country": string|null },
  "mappedNotes": string[],
  "mappedProcesses": string[],
  "semanticQuery": string
}

${candidateNotes.length > 0 ? `Candidate notes found: [${candidateNotes.join(", ")}]
IMPORTANT: Select ALL candidates that are semantically related to the query.
- For "floral": include lavender, jasmine, rose, orange blossom, geranium, hibiscus, etc.
- For "fruity": include berry, citrus, tropical, stone fruit, apple, peach, etc.
- For "chocolate": include cacao, cocoa, dark chocolate, milk chocolate, etc.
Be inclusive - more matches means better search results.` : ""}

${candidateProcesses.length > 0 ? `Candidate processes found: [${candidateProcesses.join(", ")}]
Select which are relevant.` : ""}

Jargon expansions:
- "funky" → fermented, wild, yeasty + natural/anaerobic process
- "berry bomb" → berry, blueberry, raspberry + natural process
- "clean cup" → tea, crisp, bright + washed process
- "fruity" → berry, citrus, tropical, stone fruit

Price: "under $X" → maxPrice, "above $X" → minPrice
Country: "Ethiopian" → Ethiopia, "Kenyan" → Kenya`;
}

// Parse query using LLM (called on cache miss)
async function parseQueryWithLLM(
  ctx: HybridSearchCtx,
  query: string,
  vocabulary: { notes: string[]; processes: string[] }
): Promise<{ parsed: ParsedQuery; usedFallback: boolean; candidateNotes: string[] }> {
  // Find candidate notes/processes via hybrid search (fuse + vector)
  const candidateNotes = await findCandidateNotesHybrid(ctx, query, vocabulary.notes);
  const candidateProcesses = findCandidateProcesses(query, vocabulary.processes);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY not set, using fallback parsing");
    const parsed = await fallbackParseHybrid(ctx, query, vocabulary);
    return { parsed, usedFallback: true, candidateNotes };
  }
  const systemPrompt = buildParsePrompt(candidateNotes, candidateProcesses);

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
        system: systemPrompt,
        messages: [{ role: "user", content: `Parse: "${query}"` }],
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
      candidateNotes,
    };
  } catch (error) {
    console.error("LLM parsing failed:", error);
    const parsed = await fallbackParseHybrid(ctx, query, vocabulary);
    return { parsed, usedFallback: true, candidateNotes };
  }
}

// Fallback parsing when LLM is unavailable (uses hybrid search)
async function fallbackParseHybrid(
  ctx: HybridSearchCtx,
  query: string,
  vocabulary: { notes: string[]; processes: string[] }
): Promise<ParsedQuery> {
  const lower = query.toLowerCase();

  // Extract price filters (handles $30, 30$, or just 30)
  let maxPrice: number | undefined;
  let minPrice: number | undefined;
  const underMatch = lower.match(/under\s*\$?(\d+)\$?/);
  const aboveMatch = lower.match(/(?:above|over)\s*\$?(\d+)\$?/);
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

  // Use hybrid search to find notes (fuse + vector) and fuzzy for processes
  const mappedNotes: string[] = await findCandidateNotesHybrid(ctx, query, vocabulary.notes);
  const mappedProcesses: string[] = findCandidateProcesses(query, vocabulary.processes);

  // Add jargon expansions
  if (lower.includes("funky")) {
    mappedNotes.push("fermented", "wild", "yeasty");
    mappedProcesses.push("natural", "anaerobic");
  }
  if (lower.includes("fruit bomb")) {
    mappedNotes.push("berry", "blueberry", "strawberry", "raspberry");
    mappedProcesses.push("natural");
  }
  if (lower.includes("clean")) {
    mappedNotes.push("tea", "crisp", "bright");
    mappedProcesses.push("washed");
  }
  if (lower.includes("fruity") && !mappedNotes.includes("tropical")) {
    mappedNotes.push("berry", "citrus", "tropical", "stone fruit");
  }

  return {
    filters: { maxPrice, minPrice, country },
    mappedNotes: [...new Set(mappedNotes)],
    mappedProcesses: [...new Set(mappedProcesses)],
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

    // Fetch vocabulary from DB (distinct notes/processes from all coffees)
    const vocabulary = await ctx.runQuery(internal.search.getDistinctVocabulary, {});

    let parsedQuery: ParsedQuery;
    let source: "llm" | "fallback" | "taxonomy" = "llm";
    let candidateNotes: string[] | undefined;
    let taxonomyMatch: string[] | undefined;

    // FAST PATH: Try taxonomy lookup first (no API calls, <50ms)
    const taxResult = taxonomySearch(normalizedQuery);

    if (taxResult.confidence !== "none") {
      // Taxonomy hit - use pre-defined mappings
      source = "taxonomy";
      taxonomyMatch = taxResult.matchedTerms;

      // Filter notes to only those that exist in our vocabulary
      const vocabNotesSet = new Set(vocabulary.notes.map((n) => n.toLowerCase()));
      const filteredNotes = taxResult.notes.filter((n) => vocabNotesSet.has(n.toLowerCase()));

      // Filter processes to only those that exist in our vocabulary
      const vocabProcessesSet = new Set(vocabulary.processes.map((p) => p.toLowerCase()));
      const filteredProcesses = taxResult.processes.filter((p) => vocabProcessesSet.has(p.toLowerCase()));

      parsedQuery = {
        filters: { roasterId },
        mappedNotes: filteredNotes,
        mappedProcesses: filteredProcesses,
        semanticQuery: normalizedQuery,
      };

      // Store excludeCategories for negative matching (e.g., "clean cup" excludes fermented)
      if (taxResult.excludeCategories.length > 0) {
        (parsedQuery as ParsedQuery & { excludeCategories?: string[] }).excludeCategories = taxResult.excludeCategories;
      }
    } else {
      // Taxonomy miss - parse query with LLM using DB vocabulary (hybrid search)
      const { parsed, usedFallback, candidateNotes: candidates } = await parseQueryWithLLM(ctx, query, vocabulary);
      parsedQuery = parsed;
      source = usedFallback ? "fallback" : "llm";
      candidateNotes = candidates;
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

    // Get excluded categories for negative matching (e.g., "clean cup" excludes fermented)
    const excludeCategories = (parsedQuery as ParsedQuery & { excludeCategories?: string[] }).excludeCategories ?? [];

    const scored = coffees.map((c: Doc<"coffees">) => {
      const matchedAttributes = computeMatchedAttributes(c, parsedQuery.mappedNotes, parsedQuery.mappedProcesses);

      // Simple scoring: number of matched attributes
      const score = matchedAttributes.length / Math.max(parsedQuery.mappedNotes.length + parsedQuery.mappedProcesses.length, 1);

      return coffeeToSearchResult(c, matchedAttributes, score);
    });

    // If semantic terms were provided, filter to only coffees with at least one match
    let filtered = hasSemanticTerms
      ? scored.filter((r: SearchResult) => r.matchedAttributes.length > 0)
      : scored;

    // Apply negative matching: exclude coffees with notes from excluded categories
    if (excludeCategories.length > 0) {
      filtered = filtered.filter((r: SearchResult) => {
        for (const note of r.notes) {
          const category = getCategoryForNote(note);
          if (category && excludeCategories.includes(category)) {
            return false; // Exclude this coffee
          }
        }
        return true;
      });
    }

    // Sort by score descending, then by name
    filtered.sort((a: SearchResult, b: SearchResult) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });

    return {
      results: filtered.slice(0, limit),
      debug: { source, parsedQuery, candidateNotes, taxonomyMatch },
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

/**
 * Find similar notes using vector embeddings.
 * Embeds the query and finds semantically similar notes.
 */
export const findSimilarNotesVector = action({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { query, limit = 10 }): Promise<{
    query: string;
    results: Array<{ note: string; score: number }>;
    embeddingTime: number;
    searchTime: number;
  }> => {
    const startEmbed = Date.now();

    // Call external embedding API (using sentence-transformers via HTTP)
    // For now, we'll use a simpler approach: search Convex's vector index
    // We need to embed the query first using the same model

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      // Fallback: return empty if no embedding API available
      console.warn("OPENAI_API_KEY not set, cannot do vector search");
      return {
        query,
        results: [],
        embeddingTime: 0,
        searchTime: 0,
      };
    }

    // Embed query using OpenAI API
    const embedResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: query,
        dimensions: 1024,
      }),
    });

    if (!embedResponse.ok) {
      throw new Error(`OpenAI API error: ${embedResponse.status}`);
    }

    const embedData = await embedResponse.json();
    const queryEmbedding = embedData.data[0].embedding;
    const embeddingTime = Date.now() - startEmbed;

    // Vector search for similar notes - returns _id and _score only
    const startSearch = Date.now();
    const searchResults = await ctx.vectorSearch("noteEmbeddings", "by_embedding", {
      vector: queryEmbedding,
      limit,
    });

    // Fetch actual note data from IDs
    const ids = searchResults.map((r) => r._id);
    const noteEmbeddings = await ctx.runQuery(internal.search.getNoteEmbeddingsByIds, { ids });
    const searchTime = Date.now() - startSearch;

    // Map IDs to scores, then combine with note data
    const scoreById = new Map(searchResults.map((r) => [r._id.toString(), r._score]));

    return {
      query,
      results: noteEmbeddings.map((ne) => ({
        note: ne.note,
        score: scoreById.get(ne._id.toString()) ?? 0,
      })),
      embeddingTime,
      searchTime,
    };
  },
});

/**
 * Compare fuse.js vs vector embedding search for notes.
 * Returns results from both methods for the same query.
 */
export const compareNoteSearch = action({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { query, limit = 10 }): Promise<{
    query: string;
    fuse: {
      results: string[];
      time: number;
    };
    vector: {
      results: Array<{ note: string; score: number }>;
      embeddingTime: number;
      searchTime: number;
      totalTime: number;
    };
  }> => {
    // Get vocabulary for fuse search
    const vocabulary: { notes: string[]; processes: string[] } = await ctx.runQuery(
      internal.search.getDistinctVocabulary,
      {}
    );

    // Fuse.js search
    const startFuse = Date.now();
    const fuseResults = findCandidateNotes(query, vocabulary.notes);
    const fuseTime = Date.now() - startFuse;

    // Vector search
    const vectorStart = Date.now();
    let vectorResults: Array<{ note: string; score: number }> = [];
    let embeddingTime = 0;
    let searchTime = 0;

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const embedStart = Date.now();
        const embedResponse = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: query,
            dimensions: 1024,
          }),
        });

        if (embedResponse.ok) {
          const embedData = await embedResponse.json();
          const queryEmbedding = embedData.data[0].embedding;
          embeddingTime = Date.now() - embedStart;

          const searchStart = Date.now();
          const searchResults = await ctx.vectorSearch("noteEmbeddings", "by_embedding", {
            vector: queryEmbedding,
            limit,
          });

          // Fetch actual note data from IDs
          const ids = searchResults.map((r) => r._id);
          const noteEmbeddings = await ctx.runQuery(internal.search.getNoteEmbeddingsByIds, { ids });
          searchTime = Date.now() - searchStart;

          // Map IDs to scores, then combine with note data
          const scoreById = new Map(searchResults.map((r) => [r._id.toString(), r._score]));
          vectorResults = noteEmbeddings.map((ne) => ({
            note: ne.note,
            score: scoreById.get(ne._id.toString()) ?? 0,
          }));
        }
      } catch (e) {
        console.error("Vector search failed:", e);
      }
    }

    return {
      query,
      fuse: {
        results: fuseResults,
        time: fuseTime,
      },
      vector: {
        results: vectorResults,
        embeddingTime,
        searchTime,
        totalTime: Date.now() - vectorStart,
      },
    };
  },
});

