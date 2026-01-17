/**
 * Coffee CRUD operations.
 * All origin fields are arrays to support blends.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Price variant validator
const priceVariantValidator = v.object({
  price: v.number(),
  currency: v.string(),
  weightGrams: v.number(),
  priceUsd: v.union(v.number(), v.null()),
  available: v.boolean(),
});

// Coffee validator (for upsert)
// All origin fields are arrays: single origin ["Ethiopia"], blend ["Ethiopia", "Colombia"]
const coffeeValidator = v.object({
  name: v.string(),
  url: v.string(),
  roasterId: v.string(),
  prices: v.array(priceVariantValidator),
  country: v.array(v.string()),
  region: v.array(v.string()),
  producer: v.array(v.string()),
  process: v.array(v.string()),
  protocol: v.array(v.string()),
  variety: v.array(v.string()),
  available: v.boolean(),
  imageUrl: v.union(v.string(), v.null()),
  skipped: v.boolean(),
});

/**
 * Get all coffees (for search).
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("coffees").collect();
  },
});

/**
 * Get coffees by roaster.
 */
export const getByRoaster = query({
  args: { roasterId: v.string() },
  handler: async (ctx, { roasterId }) => {
    return await ctx.db
      .query("coffees")
      .withIndex("by_roaster", (q) => q.eq("roasterId", roasterId))
      .collect();
  },
});

/**
 * Upsert a single coffee (insert or update by URL).
 */
export const upsert = mutation({
  args: { coffee: coffeeValidator },
  handler: async (ctx, { coffee }) => {
    const existing = await ctx.db
      .query("coffees")
      .withIndex("by_url", (q) => q.eq("url", coffee.url))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...coffee,
        scrapedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("coffees", {
        ...coffee,
        scrapedAt: now,
      });
    }
  },
});

/**
 * Batch upsert coffees (for scraper results).
 */
export const batchUpsert = mutation({
  args: {
    coffees: v.array(coffeeValidator),
    roasterId: v.string(),
    roasterName: v.string(),
  },
  handler: async (ctx, { coffees, roasterId, roasterName }) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;

    for (const coffee of coffees) {
      const existing = await ctx.db
        .query("coffees")
        .withIndex("by_url", (q) => q.eq("url", coffee.url))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...coffee,
          scrapedAt: now,
        });
        updated++;
      } else {
        await ctx.db.insert("coffees", {
          ...coffee,
          scrapedAt: now,
        });
        inserted++;
      }
    }

    // Update roaster metadata
    const existingRoaster = await ctx.db
      .query("roasters")
      .withIndex("by_roasterId", (q) => q.eq("roasterId", roasterId))
      .first();

    if (existingRoaster) {
      await ctx.db.patch(existingRoaster._id, {
        lastScrapedAt: now,
        coffeeCount: coffees.length,
      });
    } else {
      const baseUrl = coffees[0]?.url ? new URL(coffees[0].url).origin : "";
      const currency = coffees[0]?.prices[0]?.currency || "USD";

      await ctx.db.insert("roasters", {
        roasterId,
        name: roasterName,
        baseUrl,
        currency,
        lastScrapedAt: now,
        coffeeCount: coffees.length,
      });
    }

    return { inserted, updated };
  },
});

/**
 * Clear all data from coffees and roasters tables.
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const coffees = await ctx.db.query("coffees").collect();
    for (const coffee of coffees) {
      await ctx.db.delete(coffee._id);
    }

    const roasters = await ctx.db.query("roasters").collect();
    for (const roaster of roasters) {
      await ctx.db.delete(roaster._id);
    }

    return { coffeesDeleted: coffees.length, roastersDeleted: roasters.length };
  },
});
