"use client";

import { useEffect, useRef } from "react";
import tippy from "tippy.js";
import "tippy.js/dist/tippy.css";
import { cn } from "../lib/utils";
import { getTastingNoteInfo } from "../lib/tasting-notes";
import { Chip } from "./ui/chip";
import { FilterIcon, EspressoIcon, DecafIcon, LightRoastIcon, MediumRoastIcon, DarkRoastIcon } from "./icons";

// Flexible type to accept both Doc<"coffees"> and search results
interface CoffeeData {
  _id: string;
  name: string;
  roasterId: string;
  url: string;
  notes: string[];
  process: string[];
  country: string[];
  region: string[];
  variety: string[];
  producer?: string[];
  roastLevel?: string | null;
  roastedFor?: string | null;
  caffeine?: string | null;
  _creationTime?: number;
  prices: Array<{
    price: number;
    currency: string;
    weightGrams: number;
    priceUsd: number | null;
    available: boolean;
  }>;
  available: boolean;
  imageUrl: string | null;
}

const NEW_COFFEE_THRESHOLD_MS = 4 * 24 * 60 * 60 * 1000; // 4 days
const TARGET_WEIGHT_GRAMS = 250;

function isNewCoffee(createdAt?: number): boolean {
  if (!createdAt) return false;
  return Date.now() - createdAt < NEW_COFFEE_THRESHOLD_MS;
}

// Find price closest to 250g
function getBestPrice(prices: CoffeeData["prices"]): CoffeeData["prices"][0] | null {
  const available = prices.filter((p) => p.available);
  if (available.length === 0) return null;

  return available.reduce((best, current) => {
    const bestDist = Math.abs(best.weightGrams - TARGET_WEIGHT_GRAMS);
    const currDist = Math.abs(current.weightGrams - TARGET_WEIGHT_GRAMS);
    return currDist < bestDist ? current : best;
  });
}

function getCurrencySymbol(currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency })
    .formatToParts(0)
    .find((p) => p.type === "currency")?.value ?? currency;
}

function formatPrice(price: CoffeeData["prices"][0]): string {
  const symbol = getCurrencySymbol(price.currency);
  return `${symbol}${price.price}/${price.weightGrams}g`;
}

function formatPriceUsd(price: CoffeeData["prices"][0]): string | null {
  if (price.priceUsd == null) return null;
  return `$${price.priceUsd.toFixed(0)}/${price.weightGrams}g`;
}

interface CoffeeCardProps {
  coffee: CoffeeData;
  showRoaster?: boolean;
  matchedAttributes?: string[];
}

// Single process emoji for all processing methods
const PROCESS_EMOJI = "⚗️";

// Country name to ISO code
const COUNTRY_CODES: Record<string, string> = {
  ethiopia: "ET",
  colombia: "CO",
  kenya: "KE",
  brazil: "BR",
  guatemala: "GT",
  peru: "PE",
  honduras: "HN",
  rwanda: "RW",
  burundi: "BI",
  panama: "PA",
  "costa rica": "CR",
  mexico: "MX",
  indonesia: "ID",
  india: "IN",
  yemen: "YE",
  bolivia: "BO",
  ecuador: "EC",
  nicaragua: "NI",
  "el salvador": "SV",
  tanzania: "TZ",
  uganda: "UG",
  drc: "CD",
  congo: "CD",
  myanmar: "MM",
  thailand: "TH",
  vietnam: "VN",
  china: "CN",
  taiwan: "TW",
  japan: "JP",
  hawaii: "US",
  jamaica: "JM",
  png: "PG",
  "papua new guinea": "PG",
  laos: "LA",
  philippines: "PH",
  cameroon: "CM",
  malawi: "MW",
  zambia: "ZM",
  zimbabwe: "ZW",
  geisha: "PA", // Geisha originated in Panama
};

// Convert ISO country code to flag emoji using regional indicator symbols
function isoToFlag(iso: string): string {
  const codePoints = [...iso.toUpperCase()].map(
    (char) => 0x1f1e6 - 65 + char.charCodeAt(0)
  );
  return String.fromCodePoint(...codePoints);
}

function getProcessEmoji(): string {
  return PROCESS_EMOJI;
}

