import { cn } from "../../lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { forwardRef, type ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary";
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(
          "px-4 py-2 border-3 font-bold text-sm uppercase tracking-wide cursor-pointer",
          "brutal-shadow-sm transition-all duration-100 ease-out",
          "hover:-translate-x-px hover:-translate-y-px hover:shadow-[3px_3px_0_var(--color-border)]",
          "active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--color-border)]",
          variant === "default" && "border-border bg-surface text-text",
          variant === "primary" && "border-border bg-primary text-white",
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
