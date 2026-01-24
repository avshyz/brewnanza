/**
 * Shopify shipping rate checker.
 *
 * Adds a product to cart and queries /cart/shipping_rates.json
 * Supports both regular Shopify and Hydrogen (headless) stores.
 *
 * For Hydrogen stores (which don't expose /products.json), we:
 * 1. Extract a variant ID from the product page HTML
 * 2. Discover the underlying myshopify.com domain via cart redirect
 * 3. Use the myshopify.com domain for cart/shipping operations
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
      // Resolve the effective base URL (may be myshopify.com for Hydrogen stores)
      const { effectiveUrl, variantId } = await this.resolveStoreAndVariant(baseUrl);

      if (!effectiveUrl || !variantId) {
        return this.createUnavailable(countryCode, currency);
      }

      // Create cart and get shipping rates using the effective URL
      const cartCookies = await this.createCart(effectiveUrl, variantId);
      if (!cartCookies) {
        return this.createUnavailable(countryCode, currency);
      }

      const rates = await this.fetchShippingRates(effectiveUrl, cartCookies, countryCode);
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

  /**
   * Resolve the effective store URL and find an available variant.
   * For standard Shopify: returns the original URL
   * For Hydrogen: discovers the myshopify.com domain
   */
  private async resolveStoreAndVariant(
    baseUrl: string
  ): Promise<{ effectiveUrl: string | null; variantId: number | null }> {
    // Try standard Shopify /products.json first
    const variantFromJson = await this.findVariantFromProductsJson(baseUrl);
    if (variantFromJson) {
      return { effectiveUrl: baseUrl, variantId: variantFromJson };
    }

    // Hydrogen store - need to discover myshopify.com domain
    const variantId = await this.findVariantFromHydrogen(baseUrl);
    if (!variantId) {
      return { effectiveUrl: null, variantId: null };
    }

    // Discover the myshopify.com domain via cart redirect
    const myshopifyDomain = await this.discoverMyshopifyDomain(baseUrl, variantId);
    if (!myshopifyDomain) {
      return { effectiveUrl: null, variantId: null };
    }

    // Now get an available variant from the myshopify.com domain
    const availableVariant = await this.findVariantFromProductsJson(myshopifyDomain);

    return {
      effectiveUrl: myshopifyDomain,
      variantId: availableVariant ?? variantId,
    };
  }

  /**
   * Discover the underlying myshopify.com domain by following cart redirect.
   * Hydrogen stores redirect /cart/{variantId}:1 to their myshopify.com domain.
   */
  private async discoverMyshopifyDomain(
    baseUrl: string,
    variantId: number
  ): Promise<string | null> {
    try {
      const cartUrl = `${baseUrl}/cart/${variantId}:1`;
      const response = await fetch(cartUrl, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": USER_AGENT },
      });

      const location = response.headers.get("location");
      if (!location) return null;

      // Extract myshopify.com base URL from redirect
      const match = location.match(/(https:\/\/[^/]+\.myshopify\.com)/);
      return match?.[1] ?? null;
    } catch {
      return null;
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
   * Standard Shopify: get cheapest available variant from /products.json
   */
  private async findVariantFromProductsJson(baseUrl: string): Promise<number | null> {
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
   * Hydrogen stores: extract variant ID from collection/product pages.
   * Fetches collection page, finds a product URL, extracts variant from product page.
   */
  private async findVariantFromHydrogen(baseUrl: string): Promise<number | null> {
    try {
      // Try common collection paths
      const collectionPaths = ["/collections/all", "/collections/coffee", "/products"];

      for (const path of collectionPaths) {
        const collectionUrl = `${baseUrl}${path}`;
        const collectionResponse = await fetch(collectionUrl, {
          headers: { "User-Agent": USER_AGENT },
        });

        if (!collectionResponse.ok) continue;

        const html = await collectionResponse.text();

        // Find product link in HTML (strip query params)
        const productLinkMatch = html.match(/href="(\/products\/[^"?]+)/);
        if (!productLinkMatch) continue;

        const productUrl = `${baseUrl}${productLinkMatch[1]}`;
        const productResponse = await fetch(productUrl, {
          headers: { "User-Agent": USER_AGENT },
        });

        if (!productResponse.ok) continue;

        const productHtml = await productResponse.text();

        // Extract variant ID: gid://shopify/ProductVariant/52475839021394
        const variantMatch = productHtml.match(/gid:\/\/shopify\/ProductVariant\/(\d+)/);
        if (variantMatch) {
          return parseInt(variantMatch[1], 10);
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Create a cart with a product and return the session cookies.
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

    // Extract cookies from response
    const setCookieHeaders = response.headers.getSetCookie?.() || [];
    if (setCookieHeaders.length === 0) {
      // Fallback for environments without getSetCookie
      const cookieHeader = response.headers.get("set-cookie") || "";
      return cookieHeader.split(";")[0] || null;
    }

    // Combine all cookies into a single header value
    return setCookieHeaders.map((c) => c.split(";")[0]).join("; ");
  }

  /**
   * Fetch shipping rates for a cart.
   */
  private async fetchShippingRates(
    baseUrl: string,
    cookies: string,
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
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: cookies,
      },
    });

    if (!response.ok) {
      // 422 usually means doesn't ship there or empty cart
      if (response.status === 422) return [];
      return null;
    }

    const data: ShopifyShippingResponse = await response.json();
    return data.shipping_rates || [];
  }
}
