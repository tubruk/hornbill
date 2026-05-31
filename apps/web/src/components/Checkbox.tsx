import React from "react";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = "", label, checked, id, ...props }, ref) => {
    const checkboxId = id || React.useId();

    return (
      <label htmlFor={checkboxId} className="inline-flex items-center cursor-pointer select-none group">
        <div className="relative">
          <input
            id={checkboxId}
            type="checkbox"
            ref={ref}
            checked={checked}
            className="sr-only peer"
            {...props}
          />
          {/* Custom Checkbox Box with 8px radius */}
          <div className="w-5 h-5 rounded-sm border border-border-warm bg-surface-warm transition-all duration-150 flex items-center justify-center
            peer-checked:bg-primary peer-checked:border-primary
            peer-focus:ring-2 peer-focus:ring-primary/20
            group-hover:border-primary/60 peer-checked:group-hover:border-primary"
          >
            {/* White Checkmark Icon */}
            <svg
              className={`w-3.5 h-3.5 text-white transition-transform duration-150 ${
                checked ? "scale-100 block" : "scale-0 hidden"
              }`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>
        {label && (
          <span className="font-body text-[16px] text-text-primary pl-2.5 leading-none">
            {label}
          </span>
        )}
      </label>
    );
  }
);

Checkbox.displayName = "Checkbox";
