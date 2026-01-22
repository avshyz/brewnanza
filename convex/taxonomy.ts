/**
 * Coffee flavor taxonomy based on SCA Flavor Wheel + WCR Sensory Lexicon.
 * Single source of truth for categories, notes, jargon, and search helpers.
 */

// ============================================================================
// SCA FLAVOR WHEEL TAXONOMY (9 main categories expanded)
// ============================================================================

export const FLAVOR_TAXONOMY: Record<string, string[]> = {
  // === FRUITY (SCA tier 1) ===
  stone: [
    "peach", "apricot", "nectarine", "plum", "cherry", "black cherry",
    "prune", "persimmon", "stone fruit", "red plum", "yellow plum",
    "mirabelle", "wild cherry",
  ],
  citrus: [
    "orange", "blood orange", "tangerine", "mandarin", "lemon", "lime",
    "grapefruit", "bergamot", "yuzu", "citron", "pomelo", "clementine",
    "satsuma", "citrus", "meyer lemon", "pink lemonade", "lemonade",
    "marmalade", "orange zest", "lime zest", "lemon zest",
  ],
  berry: [
    "blueberry", "raspberry", "strawberry", "blackberry", "blackcurrant",
    "redcurrant", "cranberry", "gooseberry", "tayberry", "berry", "berries",
    "red berries", "dark berries", "wild berries", "red fruits", "dark fruits",
  ],
  tropical: [
    "mango", "pineapple", "papaya", "passion fruit", "guava", "lychee",
    "coconut", "banana", "kiwi", "star fruit", "dragon fruit", "tropical",
    "tropical fruit", "yellow fruit",
  ],
  dried: [
    "raisin", "date", "fig", "prune", "tamarind", "dried fruits", "fruitcake",
    "stewed fruit", "rich fruit",
  ],
  orchard: [
    "apple", "green apple", "pear", "grape", "melon", "watermelon",
    "pomegranate", "red apple", "baked apple", "ripe fruit",
  ],

  // === FLORAL (SCA tier 1) ===
  floral: [
    "jasmine", "rose", "lavender", "violet", "hibiscus", "honeysuckle",
    "geranium", "chamomile", "magnolia", "osmanthus", "orange blossom",
    "cherry blossom", "sakura", "floral", "florals", "flowers",
    "white floral", "white florals", "white flowers", "red florals",
    "plum blossom", "apple blossom",
  ],

  // === SWEET (SCA tier 1) ===
  sweet: [
    "honey", "caramel", "toffee", "fudge", "maple", "brown sugar",
    "molasses", "panela", "candy", "golden syrup", "honeycomb",
    "maple syrup", "cane sugar", "sugar cane", "white sugar",
    "bubblegum", "turkish delight", "cream soda",
  ],
  chocolate: [
    "dark chocolate", "milk chocolate", "cocoa", "cacao", "baker's chocolate",
    "chocolate liqueur", "chocolate", "chocolate mousse", "cacaonibs",
  ],

  // === NUTTY/COCOA (SCA tier 1) ===
  nutty: [
    "almond", "hazelnut", "walnut", "pistachio", "macadamia", "pecan",
    "marzipan", "praline", "nougat", "peanut butter", "brazil nut",
    "nutty", "nuts", "amaretto",
  ],

  // === SPICES (SCA tier 1) ===
  spice: [
    "cinnamon", "cardamom", "ginger", "clove", "nutmeg", "allspice",
    "star anise", "black pepper", "pink pepper", "brown spice",
    "baking spice", "spices", "gingerbread",
  ],

  // === GREEN/VEGETATIVE (SCA tier 1) ===
  herbal: [
    "lemongrass", "verbena", "eucalyptus", "mint", "basil", "thyme",
    "sage", "herbal", "lemon verbena",
  ],
  vegetal: [
    "green pepper", "bell pepper", "tomato stem", "celery", "grass",
    "hay", "straw", "vegetal",
  ],
  tea: [
    "black tea", "green tea", "oolong", "white tea", "darjeeling",
    "hojicha", "rooibos", "earl grey", "tea", "oolong tea",
  ],

  // === SOUR/FERMENTED (SCA tier 1) ===
  wine: [
    "red wine", "white wine", "brandy", "rum", "port", "sherry",
    "champagne", "wine", "hops",
  ],
  fermented: [
    "winey", "boozy", "vinegar", "yeasty", "funky", "kombucha",
    "fermented", "wild",
  ],

  // === ROASTED (SCA tier 1) ===
  roasted: [
    "malt", "grain", "toast", "tobacco", "pipe tobacco", "burnt",
    "smoky", "ash", "charred", "roasted grains",
  ],
  baked: [
    "brioche", "biscuit", "croissant", "butter cookie", "graham cracker",
    "bread", "vanilla brioche", "canelé", "grains",
  ],

  // === OTHER (SCA tier 1) ===
  creamy: [
    "cream", "butter", "custard", "vanilla", "milk", "yogurt",
    "creamy", "creme brulee", "crème brûlée", "vanilla custard",
  ],
  savory: [
    "leather", "earth", "mushroom", "umami", "soy sauce",
  ],
  defects: [
    "rubber", "medicinal", "phenolic", "papery", "musty", "moldy", "petroleum",
  ],
};

