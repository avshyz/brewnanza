/**
 * Shipping rate checker module.
 *
 * Checks shipping availability and prices for roasters.
 */

import type { ShippingRate, ShippingCheckResult, Platform } from "./types.js";
import { ShopifyShippingChecker } from "./shopify-shipping.js";
import { WooCommerceShippingChecker } from "./woocommerce-shipping.js";
import type { RoasterConfig } from "../config.js";

export * from "./types.js";

// Platform checkers
const shopifyChecker = new ShopifyShippingChecker();
const woocommerceChecker = new WooCommerceShippingChecker();

// Map roaster IDs to their platform
const ROASTER_PLATFORMS: Record<string, Platform> = {
  // Shopify stores
  friedhats: "shopify",
  lacabra: "shopify",
  kbcoffee: "shopify",
  devocion: "shopify",
  april: "shopify",
  standout: "shopify",
  coffeeorg: "shopify",
  hydrangea: "shopify",
  datura: "shopify",
  scenery: "shopify",
  // WooCommerce stores
  tanat: "woocommerce",
  manhattan: "woocommerce",
  amoc: "woocommerce",
  jera: "woocommerce",
  // Custom stores (not supported yet)
  dak: "custom",
  youneedcoffee: "custom",
};

/**
 * Get the platform for a roaster.
 */
export function getRoasterPlatform(roasterId: string): Platform | undefined {
  return ROASTER_PLATFORMS[roasterId];
}

/**
 * Check shipping for a single roaster to a country.
 */
export async function checkRoasterShipping(
  config: RoasterConfig,
  countryCode: string
): Promise<ShippingRate | null> {
  const platform = getRoasterPlatform(config.id);

  if (!platform) {
    console.warn(`Unknown platform for roaster: ${config.id}`);
    return null;
  }

  if (platform === "custom") {
    // Custom stores not yet supported
    return null;
  }

  const checker = platform === "shopify" ? shopifyChecker : woocommerceChecker;
  return checker.checkShipping(config.baseUrl, countryCode, config.currency);
}

/**
 * Check shipping for all roasters to a country.
 */
export async function checkAllShipping(
  roasters: RoasterConfig[],
  countryCode: string,
  options: { verbose?: boolean; concurrency?: number } = {}
): Promise<ShippingCheckResult[]> {
  const { verbose = false, concurrency = 3 } = options;
  const results: ShippingCheckResult[] = [];

  // Process in batches to avoid rate limiting
  for (let i = 0; i < roasters.length; i += concurrency) {
    const batch = roasters.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (config) => {
        const platform = getRoasterPlatform(config.id);

        if (!platform) {
          if (verbose) console.log(`? ${config.name}: Unknown platform`);
          return { roasterId: config.id, rates: [] };
        }

        if (platform === "custom") {
          if (verbose) console.log(`- ${config.name}: Custom (not supported)`);
          return { roasterId: config.id, rates: [] };
        }

        try {
          const rate = await checkRoasterShipping(config, countryCode);
          if (!rate) {
            if (verbose) console.log(`? ${config.name}: No rate returned`);
            return { roasterId: config.id, rates: [] };
          }

          if (rate.available) {
            const priceDisplay = rate.priceUsd
              ? `$${rate.priceUsd.toFixed(2)}`
              : `${rate.price} ${rate.currency}`;
            if (verbose) console.log(`✓ ${config.name}: ${priceDisplay}`);
          } else {
            if (verbose) console.log(`✗ ${config.name}: Not available`);
          }

          return { roasterId: config.id, rates: [rate] };
        } catch (error) {
          if (verbose) console.log(`✗ ${config.name}: Error - ${error}`);
          return { roasterId: config.id, rates: [] };
        }
      })
    );

    results.push(...batchResults);

    // Small delay between batches
    if (i + concurrency < roasters.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}
