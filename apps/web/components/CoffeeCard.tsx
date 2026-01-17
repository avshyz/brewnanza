import type { Doc } from "../../../convex/_generated/dataModel";
import { cn } from "../lib/utils";
import { getTastingNoteInfo } from "../lib/tasting-notes";
import { Chip } from "./ui/chip";
import { FilterIcon, EspressoIcon, DecafIcon, LightRoastIcon, MediumRoastIcon, DarkRoastIcon } from "./icons";

type Coffee = Doc<"coffees">;

interface CoffeeCardProps {
  coffee: Coffee;
  showRoaster?: boolean;
}

// Process emoji mapping
const PROCESS_EMOJI: Record<string, string> = {
  washed: "💧",
  wet: "💧",
  natural: "☀️",
  dry: "☀️",
  honey: "🍯",
  anaerobic: "🧪",
  carbonic: "🫧",
  "carbonic maceration": "🫧",
  fermented: "🧫",
  experimental: "🔬",
};

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

function getProcessEmoji(process: string): string {
  const lower = process.toLowerCase();
  for (const [key, emoji] of Object.entries(PROCESS_EMOJI)) {
    if (lower.includes(key)) return emoji;
  }
  return "⚗️";
}

function getCountryFlag(country: string): string {
  const lower = country.toLowerCase();
  const code = COUNTRY_CODES[lower];
  return code ? isoToFlag(code) : "🌍";
}

// Roast level icon
const ROAST_LEVEL_ICON: Record<string, React.ReactNode> = {
  light: <LightRoastIcon className="w-3.5 h-3.5 inline-block" />,
  medium: <MediumRoastIcon className="w-3.5 h-3.5 inline-block" />,
  dark: <DarkRoastIcon className="w-3.5 h-3.5 inline-block" />,
};

// Roasted for icon
const ROASTED_FOR_ICON: Record<string, React.ReactNode> = {
  filter: <FilterIcon className="w-4 h-4 inline-block" />,
  espresso: <EspressoIcon className="w-4 h-4 inline-block" />,
};

export function CoffeeCard({ coffee, showRoaster = true }: CoffeeCardProps) {
  const producer = coffee.producer[0];
  const variety = coffee.variety[0];
  const process = coffee.process[0];
  const country = coffee.country[0];
  const notes = coffee.notes || [];

  // Fallback: if no producer/variety, show coffee name
  const title = producer || coffee.name;

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
      {/* Top left chip - roaster and roast info */}
      {showRoaster && (
        <div className="absolute -top-1 -left-1 z-10">
          <Chip
            variant="primary"
            className="transition-shadow duration-200 group-hover:shadow-[3px_3px_0_var(--color-border)] flex items-center gap-1.5"
          >
            {coffee.roasterId}
            {coffee.roastLevel && ROAST_LEVEL_ICON[coffee.roastLevel]}
            {coffee.roastedFor && ROASTED_FOR_ICON[coffee.roastedFor]}
            {coffee.caffeine && <DecafIcon className="w-3.5 h-3.5 inline-block" />}
          </Chip>
        </div>
      )}

      {/* Thumbnail */}
      {coffee.imageUrl && (
        <div className="w-44 flex-shrink-0 border-r-2 border-border rounded-l-xl overflow-hidden">
          <img
            src={coffee.imageUrl}
            alt={coffee.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 py-4 px-5 min-w-0 flex flex-col gap-1">
        {/* Title */}
        <div className={cn(
          "font-bold text-lg uppercase tracking-tight",
          "transition-all duration-200",
          "group-hover:[text-shadow:-1.5px_-1.5px_0_cyan,3px_3px_0_magenta]"
        )}>
          {title}
        </div>

        {/* Variety */}
        {variety && (
          <div className={cn(
            "text-sm uppercase tracking-tight text-muted-foreground",
            "transition-all duration-200",
            "group-hover:[text-shadow:-1.5px_-1.5px_0_cyan,3px_3px_0_magenta]"
          )}>
            {variety}
          </div>
        )}

        {/* Process */}
        {process && (
          <div className={cn(
            "text-sm uppercase tracking-tight",
            "transition-all duration-200",
            "group-hover:[text-shadow:-1.5px_-1.5px_0_cyan,3px_3px_0_magenta]"
          )}>
            {process} {getProcessEmoji(process)}
          </div>
        )}

        {/* Country */}
        {country && (
          <div className={cn(
            "text-xs uppercase tracking-wide text-muted-foreground",
            "transition-all duration-200",
            "group-hover:[text-shadow:-1.5px_-1.5px_0_cyan,3px_3px_0_magenta]"
          )}>
            {country} {getCountryFlag(country)}
          </div>
        )}

        {/* Tasting notes */}
        {notes.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-auto pt-2">
            {notes.slice(0, 3).map((note, i) => {
              const { emoji, color } = getTastingNoteInfo(note);
              return (
                <Chip
                  key={i}
                  className={cn(
                    color,
                    "uppercase border-black transition-shadow duration-200 group-hover:shadow-[3px_3px_0_var(--color-border)]"
                  )}
                >
                  {note} {emoji}
                </Chip>
              );
            })}
          </div>
        )}
      </div>
    </a>
  );
}
