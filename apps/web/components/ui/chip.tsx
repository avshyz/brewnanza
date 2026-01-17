import { cn } from "../../lib/utils";

type ChipVariant = "default" | "primary" | "secondary" | "accent" | "espresso" | "filter";

interface ChipProps {
  children: React.ReactNode;
  variant?: ChipVariant;
  className?: string;
}

const variantStyles: Record<ChipVariant, string> = {
  default: "border-border text-text",
  primary: "border-primary text-primary",
  secondary: "border-secondary text-text",
  accent: "border-accent bg-accent text-text",
  espresso: "border-amber-800 bg-amber-800 text-white",
  filter: "border-emerald-700 bg-emerald-700 text-white",
};

export function Chip({ children, variant = "default", className }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 border-[1.5px] rounded-md text-[0.7rem] font-medium uppercase",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
