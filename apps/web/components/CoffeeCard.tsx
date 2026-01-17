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

  return (
    <a
      href={coffee.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block no-underline text-inherit overflow-hidden",
        "bg-surface border-2 border-border rounded-[--radius-md]",
        "transition-all duration-150 ease-out",
        "hover:-translate-y-0.5 hover:border-primary"
      )}
    >
      {/* Image */}
      {coffee.imageUrl && (
        <div className="w-full h-[140px] overflow-hidden border-b-2 border-border">
          <img
            src={coffee.imageUrl}
            alt={coffee.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Content */}
      <div className="p-3.5">
        {/* Header row: roaster + price */}
        <div className="flex justify-between items-center mb-2">
          {showRoaster ? (
            <Chip>{coffee.roasterId}</Chip>
          ) : (
            <span />
          )}
          {minPrice && (
            <span className="font-bold text-sm">
              ${minPrice.toFixed(0)}+
            </span>
          )}
        </div>

        {/* Name */}
        <h3 className="font-bold mb-2 text-[0.95rem] leading-tight">
          {coffee.name}
        </h3>

        {/* Origin info as chips */}
        <div className="flex gap-1 flex-wrap mb-2">
          {coffee.country && <Chip variant="secondary">{coffee.country}</Chip>}
          {coffee.process && <Chip>{coffee.process}</Chip>}
          {coffee.roastedFor && (
            <Chip variant={coffee.roastedFor === "espresso" ? "espresso" : "filter"}>
              {coffee.roastedFor}
            </Chip>
          )}
        </div>

        {/* Tasting notes */}
        {coffee.notes?.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {coffee.notes.slice(0, 3).map((note: string, i: number) => (
              <Chip key={i} variant="accent">
                {note}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}
