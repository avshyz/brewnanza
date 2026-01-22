"use client";

import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useRef, useCallback, startTransition, useEffect, useMemo } from "react";
import { CoffeeCard } from "../components/CoffeeCard";
import { Button } from "../components/ui/button";
import { FilterChip } from "../components/ui/filter-chip";
import { EspressoIcon, FilterIcon, DecafIcon } from "../components/icons";
import { Id } from "../../../convex/_generated/dataModel";
import { SearchInput, SearchInputHandle } from "../components/SearchInput";


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
  const searchAction = useAction(api.search.search);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [groupByRoaster, setGroupByRoaster] = useState(false);
  const [roastedForFilter, setRoastedForFilter] = useState<"espresso" | "filter" | null>(null);
  const [decafOnly, setDecafOnly] = useState(false);
  const [newOnly, setNewOnly] = useState(false);
  const [excludedRoasters, setExcludedRoasters] = useState<string[]>([]);
  const [showRoasterToggle, setShowRoasterToggle] = useState(false);
  const [knownRoasters, setKnownRoasters] = useState<string[]>([]);

  // Load filters from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("brewnanza-filters");
    if (saved) {
      try {
        const filters = JSON.parse(saved);
        if (filters.roastedFor) setRoastedForFilter(filters.roastedFor);
        if (filters.newOnly) setNewOnly(filters.newOnly);
        if (filters.excludedRoasters) setExcludedRoasters(filters.excludedRoasters);
        if (filters.knownRoasters) setKnownRoasters(filters.knownRoasters);
      } catch (e) {
        console.error("Failed to parse saved filters", e);
      }
    }
  }, []);

  // Save filters to localStorage when they change
  useEffect(() => {
    localStorage.setItem("brewnanza-filters", JSON.stringify({
      roastedFor: roastedForFilter,
      newOnly,
      excludedRoasters,
      knownRoasters,
    }));
  }, [roastedForFilter, newOnly, excludedRoasters, knownRoasters]);

  // Track last search params to re-run search when filters change
  const lastSearchRef = useRef<{ text: string; coffeeId?: string; roasterId?: string } | null>(null);

  const searchInputRef = useRef<SearchInputHandle>(null);

  // Search on submit (Enter key)
  const handleSearch = useCallback(async (text: string, coffeeId?: string, roasterId?: string) => {
    if (!text.trim() && !coffeeId && !roasterId) {
      setResults([]);
      setHasSearched(false);
      lastSearchRef.current = null;
      return;
    }

    // Store search params for re-running when filters change
    lastSearchRef.current = { text, coffeeId, roasterId };

    setIsSearching(true);
    try {
      const response = await searchAction({
        query: text.trim(),
        coffeeId: coffeeId as Id<"coffees"> | undefined,
        roasterId,
        limit: 50,
        roastedFor: roastedForFilter ?? undefined,
        newOnly: newOnly || undefined,
        excludeRoasters: excludedRoasters.length > 0 ? excludedRoasters : undefined,
      });
      console.log("[Search Debug]", response.debug);
      setResults(response.results ?? []);
      setHasSearched(true);
    } catch (error) {
      console.error("Search failed:", error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchAction, roastedForFilter, newOnly, excludedRoasters]);

  // Clear search
  const handleClear = useCallback(() => {
    searchInputRef.current?.clear();
    setResults([]);
    setHasSearched(false);
    searchInputRef.current?.focus();
  }, []);

  // Show all coffees
  const handleShowAll = useCallback(async () => {
    setIsSearching(true);
    lastSearchRef.current = { text: "" };
    try {
      const response = await searchAction({
        query: "",
        limit: 200,
        roastedFor: roastedForFilter ?? undefined,
        newOnly: newOnly || undefined,
        excludeRoasters: excludedRoasters.length > 0 ? excludedRoasters : undefined,
      });
      setResults(response.results ?? []);
      setHasSearched(true);
    } catch (error) {
      console.error("Show all failed:", error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchAction, roastedForFilter, newOnly, excludedRoasters]);

  // Re-run search when filters change
  useEffect(() => {
    if (lastSearchRef.current) {
      const { text, coffeeId, roasterId } = lastSearchRef.current;
      // Handle "show all" case (empty text)
      if (!text && !coffeeId && !roasterId) {
        handleShowAll();
      } else {
        handleSearch(text, coffeeId, roasterId);
      }
    }
  }, [roastedForFilter, newOnly, excludedRoasters, handleSearch, handleShowAll]);

  // Results are already filtered on backend
  const filteredResults = results ?? [];

  // Group by roaster
  const groupedByRoaster = new Map<string, typeof filteredResults>();
  for (const coffee of filteredResults) {
    const existing = groupedByRoaster.get(coffee.roasterId) || [];
    existing.push(coffee);
    groupedByRoaster.set(coffee.roasterId, existing);
  }

  // Track roasters from current results
  const currentRoasters = Array.from(groupedByRoaster.keys());

  // Update known roasters when we see new ones
  useEffect(() => {
    const newRoasters = currentRoasters.filter(r => !knownRoasters.includes(r));
    if (newRoasters.length > 0) {
      setKnownRoasters(prev => [...prev, ...newRoasters].sort());
    }
  }, [currentRoasters.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Available roasters: combine current results with known roasters (so excluded ones still appear)
  const availableRoasters = useMemo(() => {
    const all = new Set([...currentRoasters, ...knownRoasters]);
    return Array.from(all).sort();
  }, [currentRoasters, knownRoasters]);

  const handleRoastedForFilter = useCallback((value: "espresso" | "filter" | null) => {
    startTransition(() => {
      setRoastedForFilter(value);
    });
  }, []);

  const handleNewToggle = useCallback(() => {
    startTransition(() => {
      setNewOnly((prev) => !prev);
    });
  }, []);

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

  // Landing view (no search yet)
  if (!hasSearched) {
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
              ref={searchInputRef}
              placeholder="Search..."
              onSubmit={handleSearch}
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
              active={roastedForFilter === "espresso"}
              onClick={() => handleRoastedForFilter(roastedForFilter === "espresso" ? null : "espresso")}
            >
              <EspressoIcon className="w-3 h-3" />
              Espresso
            </FilterChip>
            <FilterChip
              active={roastedForFilter === "filter"}
              onClick={() => handleRoastedForFilter(roastedForFilter === "filter" ? null : "filter")}
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
              active={newOnly}
              onClick={handleNewToggle}
            >
              🆕 New
            </FilterChip>
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
                      onChange={() => {
                        setExcludedRoasters((prev) =>
                          prev.includes(roasterId)
                            ? prev.filter((r) => r !== roasterId)
                            : [...prev, roasterId]
                        );
                      }}
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
          {isSearching ? "Searching..." : `${filteredResults.length} results`}
        </p>
      </header>

      {filteredResults.length === 0 ? (
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
          {filteredResults.map((coffee) => (
            <CoffeeCard key={coffee._id} coffee={coffee} matchedAttributes={coffee.matchedAttributes} />
          ))}
        </div>
      )}
    </main>
  );
}
