import React from "react";

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  checked?: boolean;
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ className = "", label, checked, id, ...props }, ref) => {
    const radioId = id || React.useId();

    return (
      <label htmlFor={radioId} className="inline-flex items-center cursor-pointer select-none group">
        <div className="relative">
          <input
            id={radioId}
            type="radio"
            ref={ref}
            checked={checked}
            className="sr-only peer"
            {...props}
          />
          {/* Custom Radio Circle */}
          <div className="w-5 h-5 rounded-full border border-border-warm bg-surface-warm transition-all duration-150 flex items-center justify-center
            peer-checked:border-primary
            peer-focus:ring-2 peer-focus:ring-primary/20
            group-hover:border-primary/60 peer-checked:group-hover:border-primary"
          >
            {/* Inner Dot */}
            <div className={`w-2.5 h-2.5 rounded-full bg-primary transition-all duration-150 ${
              checked ? "scale-100 block" : "scale-0 hidden"
            }`} />
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

Radio.displayName = "Radio";
