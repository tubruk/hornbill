import React, { useState, useEffect } from "react";

export interface AvatarProps {
  src?: string;
  email?: string | null;
  fallback: string;
  size?: number;
}

export const Avatar: React.FC<AvatarProps> = ({ src, email, fallback, size = 32 }) => {
  const [avatarSrc, setAvatarSrc] = useState<string | undefined>(src);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setAvatarSrc(src);
    setHasError(false);
  }, [src]);

  useEffect(() => {
    if (src) return;

    if (!email) {
      setAvatarSrc(undefined);
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    let active = true;

    const computeHash = async () => {
      try {
        if (typeof crypto !== "undefined" && crypto.subtle) {
          const msgBuffer = new TextEncoder().encode(cleanEmail);
          const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
          if (active) {
            setAvatarSrc(`https://www.gravatar.com/avatar/${hashHex}?d=404`);
          }
        }
      } catch (err) {
        console.error("Failed to generate Gravatar hash", err);
      }
    };

    computeHash();

    return () => {
      active = false;
    };
  }, [email, src]);

  return (
    <div
      className="rounded-full border-2 border-surface-warm bg-surface-raised flex items-center justify-center font-body font-semibold text-[14px] text-text-primary overflow-hidden shrink-0 select-none"
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      {avatarSrc && !hasError ? (
        <img
          src={avatarSrc}
          alt="avatar"
          className="w-full h-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <span>{fallback}</span>
      )}
    </div>
  );
};

