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
  coffee: MentionRef | null;
  roaster: MentionRef | null;
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

export function parseSearchParams(params: ReadonlyURLSearchParams): SearchState {
  const q = params.get("q") ?? "";
  const cParam = params.get("c");
  const rParam = params.get("r");
  const forParam = params.get("for");
  const newParam = params.get("new");
  const xParam = params.get("x");
  const allParam = params.get("all");

  const coffee = cParam ? decodeMention(cParam) : null;
  const roaster = rParam ? decodeMention(rParam) : null;

  const roastedFor =
    forParam === "espresso" || forParam === "filter" ? forParam : null;
  const newOnly = newParam === "1";
  const excludedRoasters = xParam ? xParam.split(",").filter(Boolean) : [];
  const showAll = allParam === "1";

  return {
    query: q,
    coffee,
    roaster,
    filters: { roastedFor, newOnly, excludedRoasters },
    showAll,
  };
}

export function serializeSearchParams(state: Partial<SearchState>): string {
  const params = new URLSearchParams();

  if (state.query) {
    params.set("q", state.query);
  }
  if (state.coffee) {
    params.set("c", encodeMention(state.coffee));
  }
  if (state.roaster) {
    params.set("r", encodeMention(state.roaster));
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
