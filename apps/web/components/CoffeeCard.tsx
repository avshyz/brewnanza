import type { Doc } from "../../../convex/_generated/dataModel";
import { cn } from "../lib/utils";
import { Chip } from "./ui/chip";

type Coffee = Doc<"coffees">;

interface CoffeeCardProps {
  coffee: Coffee;
  showRoaster?: boolean;
}

export function CoffeeCard({ coffee, showRoaster = true }: CoffeeCardProps) {
  const minPrice = coffee.prices?.length
    ? Math.min(...coffee.prices.map((p) => p.priceUsd || p.price))
    : null;

  // For blends, show all countries joined
  const countryDisplay = coffee.country.length > 1
    ? coffee.country.join(" + ")
    : coffee.country[0];

  // For blends, show all processes joined
  const processDisplay = coffee.process.length > 1
    ? coffee.process.join(" / ")
    : coffee.process[0];

  return (
    <a
      href={coffee.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block no-underline text-inherit overflow-hidden",
        "bg-surface border-3 border-border",
        "brutal-shadow transition-all duration-150 ease-out",
        "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--color-border)]",
        "active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_var(--color-border)]"
      )}
    >
      {/* Image */}
      {coffee.imageUrl && (
        <div className="w-full h-[160px] overflow-hidden border-b-3 border-border">
          <img
            src={coffee.imageUrl}
            alt={coffee.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {/* Header row: roaster + price */}
        <div className="flex justify-between items-center mb-2">
          {showRoaster ? (
            <Chip variant="primary">{coffee.roasterId}</Chip>
          ) : (
            <span />
          )}
          {minPrice && (
            <span className="font-black text-lg">
              ${minPrice.toFixed(0)}
            </span>
          )}
        </div>

        {/* Name */}
        <h3 className="font-black mb-3 text-base leading-tight uppercase tracking-tight">
          {coffee.name}
        </h3>

        {/* Origin info as chips */}
        <div className="flex gap-1.5 flex-wrap mb-2">
          {countryDisplay && <Chip variant="secondary">{countryDisplay}</Chip>}
          {processDisplay && <Chip>{processDisplay}</Chip>}
        </div>

        {/* Varieties */}
        {coffee.variety.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {coffee.variety.slice(0, 3).map((v, i) => (
              <Chip key={i} variant="accent">
                {v}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}
