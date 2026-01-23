"use client";

import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useCallback, startTransition, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CoffeeCard } from "../components/CoffeeCard";
import { Button } from "../components/ui/button";
import { FilterChip } from "../components/ui/filter-chip";
import { EspressoIcon, FilterIcon, DecafIcon, ShippingIcon } from "../components/icons";
import { useShipping } from "../lib/useShipping";
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
  const hasUrlSearch = !!(urlState.query || urlState.coffees.length > 0 || urlState.roasters.length > 0 || urlState.showAll);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // UI-only state (localStorage)
  const [groupByRoaster, setGroupByRoaster] = useState(false);
  const [showRoasterToggle, setShowRoasterToggle] = useState(false);
  const [showCountrySelector, setShowCountrySelector] = useState(false);
  const [decafOnly, setDecafOnly] = useState(false);
  const [excludedRoasters, setExcludedRoasters] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("brewnanza-ui");
      return saved ? JSON.parse(saved).excludedRoasters ?? [] : [];
    } catch { return []; }
  });
  const [knownRoasters, setKnownRoasters] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("brewnanza-ui");
      return saved ? JSON.parse(saved).knownRoasters ?? [] : [];
    } catch { return []; }
  });

  // Persist UI state to localStorage
  useEffect(() => {
    localStorage.setItem("brewnanza-ui", JSON.stringify({ knownRoasters, excludedRoasters }));
  }, [knownRoasters, excludedRoasters]);

  const searchInputRef = useRef<SearchInputHandle>(null);

  // Shipping filter state
  const {
    selectedCountry,
    selectedCountryName,
    shippingEnabled,
    supportedCountries,
    changeCountry,
    toggleShippingFilter,
    getShippingForRoaster,
    canShipToCountry,
  } = useShipping();

  // Derive coffee/roaster IDs for dependency tracking
  const coffeeIds = urlState.coffees.map(c => c.id).join(",");
  const roasterIds = urlState.roasters.map(r => r.id).join(",");

  // Execute search when URL changes
  useEffect(() => {
    if (!hasUrlSearch) {
      setResults([]);
      return;
    }

    const executeSearch = async () => {
      setIsSearching(true);
      try {
        const response = await searchAction({
          query: urlState.query.trim(),
          coffeeIds: urlState.coffees.length > 0
            ? urlState.coffees.map(c => c.id) as Id<"coffees">[]
            : undefined,
          roasterIds: urlState.roasters.length > 0
            ? urlState.roasters.map(r => r.id)
            : undefined,
          limit: urlState.showAll ? 200 : 50,
          roastedFor: urlState.filters.roastedFor ?? undefined,
          newOnly: urlState.filters.newOnly || undefined,
          excludeRoasters: excludedRoasters.length > 0 ? excludedRoasters : undefined,
        });
        setResults(response.results ?? []);
      } catch (error) {
        console.error("Search failed:", error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    executeSearch();
  }, [searchAction, hasUrlSearch, urlState.query, coffeeIds, roasterIds, urlState.showAll, urlState.filters.roastedFor, urlState.filters.newOnly, excludedRoasters]);

  // Navigation helpers
  const navigateSearch = useCallback((
    query: string,
    coffees: MentionRef[],
    roasters: MentionRef[],
    method: "push" | "replace" = "push"
  ) => {
    const url = buildSearchUrl({
      query: query || undefined,
      coffees,
      roasters,
      filters: urlState.filters,
      showAll: false,
    });
    router[method](url);
  }, [router, urlState.filters]);

  const updateFilters = useCallback((updates: Partial<SearchState["filters"]>) => {
    const newFilters = { ...urlState.filters, ...updates };
    const url = buildSearchUrl({
      query: urlState.query || undefined,
      coffees: urlState.coffees,
      roasters: urlState.roasters,
      filters: newFilters,
      showAll: urlState.showAll,
    });
    router.replace(url);
  }, [router, urlState]);

  // Search on submit (Enter key)
  const handleSearch = useCallback((text: string, coffees: MentionRef[], roasters: MentionRef[]) => {
    if (!text.trim() && coffees.length === 0 && roasters.length === 0) {
      router.push("/");
      return;
    }
    navigateSearch(text, coffees, roasters);
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
    setExcludedRoasters(prev =>
      prev.includes(roasterId)
        ? prev.filter(r => r !== roasterId)
        : [...prev, roasterId]
    );
  }, []);

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

  // Filter results by shipping availability
  const filteredResults = useMemo(() => {
    if (!shippingEnabled || !selectedCountry) return results;
    return results.filter((coffee) => canShipToCountry(coffee.roasterId));
  }, [results, shippingEnabled, selectedCountry, canShipToCountry]);

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
              initialCoffees={urlState.coffees}
              initialRoasters={urlState.roasters}
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
            {/* Shipping filter */}
            {selectedCountry && (
              <FilterChip
                active={shippingEnabled}
                onClick={toggleShippingFilter}
              >
                <ShippingIcon className="w-3 h-3" />
                Ships to {selectedCountryName}
              </FilterChip>
            )}
          </div>

          <div className="flex gap-2">
            {/* Country selector */}
            <div className="relative">
              <Button
                variant={selectedCountry ? "default" : "default"}
                onClick={() => setShowCountrySelector(!showCountrySelector)}
              >
                🌍 {selectedCountryName || "Select country"}
              </Button>

              {showCountrySelector && (
                <div className="absolute right-0 top-full mt-2 bg-surface border-3 border-border brutal-shadow-sm p-2 z-50 max-h-64 overflow-y-auto min-w-48">
                  {supportedCountries.map((country) => (
                    <button
                      key={country.code}
                      className="w-full text-left px-2 py-1 hover:bg-surface-hover cursor-pointer text-sm font-bold uppercase"
                      onClick={() => {
                        changeCountry(country.code);
                        setShowCountrySelector(false);
                      }}
                    >
                      {selectedCountry === country.code ? "✓ " : ""}{country.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Roaster toggle button */}
            <div className="relative">
              <Button
                variant={excludedRoasters.length > 0 ? "primary" : "default"}
                onClick={() => setShowRoasterToggle(!showRoasterToggle)}
              >
                🏪 Roasters {excludedRoasters.length > 0 && `(${excludedRoasters.length} hidden)`}
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
                        checked={!excludedRoasters.includes(roasterId)}
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
        </div>

        <p className="mt-2 text-sm text-text-muted font-bold uppercase tracking-wide">
          {isSearching ? "Searching..." : `${filteredResults.length} results`}
          {shippingEnabled && filteredResults.length < results.length && (
            <span className="ml-2">({results.length - filteredResults.length} hidden by shipping)</span>
          )}
        </p>
      </header>

      {filteredResults.length === 0 ? (
        <div className="bg-surface border-3 border-border text-center p-8 brutal-shadow">
          <p className="font-bold uppercase">
            {isSearching ? "Searching..." : shippingEnabled ? "No coffees ship to your location. Try disabling the shipping filter." : "No coffees found. Try a different search."}
          </p>
        </div>
      ) : groupByRoaster ? (
        <div className="flex flex-col gap-8 pb-8">
          {Array.from(new Map(filteredResults.map(c => [c.roasterId, c])).keys()).map((roasterId) => {
            const roasterCoffees = filteredResults.filter(c => c.roasterId === roasterId);
            const shippingInfo = selectedCountry ? getShippingForRoaster(roasterId) : null;
            return (
              <section key={roasterId}>
                <h2 className="text-xl font-black mb-4 uppercase border-b-3 border-border pb-2">
                  {roasterId} <span className="text-text-muted font-bold">({roasterCoffees.length})</span>
                  {shippingInfo && shippingInfo.available && shippingInfo.priceUsd && (
                    <span className="ml-2 text-sm text-green-700">📦 ${shippingInfo.priceUsd.toFixed(0)} shipping</span>
                  )}
                </h2>
                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {roasterCoffees.map((coffee) => (
                    <CoffeeCard
                      key={coffee._id}
                      coffee={coffee}
                      showRoaster={false}
                      matchedAttributes={coffee.matchedAttributes}
                      shippingInfo={shippingInfo}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 pb-8">
          {filteredResults.map((coffee) => (
            <CoffeeCard
              key={coffee._id}
              coffee={coffee}
              matchedAttributes={coffee.matchedAttributes}
              shippingInfo={selectedCountry ? getShippingForRoaster(coffee.roasterId) : null}
            />
          ))}
        </div>
      )}
    </main>
  );
}
