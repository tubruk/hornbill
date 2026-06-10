import React, { useState, useRef, useEffect } from "react";

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  widthClass?: string;
}

export function Dropdown({ trigger, children, align = "right", widthClass = "w-44" }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const alignClass = align === "left" ? "left-0" : "right-0";

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)} className="flex">
        {trigger}
      </div>

      {isOpen && (
        <div 
          className={`absolute ${alignClass} mt-1.5 ${widthClass} bg-surface-raised border border-border-warm rounded-sm shadow-md py-1 z-20 animate-slideDown`}
          onClick={() => setIsOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "danger";
  children: React.ReactNode;
}

export function DropdownItem({ variant = "default", children, className = "", ...props }: DropdownItemProps) {
  const baseClass = "w-full text-left px-3.5 py-2 text-[13px] font-body font-semibold flex items-center gap-2.5 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const variantClass = variant === "danger"
    ? "text-error hover:bg-red-50/50"
    : "text-text-primary hover:bg-stone-300/40";

  return (
    <button
      className={`${baseClass} ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
