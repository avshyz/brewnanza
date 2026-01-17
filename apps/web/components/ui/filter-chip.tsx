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
        "inline-flex items-center gap-1 px-2 py-0.5 border-2",
        "text-[0.65rem] font-bold uppercase tracking-wide cursor-pointer",
        "transition-all duration-100 ease-out",
        active
          ? "border-border bg-primary text-white shadow-[2px_2px_0_var(--color-border)]"
          : "border-border bg-surface text-text hover:bg-accent hover:shadow-[2px_2px_0_var(--color-border)] hover:-translate-x-px hover:-translate-y-px",
        className
      )}
    >
      {children}
    </button>
  );
}
