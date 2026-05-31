import React from "react";

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "category" | "status";
  severity?: "success" | "warning" | "error" | "info";
  active?: boolean;
}

export const Chip: React.FC<ChipProps> = ({
  className = "",
  variant = "category",
  severity = "success",
  active = false,
  children,
  ...props
}) => {
  // Base classes
  const baseClass = "inline-flex items-center justify-center rounded-pill text-[12px] font-semibold tracking-wide uppercase px-3.5 py-1.5 transition-all select-none";

  let variantClass = "";
  if (variant === "category") {
    if (active) {
      variantClass = "bg-primary text-white cursor-pointer";
    } else {
      variantClass = "bg-surface-raised text-text-secondary hover:bg-stone-300 cursor-pointer";
    }
  } else if (variant === "status") {
    if (severity === "success") {
      variantClass = "bg-[#DCFCE7] text-[#166534]";
    } else if (severity === "warning") {
      variantClass = "bg-[#FEF3C7] text-[#92400E]";
    } else if (severity === "error") {
      variantClass = "bg-[#FEE2E2] text-[#991B1B]";
    } else if (severity === "info") {
      variantClass = "bg-[#DBEAFE] text-[#1E40AF]";
    }
  }

  const classes = [baseClass, variantClass, className].filter(Boolean).join(" ");

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  );
};
