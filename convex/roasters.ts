/**
 * Roaster queries and mutations.
 */

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get all roasters.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("roasters").collect();
  },
});

/**
 * Get all roasters with shipping rates.
 */
export const getAllWithShipping = query({
  args: {},
  handler: async (ctx) => {
    const roasters = await ctx.db.query("roasters").collect();
    return roasters.map((r) => ({
      roasterId: r.roasterId,
      name: r.name,
      shippingRates: r.shippingRates ?? [],
    }));
  },
});

/**
 * Update shipping rates for a roaster.
 */
export const updateShippingRates = mutation({
  args: {
    roasterId: v.string(),
    rates: v.array(v.object({
      countryCode: v.string(),
      available: v.boolean(),
      price: v.optional(v.number()),
      priceUsd: v.optional(v.number()),
      currency: v.string(),
      checkedAt: v.number(),
    })),
  },
  handler: async (ctx, { roasterId, rates }) => {
    const roaster = await ctx.db
      .query("roasters")
      .withIndex("by_roasterId", (q) => q.eq("roasterId", roasterId))
      .first();

    if (!roaster) {
      throw new Error(`Roaster not found: ${roasterId}`);
    }

    // Merge with existing rates (keep other countries)
    const existingRates = roaster.shippingRates ?? [];
    const newCountries = new Set(rates.map((r) => r.countryCode));
    const mergedRates = [
      ...existingRates.filter((r) => !newCountries.has(r.countryCode)),
      ...rates,
    ];

    await ctx.db.patch(roaster._id, { shippingRates: mergedRates });
    return { updated: rates.length };
  },
});
