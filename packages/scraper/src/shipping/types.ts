/**
 * Shipping rate checker types.
 */

export interface ShippingRate {
  countryCode: string;
  available: boolean;
  price?: number;      // Original price in store currency
  priceUsd?: number;   // Converted to USD
  currency: string;
  checkedAt: number;
}

export interface ShippingCheckResult {
  roasterId: string;
  rates: ShippingRate[];
}

export type Platform = "shopify" | "woocommerce" | "custom";

export interface ShippingChecker {
  platform: Platform;
  checkShipping(
    baseUrl: string,
    countryCode: string,
    currency: string
  ): Promise<ShippingRate | null>;
}
