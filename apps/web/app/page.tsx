"use client";

import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useCallback, startTransition, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CoffeeCard } from "../components/CoffeeCard";
import { Button } from "../components/ui/button";
import { FilterChip } from "../components/ui/filter-chip";
import { EspressoIcon, FilterIcon, DecafIcon } from "../components/icons";
import { Id } from "../../../convex/_generated/dataModel";
import { SearchInput, SearchInputHandle } from "../components/SearchInput";
import { parseSearchParams, buildSearchUrl, SearchState, MentionRef } from "../lib/search-params";
import { useRef } from "react";


interface SearchResult {
  _id: Id<"coffees">;
  name: string;
  roasterId: string;
  url: string;
  notes: string[];
  process: string[];
  protocol: string[];
  country: string[];
  region: string[];
  variety: string[];
  roastLevel?: string | null;
  roastedFor?: string | null;
  _creationTime: number;
  prices: Array<{
    price: number;
    currency: string;
    weightGrams: number;
    priceUsd: number | null;
    available: boolean;
  }>;
  available: boolean;
  imageUrl: string | null;
  matchedAttributes: string[];
  score: number;
}

export default function Home() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const searchAction = useAction(api.search.search);

  // Parse URL state
  const urlState = useMemo(() => parseSearchParams(searchParams), [searchParams]);
  const hasUrlSearch = !!(urlState.query || urlState.coffee || urlState.roaster || urlState.showAll);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // UI-only state (localStorage)
  const [groupByRoaster, setGroupByRoaster] = useState(false);
  const [showRoasterToggle, setShowRoasterToggle] = useState(false);
  const [decafOnly, setDecafOnly] = useState(false);
  const [knownRoasters, setKnownRoasters] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("brewnanza-ui");
      return saved ? JSON.parse(saved).knownRoasters ?? [] : [];
    } catch { return []; }
  });

  // Persist UI state to localStorage
  useEffect(() => {
    localStorage.setItem("brewnanza-ui", JSON.stringify({ knownRoasters }));
  }, [knownRoasters]);

  const searchInputRef = useRef<SearchInputHandle>(null);

  // Execute search when URL changes
  useEffect(() => {
    console.log("[URL State]", { hasUrlSearch, urlState });

    if (!hasUrlSearch) {
      setResults([]);
      return;
    }

    const executeSearch = async () => {
      const searchParams = {
        query: urlState.query.trim(),
        coffeeId: urlState.coffee?.id as Id<"coffees"> | undefined,
        roasterId: urlState.roaster?.id,
        limit: urlState.showAll ? 200 : 50,
        roastedFor: urlState.filters.roastedFor ?? undefined,
        newOnly: urlState.filters.newOnly || undefined,
        excludeRoasters: urlState.filters.excludedRoasters.length > 0
          ? urlState.filters.excludedRoasters
          : undefined,
      };
      console.log("[Search Params]", searchParams);

      setIsSearching(true);
      try {
        const response = await searchAction(searchParams);
        console.log("[Search Debug]", response.debug);
        console.log("[Search Results]", response.results?.length);
        setResults(response.results ?? []);
      } catch (error) {
        console.error("Search failed:", error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    executeSearch();
  }, [searchAction, hasUrlSearch, urlState.query, urlState.coffee?.id, urlState.roaster?.id, urlState.showAll, urlState.filters.roastedFor, urlState.filters.newOnly, urlState.filters.excludedRoasters.join(",")]);

  // Navigation helpers
  const navigateSearch = useCallback((
    query: string,
    coffee: MentionRef | null,
    roaster: MentionRef | null,
    method: "push" | "replace" = "push"
  ) => {
    const url = buildSearchUrl({
      query: query || undefined,
      coffee: coffee ?? undefined,
      roaster: roaster ?? undefined,
      filters: urlState.filters,
      showAll: false,
    });
    router[method](url);
  }, [router, urlState.filters]);

  const updateFilters = useCallback((updates: Partial<SearchState["filters"]>) => {
    const newFilters = { ...urlState.filters, ...updates };
    const url = buildSearchUrl({
      query: urlState.query || undefined,
      coffee: urlState.coffee ?? undefined,
      roaster: urlState.roaster ?? undefined,
      filters: newFilters,
      showAll: urlState.showAll,
    });
    router.replace(url);
  }, [router, urlState]);

  // Search on submit (Enter key)
  const handleSearch = useCallback((text: string, coffeeId?: string, roasterId?: string) => {
    // Get labels from search input ref if available
    const coffeeLabel = searchInputRef.current?.getCoffeeLabel?.();
    const roasterLabel = searchInputRef.current?.getRoasterLabel?.();

    const coffee = coffeeId ? { id: coffeeId, label: coffeeLabel ?? coffeeId } : null;
    const roaster = roasterId ? { id: roasterId, label: roasterLabel ?? roasterId } : null;

    if (!text.trim() && !coffee && !roaster) {
      router.push("/");
      return;
    }
    navigateSearch(text, coffee, roaster);
  }, [navigateSearch, router]);

  // Clear search
  const handleClear = useCallback(() => {
    searchInputRef.current?.clear();
    router.push("/");
    searchInputRef.current?.focus();
  }, [router]);

  // Show all coffees
  const handleShowAll = useCallback(() => {
    const url = buildSearchUrl({
      filters: urlState.filters,
      showAll: true,
    });
    router.push(url);
  }, [router, urlState.filters]);

  // Filter handlers
  const handleRoastedForFilter = useCallback((value: "espresso" | "filter" | null) => {
    startTransition(() => {
      updateFilters({ roastedFor: value });
    });
  }, [updateFilters]);

  const handleNewToggle = useCallback(() => {
    startTransition(() => {
      updateFilters({ newOnly: !urlState.filters.newOnly });
    });
  }, [updateFilters, urlState.filters.newOnly]);

  const handleDecafToggle = useCallback(() => {
    startTransition(() => {
      setDecafOnly(prev => !prev);
    });
  }, []);

  const handleGroupToggle = useCallback(() => {
    startTransition(() => {
      setGroupByRoaster(prev => !prev);
    });
  }, []);

  const handleExcludeRoaster = useCallback((roasterId: string) => {
    const current = urlState.filters.excludedRoasters;
    const newExcluded = current.includes(roasterId)
      ? current.filter(r => r !== roasterId)
      : [...current, roasterId];
    updateFilters({ excludedRoasters: newExcluded });
  }, [updateFilters, urlState.filters.excludedRoasters]);

  // Group results by roaster
  const groupedByRoaster = useMemo(() => {
    const grouped = new Map<string, SearchResult[]>();
    for (const coffee of results) {
      const existing = grouped.get(coffee.roasterId) || [];
      existing.push(coffee);
      grouped.set(coffee.roasterId, existing);
    }
    return grouped;
  }, [results]);

  // Roasters present in current results
  const currentRoasters = useMemo(
    () => Array.from(groupedByRoaster.keys()),
    [groupedByRoaster]
  );

  // Track roasters we've seen across searches
  const knownRoastersSet = useMemo(() => new Set(knownRoasters), [knownRoasters]);
  const currentRoastersKey = currentRoasters.join(",");
  useEffect(() => {
    const newRoasters = currentRoasters.filter(r => !knownRoastersSet.has(r));
    if (newRoasters.length > 0) {
      setKnownRoasters(prev => [...prev, ...newRoasters].sort());
    }
  }, [currentRoastersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Combine current + known roasters for filter dropdown
  const availableRoasters = useMemo(() => {
    const all = new Set([...currentRoasters, ...knownRoasters]);
    return Array.from(all).sort();
  }, [currentRoasters, knownRoasters]);

  // Landing view (no search yet)
  if (!hasUrlSearch) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-8">
        <h1 className="main-title text-7xl font-black mb-2 tracking-tighter uppercase">
          Brewnanza
        </h1>
        <p className="text-xl text-text-muted mb-12 font-bold uppercase tracking-wide">
          find your next godshot
        </p>
        <div className="w-full max-w-[600px]">
          <SearchInput
            ref={searchInputRef}
            placeholder="berry bomb, @coffee, #roaster..."
            onSubmit={handleSearch}
            autoFocus
          />
          <div className="mt-4 flex justify-center">
            <Button onClick={handleShowAll} disabled={isSearching}>
              {isSearching ? "Loading..." : "Show all"}
            </Button>
          </div>
        </div>
      </main>
    );
  }

  // Results view
  return (
    <main className="max-w-[1600px] mx-auto px-4 pt-0 overflow-x-hidden">
      <header className="results-header sticky top-0 bg-background py-4 z-10 border-b-3 border-border mb-6">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <h1 className="main-title text-2xl font-black uppercase tracking-tight">
            Brewnanza
          </h1>
          <div className="flex-1 max-w-[400px]">
            <SearchInput
              key={searchParams.toString()}
              ref={searchInputRef}
              placeholder="Search..."
              onSubmit={handleSearch}
              initialQuery={urlState.query}
              initialCoffee={urlState.coffee ?? undefined}
              initialRoaster={urlState.roaster ?? undefined}
            />
          </div>
          <Button onClick={handleClear}>Clear</Button>
          <Button
            variant={groupByRoaster ? "primary" : "default"}
            onClick={handleGroupToggle}
          >
            {groupByRoaster ? "Ungrouped" : "By Roaster"}
          </Button>
        </div>

        {/* Filter chips */}
        <div className="flex justify-between items-start gap-4">
          <div className="flex gap-1.5 flex-wrap items-center">
            <FilterChip
              active={urlState.filters.roastedFor === "espresso"}
              onClick={() => handleRoastedForFilter(urlState.filters.roastedFor === "espresso" ? null : "espresso")}
            >
              <EspressoIcon className="w-3 h-3" />
              Espresso
            </FilterChip>
            <FilterChip
              active={urlState.filters.roastedFor === "filter"}
              onClick={() => handleRoastedForFilter(urlState.filters.roastedFor === "filter" ? null : "filter")}
            >
              <FilterIcon className="w-3 h-3" />
              Filter
            </FilterChip>
            <FilterChip
              active={decafOnly}
              onClick={handleDecafToggle}
            >
              <DecafIcon className="w-3 h-3" />
              Decaf
            </FilterChip>
            <FilterChip
              active={urlState.filters.newOnly}
              onClick={handleNewToggle}
            >
              🆕 New
            </FilterChip>
          </div>

          {/* Roaster toggle button */}
          <div className="relative">
            <Button
              variant={urlState.filters.excludedRoasters.length > 0 ? "primary" : "default"}
              onClick={() => setShowRoasterToggle(!showRoasterToggle)}
            >
              🏪 Roasters {urlState.filters.excludedRoasters.length > 0 && `(${urlState.filters.excludedRoasters.length} hidden)`}
            </Button>

            {/* Roaster toggle dropdown */}
            {showRoasterToggle && (
              <div className="absolute right-0 top-full mt-2 bg-surface border-3 border-border brutal-shadow-sm p-2 z-50 max-h-64 overflow-y-auto min-w-48">
                {availableRoasters.map((roasterId) => (
                  <label
                    key={roasterId}
                    className="flex items-center gap-2 px-2 py-1 hover:bg-surface-hover cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={!urlState.filters.excludedRoasters.includes(roasterId)}
                      onChange={() => handleExcludeRoaster(roasterId)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-bold uppercase">{roasterId}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="mt-2 text-sm text-text-muted font-bold uppercase tracking-wide">
          {isSearching ? "Searching..." : `${results.length} results`}
        </p>
      </header>

      {results.length === 0 ? (
        <div className="bg-surface border-3 border-border text-center p-8 brutal-shadow">
          <p className="font-bold uppercase">
            {isSearching ? "Searching..." : "No coffees found. Try a different search."}
          </p>
        </div>
      ) : groupByRoaster ? (
        <div className="flex flex-col gap-8 pb-8">
          {Array.from(groupedByRoaster.entries()).map(([roasterId, roasterCoffees]) => (
            <section key={roasterId}>
              <h2 className="text-xl font-black mb-4 uppercase border-b-3 border-border pb-2">
                {roasterId} <span className="text-text-muted font-bold">({roasterCoffees.length})</span>
              </h2>
              <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {roasterCoffees.map((coffee) => (
                  <CoffeeCard key={coffee._id} coffee={coffee} showRoaster={false} matchedAttributes={coffee.matchedAttributes} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 pb-8">
          {results.map((coffee) => (
            <CoffeeCard key={coffee._id} coffee={coffee} matchedAttributes={coffee.matchedAttributes} />
          ))}
        </div>
      )}
    </main>
  );
}
