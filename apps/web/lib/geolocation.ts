/**
 * Geolocation utilities for country detection.
 */

const STORAGE_KEY = "brewnanza-country";

interface GeoResponse {
  country_code?: string;
  country?: string;
}

// Country display names
const COUNTRY_NAMES: Record<string, string> = {
  IL: "Israel",
  US: "United States",
  GB: "United Kingdom",
  DE: "Germany",
  NL: "Netherlands",
  DK: "Denmark",
  SE: "Sweden",
  FR: "France",
  ES: "Spain",
  IT: "Italy",
  CA: "Canada",
  AU: "Australia",
  JP: "Japan",
  NO: "Norway",
  CH: "Switzerland",
};

/**
 * Get country name from code.
 */
export function getCountryName(code: string): string {
  return COUNTRY_NAMES[code] || code;
}

/**
 * Get all supported country codes.
 */
export function getSupportedCountries(): Array<{ code: string; name: string }> {
  return Object.entries(COUNTRY_NAMES).map(([code, name]) => ({ code, name }));
}

/**
 * Get saved country from localStorage.
 */
export function getSavedCountry(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

/**
 * Save country to localStorage.
 */
export function saveCountry(code: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, code);
}

/**
 * Detect country from IP using free API.
 * Falls back to null if detection fails.
 */
export async function detectCountry(): Promise<string | null> {
  try {
    // Try ipapi.co (free, no API key needed)
    const response = await fetch("https://ipapi.co/json/", {
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) return null;

    const data: GeoResponse = await response.json();
    return data.country_code || null;
  } catch {
    return null;
  }
}

/**
 * Get user's country - from storage, or detect via IP.
 */
export async function getUserCountry(): Promise<string | null> {
  // Check localStorage first
  const saved = getSavedCountry();
  if (saved) return saved;

  // Try to detect
  const detected = await detectCountry();
  if (detected) {
    saveCountry(detected);
    return detected;
  }

  return null;
}
