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
  notes: v.array(v.string()),
  available: v.boolean(),
  imageUrl: v.union(v.string(), v.null()),
  skipped: v.boolean(),
});

/**
 * Get all active coffees (for search).
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("coffees")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

/**
 * Get active coffees by roaster.
 */
export const getByRoaster = query({
  args: { roasterId: v.string() },
  handler: async (ctx, { roasterId }) => {
    return await ctx.db
      .query("coffees")
      .withIndex("by_roaster", (q) =>
        q.eq("roasterId", roasterId).eq("isActive", true)
      )
      .collect();
  },
});

/**
 * Upsert a single coffee.
 * Deactivates any existing active record with same URL, inserts new as active.
 */
export const upsert = mutation({
  args: { coffee: coffeeValidator },
  handler: async (ctx, { coffee }) => {
    const existing = await ctx.db
      .query("coffees")
      .withIndex("by_url_active", (q) =>
        q.eq("url", coffee.url).eq("isActive", true)
      )
      .first();

    const now = Date.now();

    // Deactivate old record if exists
    if (existing) {
      await ctx.db.patch(existing._id, { isActive: false });
    }

    // Insert new active record
    return await ctx.db.insert("coffees", {
      ...coffee,
      isActive: true,
      scrapedAt: now,
    });
  },
});

/**
 * Batch upsert coffees (for scraper results).
 * Deactivates existing active records with same URLs, inserts new as active.
 */
export const batchUpsert = mutation({
  args: {
    coffees: v.array(coffeeValidator),
    roasterId: v.string(),
    roasterName: v.string(),
  },
  handler: async (ctx, { coffees, roasterId, roasterName }) => {
    const now = Date.now();
    let deactivated = 0;
    let inserted = 0;

    for (const coffee of coffees) {
      // Deactivate existing active record if exists
      const existing = await ctx.db
        .query("coffees")
        .withIndex("by_url_active", (q) =>
          q.eq("url", coffee.url).eq("isActive", true)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { isActive: false });
        deactivated++;
      }

      // Insert new active record
      await ctx.db.insert("coffees", {
        ...coffee,
        isActive: true,
        scrapedAt: now,
      });
      inserted++;
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

    return { inserted, deactivated };
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

/**
 * Delete inactive records for a roaster.
 */
export const clearInactive = mutation({
  args: { roasterId: v.string() },
  handler: async (ctx, { roasterId }) => {
    const inactive = await ctx.db
      .query("coffees")
      .filter((q) =>
        q.and(
          q.eq(q.field("roasterId"), roasterId),
          q.eq(q.field("isActive"), false)
        )
      )
      .collect();

    for (const coffee of inactive) {
      await ctx.db.delete(coffee._id);
    }

    return { deleted: inactive.length };
  },
});

/**
 * Get active URLs for a roaster (for sync diffing).
 */
export const getActiveUrlsByRoaster = query({
  args: { roasterId: v.string() },
  handler: async (ctx, { roasterId }) => {
    const coffees = await ctx.db
      .query("coffees")
      .withIndex("by_roaster", (q) =>
        q.eq("roasterId", roasterId).eq("isActive", true)
      )
      .collect();

    return coffees.map((c) => ({ url: c.url }));
  },
});

/**
 * Update availability and scrapedAt for existing coffees.
 */
export const updateAvailability = mutation({
  args: {
    roasterId: v.string(),
    updates: v.array(
      v.object({
        url: v.string(),
        prices: v.array(priceVariantValidator),
        available: v.boolean(),
      })
    ),
  },
  handler: async (ctx, { roasterId, updates }) => {
    const now = Date.now();
    let updated = 0;

    for (const update of updates) {
      const existing = await ctx.db
        .query("coffees")
        .withIndex("by_url_active", (q) =>
          q.eq("url", update.url).eq("isActive", true)
        )
        .first();

      if (existing && existing.roasterId === roasterId) {
        await ctx.db.patch(existing._id, {
          prices: update.prices,
          available: update.available,
          scrapedAt: now,
        });
        updated++;
      }
    }

    // Update roaster lastScrapedAt
    const roaster = await ctx.db
      .query("roasters")
      .withIndex("by_roasterId", (q) => q.eq("roasterId", roasterId))
      .first();

    if (roaster) {
      await ctx.db.patch(roaster._id, { lastScrapedAt: now });
    }

    return { updated };
  },
});

/**
 * Batch deactivate coffees by URL.
 */
export const batchDeactivate = mutation({
  args: {
    roasterId: v.string(),
    urls: v.array(v.string()),
  },
  handler: async (ctx, { roasterId, urls }) => {
    let deactivated = 0;

    for (const url of urls) {
      const existing = await ctx.db
        .query("coffees")
        .withIndex("by_url_active", (q) =>
          q.eq("url", url).eq("isActive", true)
        )
        .first();

      if (existing && existing.roasterId === roasterId) {
        await ctx.db.patch(existing._id, { isActive: false });
        deactivated++;
      }
    }

    return { deactivated };
  },
});
