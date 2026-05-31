import React from "react";

export interface AvatarProps {
  src?: string;
  fallback: string;
  size?: number;
}

export const Avatar: React.FC<AvatarProps> = ({ src, fallback, size = 32 }) => {
  return (
    <div
      className="rounded-full border-2 border-surface-warm bg-surface-raised flex items-center justify-center font-body font-semibold text-[14px] text-text-primary overflow-hidden shrink-0 select-none"
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      {src ? (
        <img src={src} alt="avatar" className="w-full h-full object-cover" />
      ) : (
        <span>{fallback}</span>
      )}
    </div>
  );
};
