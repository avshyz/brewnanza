"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { getSavedCountry, saveCountry, detectCountry, getCountryName, getSupportedCountries } from "./geolocation";

interface ShippingRate {
  countryCode: string;
  available: boolean;
  price?: number;
  priceUsd?: number;
  currency: string;
  checkedAt: number;
}

interface RoasterShipping {
  roasterId: string;
  name: string;
  shippingRates: ShippingRate[];
}

export interface ShippingInfo {
  available: boolean;
  priceUsd?: number;
  currency?: string;
  price?: number;
}

export function useShipping() {
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(true);
  const [shippingEnabled, setShippingEnabled] = useState(false);

  // Fetch roaster shipping data from Convex
  const roastersWithShipping = useQuery(api.roasters.getAllWithShipping) as RoasterShipping[] | undefined;

  // Build lookup map: roasterId -> ShippingRate for selected country
  const shippingByRoaster = useMemo(() => {
    if (!roastersWithShipping || !selectedCountry) return new Map<string, ShippingInfo>();

    const map = new Map<string, ShippingInfo>();
    for (const roaster of roastersWithShipping) {
      const rate = roaster.shippingRates?.find((r) => r.countryCode === selectedCountry);
      if (rate) {
        map.set(roaster.roasterId, {
          available: rate.available,
          priceUsd: rate.priceUsd,
          currency: rate.currency,
          price: rate.price,
        });
      }
      // If no rate found, roaster is "unknown" - could ship or not
    }
    return map;
  }, [roastersWithShipping, selectedCountry]);

  // Auto-detect country on mount
  useEffect(() => {
    const init = async () => {
      const saved = getSavedCountry();
      if (saved) {
        setSelectedCountry(saved);
        setIsDetecting(false);
        return;
      }

      const detected = await detectCountry();
      if (detected) {
        setSelectedCountry(detected);
        saveCountry(detected);
      }
      setIsDetecting(false);
    };

    init();
  }, []);

  // Change country
  const changeCountry = useCallback((code: string) => {
    setSelectedCountry(code);
    saveCountry(code);
  }, []);

  // Toggle shipping filter
  const toggleShippingFilter = useCallback(() => {
    setShippingEnabled((prev) => !prev);
  }, []);

  // Get shipping info for a roaster
  const getShippingForRoaster = useCallback(
    (roasterId: string): ShippingInfo | null => {
      return shippingByRoaster.get(roasterId) || null;
    },
    [shippingByRoaster]
  );

  // Check if a roaster can ship to selected country
  const canShipToCountry = useCallback(
    (roasterId: string): boolean => {
      if (!selectedCountry) return true; // No country = show all
      const info = shippingByRoaster.get(roasterId);
      if (!info) return true; // Unknown = assume yes
      return info.available;
    },
    [shippingByRoaster, selectedCountry]
  );

  return {
    selectedCountry,
    selectedCountryName: selectedCountry ? getCountryName(selectedCountry) : null,
    isDetecting,
    shippingEnabled,
    supportedCountries: getSupportedCountries(),
    changeCountry,
    toggleShippingFilter,
    getShippingForRoaster,
    canShipToCountry,
    hasShippingData: roastersWithShipping && roastersWithShipping.length > 0,
  };
}
