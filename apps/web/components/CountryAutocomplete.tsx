"use client";

import { useState, useMemo } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { Button } from "./ui/button";

interface Country {
  code: string;
  name: string;
}

interface CountryAutocompleteProps {
  countries: Country[];
  value: string | null;
  onChange: (code: string) => void;
}

export function CountryAutocomplete({ countries, value, onChange }: CountryAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedCountry = countries.find(c => c.code === value);

  // Filter countries by query
  const filtered = useMemo(() => {
    if (!query) return countries;
    const q = query.toLowerCase();
    return countries.filter(c =>
      c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [countries, query]);

  // Handle selection
  const handleSelect = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery("");
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    } else if (e.key === "Enter" && filtered.length > 0) {
      handleSelect(filtered[0].code);
    }
  };

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) setQuery("");
    }}>
      <PopoverTrigger asChild>
        <Button>
          🌍 {selectedCountry?.name || "Select country"}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-56">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type to filter..."
          autoFocus
          className="w-full px-2 py-1 mb-2 bg-background border-2 border-border font-bold text-sm outline-none placeholder:text-text-muted"
        />

        {filtered.length === 0 ? (
          <div className="px-2 py-1 text-sm text-text-muted">No matches</div>
        ) : (
          filtered.map((country) => (
            <button
              key={country.code}
              type="button"
              className="w-full text-left px-2 py-1 hover:bg-black hover:text-white cursor-pointer text-sm font-bold uppercase"
              onClick={() => handleSelect(country.code)}
            >
              {value === country.code ? "✓ " : ""}{country.name}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
