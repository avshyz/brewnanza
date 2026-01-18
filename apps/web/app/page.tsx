"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useMemo, useRef, useEffect, useCallback, startTransition, useDeferredValue } from "react";
import { flushSync } from "react-dom";
import Fuse from "fuse.js";
import { CoffeeCard } from "../components/CoffeeCard";
import { Button } from "../components/ui/button";
import { FilterChip } from "../components/ui/filter-chip";
import { EspressoIcon, FilterIcon, DecafIcon } from "../components/icons";

const TRANSITION_DEBOUNCE_MS = 400;

export default function Home() {
  const coffees = useQuery(api.coffees.getAll);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [groupByRoaster, setGroupByRoaster] = useState(false);
  const [roastedForFilter, setRoastedForFilter] = useState<"espresso" | "filter" | null>(null);
  const [decafOnly, setDecafOnly] = useState(false);
  const [hasTransitioned, setHasTransitioned] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Once transitioned, stay in results view
  const showResults = hasTransitioned;

  // Trigger transition after user stops typing
  useEffect(() => {
    if (hasTransitioned) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (search.trim()) {
      debounceRef.current = setTimeout(() => {
        if (document.startViewTransition) {
          document.startViewTransition(() => {
            flushSync(() => setHasTransitioned(true));
          });
        } else {
          setHasTransitioned(true);
        }
      }, TRANSITION_DEBOUNCE_MS);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, hasTransitioned]);

  // Refocus input after view transition
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [hasTransitioned]);

  // Pre-filter coffees (skip, roastedFor, decaf)
  const preFilteredCoffees = useMemo(() => {
    if (!coffees) return [];

    return coffees.filter((coffee) => {
      if (coffee.skipped) return false;
      if (roastedForFilter === "espresso" && coffee.roastedFor !== "espresso" && coffee.roastedFor !== null) return false;
      if (roastedForFilter === "filter" && coffee.roastedFor !== "filter" && coffee.roastedFor !== null) return false;
      if (decafOnly && coffee.caffeine !== "decaf") return false;
      return true;
    });
  }, [coffees, roastedForFilter, decafOnly]);

  // Fuse instance for fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(preFilteredCoffees, {
      keys: [
        { name: "name", weight: 2 },
        { name: "country", weight: 1.5 },
        { name: "region", weight: 1 },
        { name: "producer", weight: 1 },
        { name: "process", weight: 1.5 },
        { name: "variety", weight: 1 },
        { name: "notes", weight: 1.5 },
        { name: "roasterId", weight: 0.5 },
      ],
      threshold: 0.4,
      ignoreLocation: true,
      useExtendedSearch: true,
    });
  }, [preFilteredCoffees]);

  // Apply fuzzy search (uses deferred value for responsiveness)
  const filteredCoffees = useMemo(() => {
    const query = deferredSearch.trim();
    if (!query) return preFilteredCoffees;

    return fuse.search(query).map((result) => result.item);
  }, [deferredSearch, preFilteredCoffees, fuse]);

  // Group by roaster
  const groupedByRoaster = useMemo(() => {
    const groups = new Map<string, typeof filteredCoffees>();
    for (const coffee of filteredCoffees) {
      const existing = groups.get(coffee.roasterId) || [];
      existing.push(coffee);
      groups.set(coffee.roasterId, existing);
    }
    return groups;
  }, [filteredCoffees]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  // Rule 5.7: Use startTransition for non-urgent filter updates
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

  // Loading state
  if (!coffees) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-8">
        <h1 className="text-7xl font-black mb-2 tracking-tighter uppercase">
          Brewnanza
        </h1>
        <p className="text-xl text-text-muted mb-12 font-bold uppercase tracking-wide">
          find your next godshot
        </p>
        <div className="w-full max-w-[600px]">
          <input
            type="text"
            placeholder="loading coffees..."
            disabled
            value=""
            readOnly
            className="w-full px-8 py-6 text-xl border-3 border-border bg-surface outline-none font-medium"
          />
        </div>
      </main>
    );
  }

  // Landing view (no search active)
  if (!showResults) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-8">
        <h1 className="main-title text-7xl font-black mb-2 tracking-tighter uppercase">
          Brewnanza
        </h1>
        <p className="text-xl text-text-muted mb-12 font-bold uppercase tracking-wide">
          find your next godshot
        </p>
        <div className="w-full max-w-[600px]">
          <input
            ref={inputRef}
            type="text"
            placeholder="fruity natural ethiopia..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="search-bar w-full p-4 text-xl border-3 border-border bg-surface outline-none font-medium brutal-shadow transition-shadow duration-150 focus:shadow-[6px_6px_0_var(--color-primary)]"
            autoFocus
          />
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
          <input
            ref={inputRef}
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="search-bar flex-1 max-w-[400px] p-4 border-3 border-border bg-surface outline-none font-medium brutal-shadow-sm transition-shadow duration-150 focus:shadow-[4px_4px_0_var(--color-primary)]"
          />
          {search ? (
            <Button onClick={() => handleSearchChange("")}>Clear</Button>
          ) : null}
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
          {filteredCoffees.length} results
        </p>
      </header>

      {filteredCoffees.length === 0 ? (
        <div className="bg-surface border-3 border-border text-center p-8 brutal-shadow">
          <p className="font-bold uppercase">No coffees found. Try a different search.</p>
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
                  <CoffeeCard key={coffee._id} coffee={coffee} showRoaster={false} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 pb-8">
          {filteredCoffees.map((coffee) => (
            <CoffeeCard key={coffee._id} coffee={coffee} />
          ))}
        </div>
      )}
    </main>
  );
}
