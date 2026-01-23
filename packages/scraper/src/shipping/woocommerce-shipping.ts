/**
 * WooCommerce shipping rate checker.
 *
 * Uses WooCommerce Store API to add product to cart and check shipping.
 */

import type { ShippingChecker, ShippingRate } from "./types.js";
import { toUsd } from "../currency.js";
import { USER_AGENT } from "../config.js";

interface WooProduct {
  id: number;
  name: string;
  prices: {
    price: string;
    currency_code: string;
  };
  is_purchasable: boolean;
  is_in_stock: boolean;
}

interface WooShippingRate {
  rate_id: string;
  name: string;
  price: string;
  currency_code: string;
}

interface WooShippingPackage {
  shipping_rates: WooShippingRate[];
}

interface WooCartResponse {
  shipping_rates?: WooShippingPackage[];
}

// Default zip codes per country
const COUNTRY_ZIP_CODES: Record<string, string> = {
  IL: "6100000",
  US: "10001",
  GB: "W1A 1AA",
  DE: "10115",
  NL: "1012",
  DK: "1000",
  SE: "111 21",
  FR: "75001",
  ES: "28001",
  IT: "00100",
  CA: "M5V 1J2",
  AU: "2000",
  JP: "100-0001",
};

export class WooCommerceShippingChecker implements ShippingChecker {
  platform = "woocommerce" as const;

  async checkShipping(
    baseUrl: string,
    countryCode: string,
    currency: string
  ): Promise<ShippingRate | null> {
    try {
      // 1. Find a product to add
      const productId = await this.findProduct(baseUrl);
      if (!productId) {
        return this.createUnavailable(countryCode, currency);
      }

      // 2. Add to cart via Store API
      const cartKey = await this.addToCart(baseUrl, productId);
      if (!cartKey) {
        return this.createUnavailable(countryCode, currency);
      }

      // 3. Update shipping address and get rates
      const rates = await this.getShippingRates(baseUrl, cartKey, countryCode);
      if (!rates || rates.length === 0) {
        return this.createUnavailable(countryCode, currency);
      }

      // Find cheapest rate
      const cheapest = rates.reduce((min, rate) => {
        const price = parseInt(rate.price, 10);
        return price < parseInt(min.price, 10) ? rate : min;
      }, rates[0]);

      // WooCommerce prices are in cents
      const price = parseInt(cheapest.price, 10) / 100;
      const rateCurrency = cheapest.currency_code || currency;
      const priceUsd = toUsd(price, rateCurrency);

      return {
        countryCode,
        available: true,
        price,
        priceUsd: priceUsd ?? undefined,
        currency: rateCurrency,
        checkedAt: Date.now(),
      };
    } catch (error) {
      console.error(`WooCommerce shipping check failed for ${baseUrl}:`, error);
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
   * Find a purchasable product via Store API.
   */
  private async findProduct(baseUrl: string): Promise<number | null> {
    const url = `${baseUrl}/wp-json/wc/store/v1/products?per_page=5`;
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) return null;

    const products: WooProduct[] = await response.json();
    const available = products.find((p) => p.is_purchasable && p.is_in_stock);
    return available?.id ?? null;
  }

  /**
   * Add product to cart and return cart key.
   */
  private async addToCart(baseUrl: string, productId: number): Promise<string | null> {
    const url = `${baseUrl}/wp-json/wc/store/v1/cart/add-item`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        id: productId,
        quantity: 1,
      }),
    });

    if (!response.ok) return null;

    // Cart key comes from Nonce header
    const nonce = response.headers.get("x-wc-store-api-nonce") || response.headers.get("nonce");
    return nonce || "temp";
  }

  /**
   * Update shipping address and get rates.
   */
  private async getShippingRates(
    baseUrl: string,
    _cartKey: string,
    countryCode: string
  ): Promise<WooShippingRate[] | null> {
    const zip = COUNTRY_ZIP_CODES[countryCode] || "00000";

    // Update customer address
    const updateUrl = `${baseUrl}/wp-json/wc/store/v1/cart/update-customer`;
    await fetch(updateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        shipping_address: {
          country: countryCode,
          postcode: zip,
        },
      }),
    });

    // Get cart with shipping rates
    const cartUrl = `${baseUrl}/wp-json/wc/store/v1/cart`;
    const response = await fetch(cartUrl, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) return null;

    const cart: WooCartResponse = await response.json();
    const packages = cart.shipping_rates || [];

    // Collect all rates from all packages
    const allRates: WooShippingRate[] = [];
    for (const pkg of packages) {
      allRates.push(...(pkg.shipping_rates || []));
    }

    return allRates;
  }
}
