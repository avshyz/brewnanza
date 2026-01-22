import { ReadonlyURLSearchParams } from "next/navigation";

export interface MentionRef {
  id: string;
  label: string;
}

export interface SearchFilters {
  roastedFor: "espresso" | "filter" | null;
  newOnly: boolean;
  excludedRoasters: string[];
}

export interface SearchState {
  query: string;
  coffees: MentionRef[];
  roasters: MentionRef[];
  filters: SearchFilters;
  showAll: boolean;
}

const DELIMITER = "~";

function encodeMention(ref: MentionRef): string {
  return `${ref.label}${DELIMITER}${ref.id}`;
}

function decodeMention(value: string): MentionRef | null {
  const idx = value.lastIndexOf(DELIMITER);
  if (idx === -1) return null;
  const label = value.slice(0, idx);
  const id = value.slice(idx + 1);
  if (!label || !id) return null;
  return { label, id };
}

// Parse indexed params: c, c1, c2, ... or r, r1, r2, ...
function parseIndexedParams(params: ReadonlyURLSearchParams, prefix: string): MentionRef[] {
  const results: MentionRef[] = [];

  // First param has no index
  const first = params.get(prefix);
  if (first) {
    const decoded = decodeMention(first);
    if (decoded) results.push(decoded);
  }

  // Subsequent params have index: c1, c2, c3, ...
  for (let i = 1; i <= 10; i++) {
    const value = params.get(`${prefix}${i}`);
    if (!value) break;
    const decoded = decodeMention(value);
    if (decoded) results.push(decoded);
  }

  return results;
}

// Serialize array to indexed params: c, c1, c2, ...
function serializeIndexedParams(params: URLSearchParams, prefix: string, refs: MentionRef[]) {
  refs.forEach((ref, i) => {
    const key = i === 0 ? prefix : `${prefix}${i}`;
    params.set(key, encodeMention(ref));
  });
}

export function parseSearchParams(params: ReadonlyURLSearchParams): SearchState {
  const q = params.get("q") ?? "";
  const coffees = parseIndexedParams(params, "c");
  const roasters = parseIndexedParams(params, "r");

  const forParam = params.get("for");
  const newParam = params.get("new");
  const xParam = params.get("x");
  const allParam = params.get("all");

  const roastedFor =
    forParam === "espresso" || forParam === "filter" ? forParam : null;
  const newOnly = newParam === "1";
  const excludedRoasters = xParam ? xParam.split(",").filter(Boolean) : [];
  const showAll = allParam === "1";

  return {
    query: q,
    coffees,
    roasters,
    filters: { roastedFor, newOnly, excludedRoasters },
    showAll,
  };
}

export function serializeSearchParams(state: Partial<SearchState>): string {
  const params = new URLSearchParams();

  if (state.query) {
    params.set("q", state.query);
  }
  if (state.coffees?.length) {
    serializeIndexedParams(params, "c", state.coffees);
  }
  if (state.roasters?.length) {
    serializeIndexedParams(params, "r", state.roasters);
  }
  if (state.filters?.roastedFor) {
    params.set("for", state.filters.roastedFor);
  }
  if (state.filters?.newOnly) {
    params.set("new", "1");
  }
  if (state.filters?.excludedRoasters?.length) {
    params.set("x", state.filters.excludedRoasters.join(","));
  }
  if (state.showAll) {
    params.set("all", "1");
  }

  return params.toString();
}

export function buildSearchUrl(state: Partial<SearchState>): string {
  const qs = serializeSearchParams(state);
  return qs ? `/?${qs}` : "/";
}
