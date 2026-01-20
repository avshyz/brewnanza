/**
 * Note embeddings for semantic note matching.
 * Pre-computed embeddings for individual tasting notes.
 */

import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";

/**
 * Get all notes that need embeddings.
 * Fetches distinct notes from coffees that don't have embeddings yet.
 */
export const getMissingEmbeddings = query({
  args: {},
  handler: async (ctx) => {
    // Get all existing note embeddings
    const existing = await ctx.db.query("noteEmbeddings").collect();
    const embeddedNotes = new Set(existing.map((e) => e.note.toLowerCase()));

    // Get all distinct notes from active coffees
    const coffees = await ctx.db
      .query("coffees")
      .filter((q) =>
        q.and(q.eq(q.field("isActive"), true), q.eq(q.field("skipped"), false))
      )
      .collect();

    const allNotes = new Set<string>();
    for (const coffee of coffees) {
      for (const note of coffee.notes) {
        allNotes.add(note.toLowerCase());
      }
    }

    // Return notes that don't have embeddings yet
    const missing = Array.from(allNotes).filter((n) => !embeddedNotes.has(n));
    return missing.sort();
  },
});

/**
 * Get all note embeddings.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("noteEmbeddings").collect();
  },
});

/**
 * Batch upsert note embeddings.
 */
export const batchUpsert = mutation({
  args: {
    entries: v.array(
      v.object({
        note: v.string(),
        embedding: v.array(v.float64()),
        category: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { entries }) => {
    let inserted = 0;
    let updated = 0;

    for (const entry of entries) {
      const existing = await ctx.db
        .query("noteEmbeddings")
        .withIndex("by_note", (q) => q.eq("note", entry.note.toLowerCase()))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          embedding: entry.embedding,
          category: entry.category,
        });
        updated++;
      } else {
        await ctx.db.insert("noteEmbeddings", {
          note: entry.note.toLowerCase(),
          embedding: entry.embedding,
          category: entry.category,
        });
        inserted++;
      }
    }

    return { inserted, updated };
  },
});

/**
 * Internal query to get note by name.
 */
export const getByNote = internalQuery({
  args: { note: v.string() },
  handler: async (ctx, { note }) => {
    return await ctx.db
      .query("noteEmbeddings")
      .withIndex("by_note", (q) => q.eq("note", note.toLowerCase()))
      .first();
  },
});

/**
 * Clear all note embeddings.
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("noteEmbeddings").collect();
    for (const entry of all) {
      await ctx.db.delete(entry._id);
    }
    return { deleted: all.length };
  },
});
