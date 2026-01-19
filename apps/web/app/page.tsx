"use client";

import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useRef, useCallback, startTransition } from "react";
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

  const searchInputRef = useRef<SearchInputHandle>(null);

  // Search on submit (Enter key)
  const handleSearch = useCallback(async (text: string, coffeeId?: string, roasterId?: string) => {
    if (!text.trim() && !coffeeId && !roasterId) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await searchAction({
        query: text.trim(),
        coffeeId: coffeeId as Id<"coffees"> | undefined,
        roasterId,
        limit: 50,
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
  }, [searchAction]);

  // Clear search
  const handleClear = useCallback(() => {
    searchInputRef.current?.clear();
    setResults([]);
    setHasSearched(false);
    searchInputRef.current?.focus();
  }, []);

  // Apply client-side filters to results
  const filteredResults = (results ?? []).filter((coffee) => {
    if (roastedForFilter === "espresso" && coffee.roastedFor !== "espresso" && coffee.roastedFor !== null) return false;
    if (roastedForFilter === "filter" && coffee.roastedFor !== "filter" && coffee.roastedFor !== null) return false;
    // Note: decaf filter would need caffeine field in search results
    return true;
  });

  // Group by roaster
  const groupedByRoaster = new Map<string, typeof filteredResults>();
  for (const coffee of filteredResults) {
    const existing = groupedByRoaster.get(coffee.roasterId) || [];
    existing.push(coffee);
    groupedByRoaster.set(coffee.roasterId, existing);
  }

  const handleRoastedForFilter = useCallback((value: "espresso" | "filter" | null) => {
    startTransition(() => {
      setRoastedForFilter(value);
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
          {isSearching && (
            <p className="mt-4 text-center text-text-muted font-bold uppercase tracking-wide">
              Searching...
            </p>
          )}
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
