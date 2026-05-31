import React from "react";

export interface ProgressProps {
  value: number; // percentage (0 to 100)
  label?: string;
}

export const Progress: React.FC<ProgressProps> = ({ value, label }) => {
  const percentage = Math.max(0, Math.min(100, value));

  return (
    <div className="w-full flex flex-col">
      <div className="flex justify-between items-center mb-1.5 text-[14px] text-text-secondary">
        {label && <span className="font-semibold">{label}</span>}
        <span className="font-mono">{percentage}%</span>
      </div>
      <div className="h-1 w-full bg-[#E7E5E4] rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
