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

    // Caffeine level: null = regular, "decaf" = decaffeinated, "lowcaf" = low caffeine
    caffeine: v.union(v.literal("decaf"), v.literal("lowcaf"), v.null()),

    // Roast level: null = unknown (optional for existing data)
    roastLevel: v.optional(v.union(v.literal("light"), v.literal("medium"), v.literal("dark"), v.null())),

    // Roasted for: null = omni/both (optional for existing data)
    roastedFor: v.optional(v.union(v.literal("filter"), v.literal("espresso"), v.null())),

    // Metadata
    available: v.boolean(),
    imageUrl: v.union(v.string(), v.null()),
    skipped: v.boolean(),

    // Versioning (URL reuse support)
    isActive: v.boolean(),
    scrapedAt: v.number(),

    // Semantic search embedding (e5-large-v2, 1024 dimensions)
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_roaster", ["roasterId", "isActive"])
    .index("by_url_active", ["url", "isActive"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
      filterFields: ["isActive", "roasterId"],
    }),

  // Roaster metadata
  roasters: defineTable({
    roasterId: v.string(),
    name: v.string(),
    baseUrl: v.string(),
    currency: v.string(),
    lastScrapedAt: v.union(v.number(), v.null()),
    coffeeCount: v.number(),
  }).index("by_roasterId", ["roasterId"]),

  // Individual note embeddings for semantic note matching
  noteEmbeddings: defineTable({
    note: v.string(), // e.g., "pear", "chocolate", "bergamot"
    embedding: v.array(v.float64()), // e5-large-v2 embedding (1024 dim)
    category: v.optional(v.string()), // optional grouping: "fruit", "floral", etc.
  })
    .index("by_note", ["note"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
    }),
});
