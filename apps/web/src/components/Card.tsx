import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  hoverable?: boolean;
  stripeColor?: string;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", selected = false, hoverable = true, stripeColor, children, ...props }, ref) => {
    // Base classes
    let baseClass = "bg-surface-warm rounded-md p-4 border border-border-warm transition-all duration-150 relative";

    // Selected state: terracotta left border (2px)
    if (selected) {
      baseClass += " border-l-[3px] border-l-primary";
    } else if (stripeColor) {
      baseClass += ` border-l-[4px]`;
    }

    // Hoverable lift and shadow
    if (hoverable) {
      baseClass += " hover:-translate-y-0.5 hover:shadow-md";
    }

    const classes = [baseClass, className].filter(Boolean).join(" ");
    const style = stripeColor ? { borderLeftColor: stripeColor } : undefined;

    return (
      <div
        ref={ref}
        className={classes}
        style={style}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
