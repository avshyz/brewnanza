/**
 * Shopify shipping rate checker.
 *
 * Adds a product to cart and queries /cart/shipping_rates.json
 */

import type { ShippingChecker, ShippingRate } from "./types.js";
import { toUsd } from "../currency.js";
import { USER_AGENT } from "../config.js";

interface ShopifyVariant {
  id: number;
  price: string;
  available: boolean;
}

interface ShopifyProduct {
  variants: ShopifyVariant[];
}

interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

interface ShopifyShippingRate {
  price: string;
  name: string;
  delivery_range?: [number, number];
}

interface ShopifyShippingResponse {
  shipping_rates: ShopifyShippingRate[];
}

// Default zip codes per country for shipping estimation
const COUNTRY_ZIP_CODES: Record<string, string> = {
  IL: "6100000", // Tel Aviv
  US: "10001",   // NYC
  GB: "W1A 1AA", // London
  DE: "10115",   // Berlin
  NL: "1012",    // Amsterdam
  DK: "1000",    // Copenhagen
  SE: "111 21",  // Stockholm
  FR: "75001",   // Paris
  ES: "28001",   // Madrid
  IT: "00100",   // Rome
  CA: "M5V 1J2", // Toronto
  AU: "2000",    // Sydney
  JP: "100-0001", // Tokyo
};

export class ShopifyShippingChecker implements ShippingChecker {
  platform = "shopify" as const;

  /**
   * Check shipping rate to a country.
   */
  async checkShipping(
    baseUrl: string,
    countryCode: string,
    currency: string
  ): Promise<ShippingRate | null> {
    try {
      // 1. Find a variant ID to add to cart
      const variantId = await this.findCheapestVariant(baseUrl);
      if (!variantId) {
        return this.createUnavailable(countryCode, currency);
      }

      // 2. Create a fresh cart with the product
      const cartToken = await this.createCart(baseUrl, variantId);
      if (!cartToken) {
        return this.createUnavailable(countryCode, currency);
      }

      // 3. Get shipping rates
      const rates = await this.fetchShippingRates(baseUrl, cartToken, countryCode);
      if (!rates || rates.length === 0) {
        return this.createUnavailable(countryCode, currency);
      }

      // Find cheapest rate
      const cheapest = rates.reduce((min, rate) => {
        const price = parseFloat(rate.price);
        return price < parseFloat(min.price) ? rate : min;
      }, rates[0]);

      const price = parseFloat(cheapest.price);
      const priceUsd = toUsd(price, currency);

      return {
        countryCode,
        available: true,
        price,
        priceUsd: priceUsd ?? undefined,
        currency,
        checkedAt: Date.now(),
      };
    } catch (error) {
      console.error(`Shopify shipping check failed for ${baseUrl}:`, error);
      return this.createUnavailable(countryCode, currency);
    }
  }

  private createUnavailable(countryCode: string, currency: string): ShippingRate {
    return {
      countryCode,
      available: false,
      currency,
      checkedAt: Date.now(),
    };
  }

  /**
   * Find cheapest available variant ID from the store.
   */
  private async findCheapestVariant(baseUrl: string): Promise<number | null> {
    const url = `${baseUrl}/products.json?limit=10`;
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) return null;

    const data: ShopifyProductsResponse = await response.json();
    let cheapest: ShopifyVariant | null = null;

    for (const product of data.products || []) {
      for (const variant of product.variants || []) {
        if (!variant.available) continue;
        const price = parseFloat(variant.price);
        if (!cheapest || price < parseFloat(cheapest.price)) {
          cheapest = variant;
        }
      }
    }

    return cheapest?.id ?? null;
  }

  /**
   * Create a cart with a product and return the cart token.
   */
  private async createCart(baseUrl: string, variantId: number): Promise<string | null> {
    const url = `${baseUrl}/cart/add.js`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        items: [{ id: variantId, quantity: 1 }],
      }),
    });

    if (!response.ok) return null;

    // Get cart token from cookies
    const cookies = response.headers.get("set-cookie") || "";
    const cartMatch = cookies.match(/cart=([^;]+)/);
    if (cartMatch) return cartMatch[1];

    // Try fetching cart.js to get token
    const cartResponse = await fetch(`${baseUrl}/cart.js`, {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: cookies,
      },
    });

    if (cartResponse.ok) {
      const cart = await cartResponse.json();
      return cart.token || "temp";
    }

    return "temp"; // Some stores work without explicit token
  }

  /**
   * Fetch shipping rates for a cart.
   */
  private async fetchShippingRates(
    baseUrl: string,
    _cartToken: string,
    countryCode: string
  ): Promise<ShopifyShippingRate[] | null> {
    const zip = COUNTRY_ZIP_CODES[countryCode] || "00000";
    const params = new URLSearchParams({
      "shipping_address[zip]": zip,
      "shipping_address[country]": countryCode,
      "shipping_address[province]": "",
    });

    const url = `${baseUrl}/cart/shipping_rates.json?${params}`;
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      // 422 usually means doesn't ship there
      if (response.status === 422) return [];
      return null;
    }

    const data: ShopifyShippingResponse = await response.json();
    return data.shipping_rates || [];
  }
}
