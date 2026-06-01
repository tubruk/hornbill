import React from "react";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  helperText?: string;
  error?: boolean;
  errorText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, helperText, error, errorText, disabled, id, ...props }, ref) => {
    const fallbackId = React.useId();
    const inputId = id || fallbackId;

    // Base input classes
    let inputClasses = "w-full bg-surface-warm rounded-sm p-3 text-[16px] font-body transition-all duration-150 outline-none border border-border-warm";

    // Dynamic state classes based on error/disabled/default
    if (error) {
      inputClasses += " border-error focus:ring-3 focus:ring-error/12";
    } else if (disabled) {
      inputClasses += " bg-surface-raised opacity-50 cursor-not-allowed";
    } else {
      inputClasses += " focus:border-primary focus:ring-3 focus:ring-primary/12 text-text-primary";
    }

    return (
      <div className="w-full flex flex-col items-start">
        {label && (
          <label
            htmlFor={inputId}
            className="font-body text-[14px] font-semibold text-text-primary mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          disabled={disabled}
          className={`${inputClasses} ${className}`}
          {...props}
        />
        {error && errorText && (
          <span className="font-body text-[12px] text-error mt-1.5 font-medium">
            {errorText}
          </span>
        )}
        {!error && helperText && (
          <span className="font-body text-[12px] text-neutral-muted mt-1.5">
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
