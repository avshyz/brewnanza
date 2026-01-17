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
          "px-4 py-2 border-2 rounded-md font-semibold text-sm cursor-pointer",
          "transition-colors duration-150 ease-out",
          variant === "default" && [
            "border-border bg-surface",
            "hover:bg-background hover:border-text-muted",
            "active:bg-gray-100",
          ],
          variant === "primary" && [
            "border-primary bg-primary text-white",
            "hover:bg-primary-dark hover:border-primary-dark",
          ],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
