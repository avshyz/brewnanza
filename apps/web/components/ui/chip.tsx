import { cn } from "../../lib/utils";

type ChipVariant = "default" | "primary" | "secondary" | "accent" | "espresso" | "filter";

interface ChipProps {
  children: React.ReactNode;
  variant?: ChipVariant;
  className?: string;
}

const variantStyles: Record<ChipVariant, string> = {
  default: "border-border bg-surface text-text",
  primary: "border-border bg-primary text-white",
  secondary: "border-border bg-secondary text-text",
  accent: "border-border bg-accent text-text",
  espresso: "border-border bg-amber-900 text-white",
  filter: "border-border bg-emerald-600 text-white",
};

export function Chip({ children, variant = "default", className }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 border-2 text-[0.65rem] font-bold uppercase tracking-wide",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