// ============================================================================
// PROCESS-FLAVOR CORRELATIONS (barista domain knowledge + research)
// ============================================================================

export const PROCESS_CORRELATIONS: Record<string, {
  boosts: string[];
  descriptors: string[];
}> = {
  natural: {
    boosts: ["berry", "tropical", "wine", "fermented", "dried"],
    descriptors: ["jammy", "winey", "funky", "boozy", "heavy body", "wild", "fruit-forward"],
  },
  washed: {
    boosts: ["citrus", "floral", "tea", "stone"],
    descriptors: ["clean", "bright", "crisp", "clarity", "light body", "sparkling", "tea-like"],
  },
  honey: {
    boosts: ["sweet", "stone", "tropical"],
    descriptors: ["syrupy", "sticky", "balanced", "medium body", "round"],
  },
  anaerobic: {
    boosts: ["tropical", "wine", "fermented", "sweet"],
    descriptors: ["funky", "boozy", "candy", "intense", "wild", "exotic"],
  },
  "carbonic maceration": {
    boosts: ["berry", "wine", "fermented"],
    descriptors: ["bubbly", "effervescent", "kirsch", "red fruit"],
  },
};

// ============================================================================
// JARGON DICTIONARY (SCA, cupping, barista slang)
// ============================================================================

export const JARGON: Record<string, {
  categories?: string[];
  processes?: string[];
  descriptors?: string[];
  negative?: boolean;
  excludeCategories?: string[];
}> = {
  // Fruit bombs
  "berry bomb": { categories: ["berry"], processes: ["natural"], descriptors: ["intense", "jammy"] },
  "fruit bomb": { categories: ["berry", "tropical", "stone"], processes: ["natural"] },
  "blueberry bomb": { categories: ["berry"], processes: ["natural"] },

  // Process-related jargon
  "funky": { categories: ["fermented"], processes: ["natural", "anaerobic"], descriptors: ["wild", "yeasty"] },
  "boozy": { categories: ["wine", "fermented"], processes: ["natural", "anaerobic"] },
  "winey": { categories: ["wine"], processes: ["natural"] },
  "jammy": { categories: ["berry", "stone"], processes: ["natural"] },

  // Clean/bright spectrum (with negative matching)
  "clean cup": { categories: ["tea"], processes: ["washed"], descriptors: ["clarity", "no defects"], excludeCategories: ["fermented"] },
  "clean": { categories: ["tea"], processes: ["washed"], descriptors: ["clarity"], excludeCategories: ["fermented"] },
  "bright": { categories: ["citrus", "stone"], processes: ["washed"], descriptors: ["acidity", "sparkling"] },
  "crisp": { categories: ["citrus", "orchard"], processes: ["washed"], descriptors: ["light", "refreshing"] },
  "sparkling": { categories: ["citrus"], processes: ["washed"], descriptors: ["effervescent", "lively"] },

  // Body descriptors
  "heavy body": { processes: ["natural"], descriptors: ["full", "syrupy"] },
  "light body": { processes: ["washed"], descriptors: ["delicate", "tea-like"] },
  "syrupy": { categories: ["sweet"], processes: ["honey", "natural"] },
  "tea-like": { categories: ["tea"], processes: ["washed"] },
  "silky": { categories: ["creamy"], descriptors: ["smooth", "elegant"] },

  // Complexity descriptors
  "complex": { categories: ["floral", "citrus", "berry", "wine"], descriptors: ["layered", "nuanced"] },
  "nuanced": { categories: ["floral", "tea", "citrus"] },
  "wild": { categories: ["fermented", "berry"], processes: ["natural"] },
  "exotic": { categories: ["tropical", "floral"], processes: ["anaerobic"] },

  // Sweetness descriptors
  "candy-like": { categories: ["sweet", "tropical"], processes: ["anaerobic"] },
  "sugary": { categories: ["sweet"] },
  "honeyed": { categories: ["sweet", "floral"] },

  // Acidity descriptors
  "juicy": { categories: ["citrus", "berry", "stone"], descriptors: ["acidity", "fruit-forward"] },
  "tangy": { categories: ["citrus", "fermented"] },
  "zesty": { categories: ["citrus"] },
  "tart": { categories: ["citrus", "berry"] },
  "sour": { categories: ["citrus", "fermented"] },

  // Origin-associated terms
  "ethiopian-style": { categories: ["berry", "floral", "wine"], processes: ["natural"] },
  "kenyan-style": { categories: ["berry", "citrus"], processes: ["washed"], descriptors: ["blackcurrant", "tomato"] },
  "colombian-style": { categories: ["citrus", "sweet", "nutty"], processes: ["washed"] },

  // Roast descriptors
  "roasty": { categories: ["roasted", "chocolate"] },
  "toasty": { categories: ["baked", "nutty"] },
  "malty": { categories: ["roasted", "sweet"] },

  // Negative/defect terms
  "defect": { categories: ["defects"], negative: true },
  "baggy": { categories: ["defects"], negative: true },
  "past crop": { categories: ["defects"], negative: true },
  "stale": { categories: ["defects"], negative: true },
};

