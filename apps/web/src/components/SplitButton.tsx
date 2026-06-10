import React from "react";
import { MoreVertical } from "lucide-react";
import { Dropdown } from "./Dropdown";

interface SplitButtonProps {
  primaryLabel: React.ReactNode;
  onPrimaryClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  dropdownItems: React.ReactNode;
  dropdownWidthClass?: string;
  align?: "left" | "right";
  ariaLabel?: string;
}

export function SplitButton({
  primaryLabel,
  onPrimaryClick,
  disabled = false,
  isLoading = false,
  dropdownItems,
  dropdownWidthClass = "w-36",
  align = "right",
  ariaLabel = "More actions"
}: SplitButtonProps) {
  return (
    <div className="inline-flex items-center rounded-sm border border-border-warm divide-x divide-border-warm bg-surface-raised hover:border-primary/60 transition-all duration-150 shrink-0">
      <button
        disabled={disabled || isLoading}
        onClick={onPrimaryClick}
        className="px-3 py-1.5 text-[14px] font-body font-semibold text-text-primary hover:bg-stone-300/40 transition-colors cursor-pointer rounded-l-sm flex items-center justify-center h-8 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
      >
        {primaryLabel}
      </button>
      
      <Dropdown
        align={align}
        widthClass={dropdownWidthClass}
        trigger={
          <button
            disabled={disabled || isLoading}
            className="p-1.5 text-text-secondary hover:bg-stone-300/40 hover:text-text-primary transition-colors cursor-pointer rounded-r-sm flex items-center justify-center h-8 w-8 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
            aria-label={ariaLabel}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        }
      >
        {dropdownItems}
      </Dropdown>
    </div>
  );
}