function getCountryFlag(country: string): string {
  const lower = country.toLowerCase();
  const code = COUNTRY_CODES[lower];
  return code ? isoToFlag(code) : "🌍";
}

// Roast level icon
const ROAST_LEVEL_ICON: Record<string, React.ReactNode> = {
  light: <LightRoastIcon className="w-3.5 h-3.5 shrink-0" />,
  medium: <MediumRoastIcon className="w-3.5 h-3.5 shrink-0" />,
  dark: <DarkRoastIcon className="w-3.5 h-3.5 shrink-0" />,
};

// Roasted for icon
const ROASTED_FOR_ICON: Record<string, React.ReactNode> = {
  filter: <FilterIcon className="w-3.5 h-3.5 shrink-0" />,
  espresso: <EspressoIcon className="w-3.5 h-3.5 shrink-0" />,
};

function formatNewDate(createdAt?: number): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildTooltipContent(
  coffee: CoffeeData,
  bestPrice: CoffeeData["prices"][0] | null,
  isNew: boolean
): string {
  const parts: string[] = [];

  // Roast info
  const roastParts: string[] = [];
  if (coffee.roastLevel) roastParts.push(`a ${coffee.roastLevel} roast`);
  if (coffee.roastedFor) roastParts.push(`roasted for ${coffee.roastedFor}`);
  if (coffee.caffeine) roastParts.push(coffee.caffeine === "decaf" ? "decaffeinated" : "low caffeine");

  if (roastParts.length > 0) {
    parts.push(`This coffee is ${roastParts.join(", ")}.`);
  }

  // Price in USD
  if (bestPrice) {
    const usdPrice = formatPriceUsd(bestPrice);
    if (usdPrice && bestPrice.currency !== "USD") {
      parts.push(`Costs ${usdPrice} (${formatPrice(bestPrice)}).`);
    } else {
      parts.push(`Costs ${formatPrice(bestPrice)}.`);
    }
  }

  // New badge
  if (isNew && coffee._creationTime) {
    parts.push(`Appeared on ${formatNewDate(coffee._creationTime)}.`);
  }

  return parts.join("<br>");
}

