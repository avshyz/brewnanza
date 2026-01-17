"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { flushSync } from "react-dom";
import { CoffeeCard } from "../components/CoffeeCard";
import { Button } from "../components/ui/button";
import { FilterChip } from "../components/ui/filter-chip";

export default function Home() {
  const coffees = useQuery(api.coffees.getAll);
  const [search, setSearch] = useState("");
  const [groupByRoaster, setGroupByRoaster] = useState(false);
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  const [processFilter, setProcessFilter] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine if we're in "results" mode
  const showResults = search.trim() || countryFilter || processFilter;

  // Refocus input after view transition
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [showResults]);

  // Get unique countries and processes for filters
  const { countries, processes } = useMemo(() => {
    if (!coffees) return { countries: [], processes: [] };

    const countryCount = new Map<string, number>();
    const processCount = new Map<string, number>();

    for (const coffee of coffees) {
      // country is now an array
      for (const c of coffee.country) {
        countryCount.set(c, (countryCount.get(c) || 0) + 1);
      }
      // process is now an array
      for (const p of coffee.process) {
        processCount.set(p, (processCount.get(p) || 0) + 1);
      }
    }

    const countries = [...countryCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name);

    const processes = [...processCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);

    return { countries, processes };
  }, [coffees]);

  // Simple client-side filtering
  const filteredCoffees = useMemo(() => {
    if (!coffees) return [];

    let filtered = coffees.filter((c) => !c.skipped);

    if (countryFilter) {
      filtered = filtered.filter((c) => c.country.includes(countryFilter));
    }
    if (processFilter) {
      filtered = filtered.filter((c) => c.process.includes(processFilter));
    }

    if (search.trim()) {
      const terms = search.toLowerCase().split(/\s+/);
      filtered = filtered.filter((coffee) => {
        const searchableText = [
          coffee.name,
          ...coffee.country,
          ...coffee.region,
          ...coffee.producer,
          ...coffee.process,
          coffee.roasterId,
          ...coffee.variety,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return terms.every((term) => searchableText.includes(term));
      });
    }

    return filtered;
  }, [coffees, search, countryFilter, processFilter]);

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
    const wasEmpty = !search.trim();
    const willBeEmpty = !value.trim();
    const shouldTransition = wasEmpty !== willBeEmpty;

    if (shouldTransition && document.startViewTransition) {
      document.startViewTransition(() => {
        flushSync(() => {
          setSearch(value);
        });
      });
    } else {
      setSearch(value);
    }
  }, [search]);

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
            className=" w-full px-8 py-6 text-xl border-3 border-border bg-surface outline-none font-medium"
          />
        </div>
      </main>
    );
  }

  // Landing view (no search active)
  if (!showResults) {
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
            ref={inputRef}
            type="text"
            placeholder="fruity natural ethiopia..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full px-8 py-6 text-xl border-3 border-border bg-surface outline-none font-medium brutal-shadow transition-shadow duration-150 focus:shadow-[6px_6px_0_var(--color-primary)]"
            autoFocus
          />
        </div>
        <p className="mt-8 text-sm text-text-muted font-bold uppercase tracking-wide">
          {coffees.filter(c => !c.skipped).length} coffees from {new Set(coffees.filter(c => !c.skipped).map(c => c.roasterId)).size} roasters
        </p>
      </main>
    );
  }

  // Results view
  return (
    <main className="max-w-[1200px] mx-auto px-4 pt-0">
      <header className="results-header sticky top-0 bg-background py-4 z-10 border-b-3 border-border mb-6">
        <div className="flex items-center gap-4 mb-3">
          <h1 className="text-2xl font-black uppercase tracking-tight">
            Brewnanza
          </h1>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className=" flex-1 max-w-[400px] px-4 py-3 border-3 border-border bg-surface outline-none font-medium brutal-shadow-sm transition-shadow duration-150 focus:shadow-[4px_4px_0_var(--color-primary)]"
          />
          {search && (
            <Button onClick={() => handleSearchChange("")}>Clear</Button>
          )}
          <Button
            variant={groupByRoaster ? "primary" : "default"}
            onClick={() => setGroupByRoaster(!groupByRoaster)}
          >
            {groupByRoaster ? "Ungrouped" : "By Roaster"}
          </Button>
        </div>

        {/* Filter chips */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-xs text-text-muted font-bold uppercase mr-1">Country:</span>
            {countries.map((country) => (
              <FilterChip
                key={country}
                active={countryFilter === country}
                onClick={() => setCountryFilter(countryFilter === country ? null : country)}
              >
                {country}
              </FilterChip>
            ))}
            {countryFilter && (
              <FilterChip onClick={() => setCountryFilter(null)}>X</FilterChip>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-xs text-text-muted font-bold uppercase mr-1">Process:</span>
            {processes.map((process) => (
              <FilterChip
                key={process}
                active={processFilter === process}
                onClick={() => setProcessFilter(processFilter === process ? null : process)}
              >
                {process}
              </FilterChip>
            ))}
            {processFilter && (
              <FilterChip onClick={() => setProcessFilter(null)}>X</FilterChip>
            )}
          </div>
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
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
