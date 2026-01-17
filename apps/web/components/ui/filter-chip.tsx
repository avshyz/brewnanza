import { cn } from "../../lib/utils";

interface FilterChipProps {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function FilterChip({ children, active = false, onClick, className }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 border-[1.5px] rounded-md",
        "text-[0.7rem] font-medium uppercase cursor-pointer",
        "transition-colors duration-150 ease-out",
        active
          ? "border-primary bg-primary text-white"
          : "border-border bg-transparent text-text hover:border-text-muted",
        className
      )}
    >
      {children}
    </button>
  );
}
