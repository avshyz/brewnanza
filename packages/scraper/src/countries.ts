/**
 * Country and region normalization.
 * Ported from Python's countries.py (using pycountry -> static lookup)
 */

// Aliases for non-English names and common variants
const COUNTRY_ALIASES: Record<string, string> = {
  // French
  ethiopie: "Ethiopia",
  éthiopie: "Ethiopia",
  brésil: "Brazil",
  bresil: "Brazil",
  colombie: "Colombia",
  tanzanie: "Tanzania",
  indonésie: "Indonesia",
  indonesie: "Indonesia",
  // Regional names (islands/regions commonly used as origins)
  sumatra: "Indonesia",
  java: "Indonesia",
  sulawesi: "Indonesia",
  flores: "Indonesia",
  bali: "Indonesia",
  hawaii: "United States",
  "papua new guinea": "Papua New Guinea",
  congo: "Democratic Republic of the Congo",
};

// Common country name variations to official names
const COUNTRY_NAMES: Record<string, string> = {
  ethiopia: "Ethiopia",
  colombia: "Colombia",
  brazil: "Brazil",
  kenya: "Kenya",
  rwanda: "Rwanda",
  burundi: "Burundi",
  guatemala: "Guatemala",
  "costa rica": "Costa Rica",
  honduras: "Honduras",
  peru: "Peru",
  panama: "Panama",
  nicaragua: "Nicaragua",
  "el salvador": "El Salvador",
  mexico: "Mexico",
  indonesia: "Indonesia",
  yemen: "Yemen",
  tanzania: "Tanzania",
  uganda: "Uganda",
  bolivia: "Bolivia",
  ecuador: "Ecuador",
  thailand: "Thailand",
  china: "China",
  taiwan: "Taiwan",
  vietnam: "Vietnam",
  india: "India",
  "united states": "United States",
  usa: "United States",
  jamaica: "Jamaica",
  haiti: "Haiti",
  "dominican republic": "Dominican Republic",
  myanmar: "Myanmar",
  laos: "Laos",
  philippines: "Philippines",
  "papua new guinea": "Papua New Guinea",
};

// Regions that should be mapped to countries
const REGION_TO_COUNTRY: Record<string, string> = {
  // Colombia
  huila: "Colombia",
  nariño: "Colombia",
  cauca: "Colombia",
  tolima: "Colombia",
  santander: "Colombia",
  antioquia: "Colombia",
  quindío: "Colombia",
  // Panama
  boquete: "Panama",
  chiriquí: "Panama",
  chiriqui: "Panama",
  volcán: "Panama",
  // Ethiopia
  yirgacheffe: "Ethiopia",
  sidamo: "Ethiopia",
  sidama: "Ethiopia",
  guji: "Ethiopia",
  gedeo: "Ethiopia",
  gedeb: "Ethiopia",
  bombe: "Ethiopia",
  bensa: "Ethiopia",
  limu: "Ethiopia",
  jimma: "Ethiopia",
  harrar: "Ethiopia",
  "bench maji": "Ethiopia",
  "west omo": "Ethiopia",
  // Kenya
  nyeri: "Kenya",
  kirinyaga: "Kenya",
  embu: "Kenya",
  kiambu: "Kenya",
  muranga: "Kenya",
  // Indonesia
  aceh: "Indonesia",
  gayo: "Indonesia",
  toraja: "Indonesia",
  // Costa Rica
  tarrazú: "Costa Rica",
  tarrazu: "Costa Rica",
  "west valley": "Costa Rica",
  "central valley": "Costa Rica",
  // Guatemala
  antigua: "Guatemala",
  huehuetenango: "Guatemala",
  atitlán: "Guatemala",
  cobán: "Guatemala",
  acatenango: "Guatemala",
  // Brazil
  "minas gerais": "Brazil",
  cerrado: "Brazil",
  "sul de minas": "Brazil",
  mogiana: "Brazil",
  // Rwanda
  nyamasheke: "Rwanda",
  rulindo: "Rwanda",
  gakenke: "Rwanda",
  // Burundi
  kayanza: "Burundi",
  ngozi: "Burundi",
  // Mexico
  chiapas: "Mexico",
  oaxaca: "Mexico",
  veracruz: "Mexico",
  // Peru
  cajamarca: "Peru",
  "san ignacio": "Peru",
  jaén: "Peru",
  // Tanzania
  kilimanjaro: "Tanzania",
  arusha: "Tanzania",
  mbeya: "Tanzania",
  // Yemen
  haraz: "Yemen",
  "bani matar": "Yemen",
  sanani: "Yemen",
  mattari: "Yemen",
  ismaili: "Yemen",
  udaini: "Yemen",
  hayma: "Yemen",
  // Thailand
  "chiang mai": "Thailand",
  "chiang rai": "Thailand",
  "doi chang": "Thailand",
  "mae hong son": "Thailand",
  // Taiwan
  alishan: "Taiwan",
  nantou: "Taiwan",
  tainan: "Taiwan",
  yunlin: "Taiwan",
  // China
  yunnan: "China",
  "pu'er": "China",
  baoshan: "China",
  // Uganda
  "mount elgon": "Uganda",
  rwenzori: "Uganda",
  bugisu: "Uganda",
  sipi: "Uganda",
  // Honduras
  copán: "Honduras",
  marcala: "Honduras",
  "santa barbara": "Honduras",
  comayagua: "Honduras",
  // El Salvador
  "santa ana": "El Salvador",
  apaneca: "El Salvador",
  chalatenango: "El Salvador",
  // Dominican Republic
  "santo domingo": "Dominican Republic",
  jarabacoa: "Dominican Republic",
};

