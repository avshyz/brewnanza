/**
 * Convex schema for Brewnanza.
 * All origin fields are arrays to support blends.
 * Single origin: ["Ethiopia"], Blend: ["Ethiopia", "Colombia"]
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Price variant (weight/price combo)
const priceVariant = v.object({
  price: v.number(),
  currency: v.string(),
  weightGrams: v.number(),
  priceUsd: v.union(v.number(), v.null()),
  available: v.boolean(),
});

export default defineSchema({
  // Coffee products
  coffees: defineTable({
    // Required fields
    name: v.string(),
    url: v.string(),
    roasterId: v.string(),

    // Pricing
    prices: v.array(priceVariant),

    // Origin info (arrays for blend support)
    country: v.array(v.string()),
    region: v.array(v.string()),
    producer: v.array(v.string()),

    // Processing (arrays for blend support)
    process: v.array(v.string()),
    protocol: v.array(v.string()),
    variety: v.array(v.string()),

    // Tasting notes
    notes: v.array(v.string()),

    // Metadata
    available: v.boolean(),
    imageUrl: v.union(v.string(), v.null()),
    skipped: v.boolean(),

    // Versioning (URL reuse support)
    isActive: v.boolean(),
    scrapedAt: v.number(),
  })
    .index("by_roaster", ["roasterId", "isActive"])
    .index("by_url_active", ["url", "isActive"]),

  // Roaster metadata
  roasters: defineTable({
    roasterId: v.string(),
    name: v.string(),
    baseUrl: v.string(),
    currency: v.string(),
    lastScrapedAt: v.union(v.number(), v.null()),
    coffeeCount: v.number(),
  }).index("by_roasterId", ["roasterId"]),
});