// ============================================================================
// META-CATEGORIES (umbrella terms that expand to multiple categories)
// ============================================================================

export const META_CATEGORIES: Record<string, string[]> = {
  fruity: ["stone", "citrus", "berry", "tropical", "dried", "orchard"],
  fruit: ["stone", "citrus", "berry", "tropical", "dried", "orchard"],
  "fruit-forward": ["stone", "citrus", "berry", "tropical"],
  acidic: ["citrus", "stone", "berry"],
  "chocolate-y": ["chocolate", "sweet"],
  chocolatey: ["chocolate", "sweet"],
};

// ============================================================================
// CATEGORY ALIASES (compound terms, alternative names)
// ============================================================================

export const CATEGORY_ALIASES: Record<string, string> = {
  "stone fruit": "stone",
  "stonefruit": "stone",
  "citrus fruit": "citrus",
  "dark fruit": "dried",
  "dried fruit": "dried",
  "red fruit": "berry",
  "dark berries": "berry",
  "red berries": "berry",
  "tropical fruit": "tropical",
  "yellow fruit": "tropical",
  "white floral": "floral",
  "white flowers": "floral",
  "brown sugar": "sweet",
  "cane sugar": "sweet",
  "black tea": "tea",
  "green tea": "tea",
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export interface TaxonomyResult {
  notes: string[];
  processes: string[];
  excludeCategories: string[];
  confidence: "high" | "medium" | "none";
  matchedTerms: string[];
}

/**
 * Build a vocabulary map from notes to categories for reverse lookup.
 */
function buildNoteToCategory(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [category, notes] of Object.entries(FLAVOR_TAXONOMY)) {
    for (const note of notes) {
      map.set(note.toLowerCase(), category);
    }
  }
  return map;
}

const noteToCategory = buildNoteToCategory();

/**
 * Get the category for a specific note.
 */
export function getCategoryForNote(note: string): string | null {
  return noteToCategory.get(note.toLowerCase()) ?? null;
}

/**
 * Get all notes for a category.
 */
export function getNotesForCategory(category: string): string[] {
  return FLAVOR_TAXONOMY[category.toLowerCase()] ?? [];
}

/**
 * Resolve a category alias to its canonical form.
 * "stone fruit" → "stone"
 */
export function resolveAlias(term: string): string {
  return CATEGORY_ALIASES[term.toLowerCase()] ?? term.toLowerCase();
}

/**
 * Expand jargon term to notes and processes.
 */
export function expandJargon(term: string): {
  notes: string[];
  processes: string[];
  excludeCategories: string[];
} {
  const lower = term.toLowerCase();
  const entry = JARGON[lower];

  if (!entry) {
    return { notes: [], processes: [], excludeCategories: [] };
  }

  const notes: string[] = [];
  if (entry.categories) {
    for (const cat of entry.categories) {
      notes.push(...getNotesForCategory(cat));
    }
  }
  if (entry.descriptors) {
    notes.push(...entry.descriptors);
  }

  return {
    notes: [...new Set(notes)],
    processes: entry.processes ?? [],
    excludeCategories: entry.excludeCategories ?? [],
  };
}