export function CoffeeCard({ coffee, showRoaster = true, matchedAttributes = [] }: CoffeeCardProps) {
  const roasterChipRef = useRef<HTMLDivElement>(null);
  const producer = coffee.producer?.join(", ");
  const variety = coffee.variety.join(", ");
  const process = coffee.process.join(", ");
  const country = coffee.country.join(", ");
  const countryFlags = coffee.country.map(getCountryFlag).join("");
  const notes = coffee.notes || [];
  const matchedSet = new Set(matchedAttributes.map(a => a.toLowerCase()));
  const isNew = isNewCoffee(coffee._creationTime);
  const bestPrice = getBestPrice(coffee.prices);

  const title = coffee.name;
  const tooltipContent = buildTooltipContent(coffee, bestPrice, isNew);

  useEffect(() => {
    if (!roasterChipRef.current || !tooltipContent) return;
    const instance = tippy(roasterChipRef.current, {
      content: tooltipContent,
      placement: "bottom-start",
      delay: [300, 0],
      theme: "brutal",
      allowHTML: true,
    });
    return () => instance.destroy();
  }, [tooltipContent]);

  return (
    <a
      href={coffee.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group flex no-underline text-inherit relative overflow-hidden",
        "bg-surface border-2 border-border rounded-xl",
        "shadow-[1.5px_1.5px_0_var(--color-border)]",
        "transition-all duration-200 ease-out",
        "hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-[4.5px_4.5px_0_var(--color-border)]",
        "active:translate-x-0 active:translate-y-0 active:shadow-[1.5px_1.5px_0_var(--color-border)]"
      )}
    >
      {/* Top left chips - roaster info and price */}
      {showRoaster && (
        <div ref={roasterChipRef} className="absolute -top-1 -left-1 z-10 flex gap-1">
          <Chip
            variant="primary"
            className="transition-shadow duration-200 group-hover:shadow-[3px_3px_0_var(--color-border)] flex items-center gap-1.5 leading-none"
          >
            {coffee.roasterId}
            {coffee.roastLevel && ROAST_LEVEL_ICON[coffee.roastLevel]}
            {coffee.roastedFor && ROASTED_FOR_ICON[coffee.roastedFor]}
            {coffee.caffeine && <DecafIcon className="w-3.5 h-3.5 shrink-0" />}
            {isNew && <span className="text-white font-bold">NEW!</span>}
          </Chip>
          {bestPrice && (
            <Chip className="bg-amber-100 text-amber-900 border-amber-400 transition-shadow duration-200 group-hover:shadow-[3px_3px_0_var(--color-border)] font-mono text-[0.65rem]">
              {formatPrice(bestPrice)}
            </Chip>
          )}
        </div>
      )}

      {/* Thumbnail - flexible width, square aspect ratio */}
      {coffee.imageUrl && (
        <div className="w-[38%] flex-shrink-0 aspect-square border-r-2 border-border overflow-hidden">
          <img
            src={coffee.imageUrl}
            alt={coffee.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 p-3 min-w-0 flex flex-col">
        {/* Title */}
        <div className={cn(
          "font-bold text-sm uppercase tracking-tight leading-tight",
          "transition-all duration-200",
          "group-hover:[text-shadow:-1.5px_-1.5px_0_cyan,3px_3px_0_magenta]"
        )}>
          {title}
        </div>

        {/* Meta info */}
        <div className="flex flex-col gap-0 mt-0.5">
          {/* Variety */}
          {variety && (
            <div className={cn(
              "text-[0.7rem] uppercase tracking-tight text-muted-foreground flex items-center gap-1",
              "transition-all duration-200",
              "group-hover:[text-shadow:-1.5px_-1.5px_0_cyan,3px_3px_0_magenta]"
            )}>
              <span className="text-[0.6rem]">🫘</span>
              <span className="truncate">{variety}</span>
            </div>
          )}

          {/* Process */}
          {process && (
            <div className={cn(
              "text-[0.7rem] uppercase tracking-tight flex items-center gap-1",
              "transition-all duration-200",
              "group-hover:[text-shadow:-1.5px_-1.5px_0_cyan,3px_3px_0_magenta]"
            )}>
              <span className="text-[0.6rem]">{getProcessEmoji()}</span>
              <span className="truncate">{process}</span>
            </div>
          )}

          {/* Country */}
          {country && (
            <div className={cn(
              "text-[0.65rem] uppercase tracking-wide text-muted-foreground flex items-center gap-1",
              "transition-all duration-200",
              "group-hover:[text-shadow:-1.5px_-1.5px_0_cyan,3px_3px_0_magenta]"
            )}>
              <span className="text-[0.55rem]">{countryFlags}</span>
              <span className="truncate">{country}</span>
            </div>
          )}

          {/* Producer */}
          {producer && (
            <div className={cn(
              "text-[0.65rem] uppercase tracking-wide text-muted-foreground flex items-center gap-1",
              "transition-all duration-200",
              "group-hover:[text-shadow:-1.5px_-1.5px_0_cyan,3px_3px_0_magenta]"
            )}>
              <span className="text-[0.55rem]">👨‍🌾</span>
              <span className="truncate">{producer}</span>
            </div>
          )}
        </div>

        {/* Spacer to push notes to bottom */}
        <div className="flex-1" />

        {/* Tasting notes */}
        {notes.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {[...notes]
              .sort((a, b) => {
                const aMatched = matchedSet.has(a.toLowerCase());
                const bMatched = matchedSet.has(b.toLowerCase());
                if (aMatched && !bMatched) return -1;
                if (!aMatched && bMatched) return 1;
                return 0;
              })
              .slice(0, 3)
              .map((note, i) => {
                const { emoji, color } = getTastingNoteInfo(note);
                const isMatched = matchedSet.has(note.toLowerCase());
                return (
                  <Chip
                    key={i}
                    className={cn(
                      isMatched ? color.highlight : color.normal,
                      "uppercase transition-shadow duration-200 group-hover:shadow-[3px_3px_0_var(--color-border)] text-[0.6rem] px-1 py-0.5"
                    )}
                  >
                    {emoji} {note}
                  </Chip>
                );
              })}
            {notes.length > 3 && (
              <Chip className="uppercase border-black transition-shadow duration-200 group-hover:shadow-[3px_3px_0_var(--color-border)] text-[0.6rem] px-1 py-0.5 bg-gray-100">
                +{notes.length - 3}
              </Chip>
            )}
          </div>
        )}
      </div>
    </a>
  );
}
