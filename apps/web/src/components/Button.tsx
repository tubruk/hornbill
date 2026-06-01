import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "small" | "medium" | "large";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "medium", disabled, children, ...props }, ref) => {
    // Base classes
    const baseClass = "inline-flex items-center justify-center font-body font-semibold rounded-sm transition-all duration-150 select-none outline-none focus:ring-2 focus:ring-primary/20";

    // Size styling
    let sizeClass = "";
    if (size === "small") {
      sizeClass = "text-[14px] h-8 px-3 py-1";
    } else if (size === "medium") {
      sizeClass = "text-[16px] h-10 px-4 py-2";
    } else if (size === "large") {
      sizeClass = "text-[20px] h-12 px-6 py-3";
    }

    // Variant styling
    let variantClass = "";
    if (variant === "primary") {
      variantClass = "bg-primary text-white hover:bg-primary-hover shadow-sm hover:shadow-primary-glow";
    } else if (variant === "secondary") {
      variantClass = "bg-transparent text-text-primary border border-border-warm hover:bg-surface-raised";
    } else if (variant === "ghost") {
      variantClass = "bg-transparent text-text-primary hover:bg-surface-raised";
    } else if (variant === "destructive") {
      variantClass = "bg-error text-white hover:bg-[#B91C1C]";
    }

    // Disabled styling
    let disabledClass = "";
    if (disabled) {
      disabledClass = "opacity-40 cursor-not-allowed pointer-events-none shadow-none hover:shadow-none";
    }

    const classes = [baseClass, sizeClass, variantClass, disabledClass, className].filter(Boolean).join(" ");

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={classes}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