/**
 * Tokenize query into terms, preserving multi-word phrases.
 * "stone fruit natural" → ["stone fruit", "natural"]
 * "berry bomb" → ["berry bomb"]
 */
function tokenizeQuery(query: string): string[] {
  const lower = query.toLowerCase().trim();
  const tokens: string[] = [];

  // Check for known multi-word phrases first (jargon, aliases)
  const multiWordPhrases = [
    ...Object.keys(JARGON),
    ...Object.keys(CATEGORY_ALIASES),
    ...Object.keys(META_CATEGORIES),
  ].filter((p) => p.includes(" "));

  let remaining = lower;
  for (const phrase of multiWordPhrases.sort((a, b) => b.length - a.length)) {
    if (remaining.includes(phrase)) {
      tokens.push(phrase);
      remaining = remaining.replace(phrase, " ").trim();
    }
  }

  // Add remaining single words
  const words = remaining.split(/\s+/).filter((w) => w.length > 0);
  tokens.push(...words);

  return tokens;
}

/**
 * Main taxonomy search function.
 * Returns notes and processes based on taxonomy lookup.
 */
export function taxonomySearch(query: string): TaxonomyResult {
  const tokens = tokenizeQuery(query);
  const allNotes: string[] = [];
  const allProcesses: string[] = [];
  const allExcludeCategories: string[] = [];
  const matchedTerms: string[] = [];
  let confidence: "high" | "medium" | "none" = "none";

  for (const token of tokens) {
    // 1. Check jargon first (highest priority)
    if (JARGON[token]) {
      const expanded = expandJargon(token);
      allNotes.push(...expanded.notes);
      allProcesses.push(...expanded.processes);
      allExcludeCategories.push(...expanded.excludeCategories);
      matchedTerms.push(token);
      confidence = "high";
      continue;
    }

    // 2. Check meta-categories ("fruity" → expand all subcats)
    if (META_CATEGORIES[token]) {
      const subcats = META_CATEGORIES[token];
      for (const subcat of subcats) {
        allNotes.push(...getNotesForCategory(subcat));
      }
      matchedTerms.push(token);
      confidence = confidence === "none" ? "high" : confidence;
      continue;
    }

    // 3. Check category aliases ("stone fruit" → "stone")
    const resolved = resolveAlias(token);
    if (resolved !== token && FLAVOR_TAXONOMY[resolved]) {
      allNotes.push(...getNotesForCategory(resolved));
      matchedTerms.push(token);
      confidence = confidence === "none" ? "high" : confidence;
      continue;
    }

    // 4. Check if token is a category name directly
    if (FLAVOR_TAXONOMY[token]) {
      allNotes.push(...getNotesForCategory(token));
      matchedTerms.push(token);
      confidence = confidence === "none" ? "high" : confidence;
      continue;
    }

    // 5. Check if token is a known note (direct match)
    const category = getCategoryForNote(token);
    if (category) {
      allNotes.push(token);
      matchedTerms.push(token);
      confidence = confidence === "none" ? "medium" : confidence;
      continue;
    }

    // 6. Check if token matches a process
    const processNames = Object.keys(PROCESS_CORRELATIONS);
    if (processNames.includes(token)) {
      allProcesses.push(token);
      // Add boosted categories for this process
      const corr = PROCESS_CORRELATIONS[token];
      if (corr) {
        for (const cat of corr.boosts) {
          allNotes.push(...getNotesForCategory(cat));
        }
      }
      matchedTerms.push(token);
      confidence = confidence === "none" ? "medium" : confidence;
      continue;
    }
  }

  return {
    notes: [...new Set(allNotes)],
    processes: [...new Set(allProcesses)],
    excludeCategories: [...new Set(allExcludeCategories)],
    confidence,
    matchedTerms,
  };
}

/**
 * Get all notes across all categories (flat list).
 */
export function getAllNotes(): string[] {
  return Object.values(FLAVOR_TAXONOMY).flat();
}

/**
 * Get all category names.
 */
export function getAllCategories(): string[] {
  return Object.keys(FLAVOR_TAXONOMY);
}
