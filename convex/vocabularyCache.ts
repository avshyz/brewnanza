/**
 * Vocabulary cache for semantic search.
 * Pre-computed embeddings and mappings for common barista terms.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Get cached entry for a term.
 */
export const get = query({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    return await ctx.db
      .query("vocabularyCache")
      .withIndex("by_term", (q) => q.eq("term", term.toLowerCase().trim()))
      .first();
  },
});

/**
 * Get all cached terms (for debugging/listing).
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("vocabularyCache").collect();
  },
});

/**
 * Upsert a vocabulary cache entry.
 */
export const upsert = mutation({
  args: {
    term: v.string(),
    embedding: v.array(v.float64()),
    mappedNotes: v.array(v.string()),
    mappedProcesses: v.array(v.string()),
  },
  handler: async (ctx, { term, embedding, mappedNotes, mappedProcesses }) => {
    const normalizedTerm = term.toLowerCase().trim();
    const existing = await ctx.db
      .query("vocabularyCache")
      .withIndex("by_term", (q) => q.eq("term", normalizedTerm))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        embedding,
        mappedNotes,
        mappedProcesses,
        createdAt: Date.now(),
      });
      return { updated: true, id: existing._id };
    }

    const id = await ctx.db.insert("vocabularyCache", {
      term: normalizedTerm,
      embedding,
      mappedNotes,
      mappedProcesses,
      createdAt: Date.now(),
    });
    return { updated: false, id };
  },
});

/**
 * Batch upsert vocabulary cache entries.
 */
export const batchUpsert = mutation({
  args: {
    entries: v.array(
      v.object({
        term: v.string(),
        embedding: v.array(v.float64()),
        mappedNotes: v.array(v.string()),
        mappedProcesses: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, { entries }) => {
    let inserted = 0;
    let updated = 0;

    for (const entry of entries) {
      const normalizedTerm = entry.term.toLowerCase().trim();
      const existing = await ctx.db
        .query("vocabularyCache")
        .withIndex("by_term", (q) => q.eq("term", normalizedTerm))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          embedding: entry.embedding,
          mappedNotes: entry.mappedNotes,
          mappedProcesses: entry.mappedProcesses,
          createdAt: Date.now(),
        });
        updated++;
      } else {
        await ctx.db.insert("vocabularyCache", {
          term: normalizedTerm,
          embedding: entry.embedding,
          mappedNotes: entry.mappedNotes,
          mappedProcesses: entry.mappedProcesses,
          createdAt: Date.now(),
        });
        inserted++;
      }
    }

    return { inserted, updated };
  },
});

/**
 * Clear all vocabulary cache entries.
 */
export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("vocabularyCache").collect();
    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }
    return { deleted: entries.length };
  },
});