const KNOWN_REGIONS_SET = new Set(Object.keys(REGION_TO_COUNTRY));

// SKU prefix -> country mapping
const SKU_COUNTRY_MAP: Record<string, string> = {
  PAN: "Panama",
  COL: "Colombia",
  BRA: "Brazil",
  ETH: "Ethiopia",
  KEN: "Kenya",
  RWA: "Rwanda",
  GUA: "Guatemala",
  COS: "Costa Rica",
  HON: "Honduras",
  PER: "Peru",
  NIC: "Nicaragua",
  SAL: "El Salvador",
  MEX: "Mexico",
  IND: "Indonesia",
  YEM: "Yemen",
  BUR: "Burundi",
  TAN: "Tanzania",
  UGA: "Uganda",
  BOL: "Bolivia",
  ECU: "Ecuador",
};

// Title-cased known regions array
export const KNOWN_REGIONS: string[] = Object.keys(REGION_TO_COUNTRY).map((r) =>
  r.includes(" ")
    ? r
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : r.charAt(0).toUpperCase() + r.slice(1)
);

const normalizeCache = new Map<string, string | null>();

/**
 * Normalize a country name to its official English name.
 */
export function normalizeCountry(name: string | null | undefined): string | null {
  if (!name) return null;

  const key = name.trim().toLowerCase();
  if (key.length < 3) return null;

  if (normalizeCache.has(key)) {
    return normalizeCache.get(key) ?? null;
  }

  // Check aliases first
  if (key in COUNTRY_ALIASES) {
    const result = COUNTRY_ALIASES[key];
    normalizeCache.set(key, result);
    return result;
  }

  // Check country names
  if (key in COUNTRY_NAMES) {
    const result = COUNTRY_NAMES[key];
    normalizeCache.set(key, result);
    return result;
  }

  normalizeCache.set(key, null);
  return null;
}

const regionCache = new Map<string, string | null>();

/**
 * Get the country for a known coffee-growing region.
 */
export function countryFromRegion(region: string | null | undefined): string | null {
  if (!region) return null;

  const key = region.trim().toLowerCase();

  if (regionCache.has(key)) {
    return regionCache.get(key) ?? null;
  }

  const result = REGION_TO_COUNTRY[key] ?? null;
  regionCache.set(key, result);
  return result;
}

/** Check if a name is a known coffee region (not a country) */
export function isKnownRegion(name: string | null | undefined): boolean {
  if (!name) return false;
  return KNOWN_REGIONS_SET.has(name.trim().toLowerCase());
}

/** Check if a name is a valid country */
export function isValidCountry(name: string | null | undefined): boolean {
  return normalizeCountry(name) !== null;
}

/** Extract country from SKU prefix (e.g., 'PAN-ELIDA' -> 'Panama') */
export function countryFromSku(sku: string | null | undefined): string | null {
  if (!sku || !sku.includes("-")) return null;
  return SKU_COUNTRY_MAP[sku.split("-")[0].toUpperCase()] ?? null;
}
