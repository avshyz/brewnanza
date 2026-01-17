/**
 * Zod schemas for coffee data.
 * All origin fields are arrays to support blends.
 * Single origin: ["Ethiopia"], Blend: ["Ethiopia", "Colombia"]
 */

import { z } from "zod";
import { toUsd } from "./currency.js";

export const PriceVariantSchema = z.object({
  price: z.number(),
  currency: z.string(),
  weightGrams: z.number().int(),
  priceUsd: z.number().nullable().default(null),
  available: z.boolean().default(true),
});

export type PriceVariant = z.infer<typeof PriceVariantSchema>;

/** Factory function that auto-converts to USD */
export function createPriceVariant(
  price: number,
  currency: string,
  weightGrams: number,
  available = true
): PriceVariant {
  return {
    price,
    currency,
    weightGrams,
    priceUsd: toUsd(price, currency),
    available,
  };
}

export const CoffeeSchema = z.object({
  // Required fields
  name: z.string(),
  url: z.string(),
  roasterId: z.string(),

  // Pricing (from catalogue scraper, not AI)
  prices: z.array(PriceVariantSchema).default([]),

  // Origin info (arrays for blend support)
  country: z.array(z.string()).default([]),
  region: z.array(z.string()).default([]),
  producer: z.array(z.string()).default([]),

  // Processing (arrays for blend support)
  process: z.array(z.string()).default([]),
  protocol: z.array(z.string()).default([]),
  variety: z.array(z.string()).default([]),

  // Tasting notes
  notes: z.array(z.string()).default([]),

  // Caffeine level: null = regular, "decaf" = decaffeinated, "lowcaf" = low caffeine
  caffeine: z.enum(["decaf", "lowcaf"]).nullable().default(null),

  // Metadata
  available: z.boolean().default(true),
  imageUrl: z.string().nullable().default(null),
  skipped: z.boolean().default(false),
});

export type Coffee = z.infer<typeof CoffeeSchema>;

export const ScrapeResultSchema = z.object({
  roasterId: z.string(),
  roasterName: z.string(),
  coffees: z.array(CoffeeSchema),
  scrapedAt: z.string(),
  errors: z.array(z.string()).default([]),
});

export type ScrapeResult = z.infer<typeof ScrapeResultSchema>;
