"use client";

import { useRef, useState } from "react";
import { openApp } from "@/lib/wm/registry";
import type { AppId } from "@/lib/wm/types";

interface DesktopIconProps {
  appId: AppId;
  label: string;
  iconUrl: string;
  props?: Record<string, unknown>;
}

export function DesktopIcon({
  appId,
  label,
  iconUrl,
  props,
}: DesktopIconProps) {
  const [selected, setSelected] = useState(false);
  const lastTapRef = useRef(0);

  const open = () => openApp(appId, props);

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(true);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    open();
  };

  // Touch: single-tap opens (no hover/select concept on mobile)
  const onTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTapRef.current < 400) {
      open();
    }
    lastTapRef.current = now;
    setSelected(true);
  };

  return (
    <button
      type="button"
      data-selected={selected}
      className="desktop-icon flex flex-col items-center gap-[6px] p-[8px] w-[128px] select-none group"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onTouchEnd={onTouchEnd}
      onBlur={() => setSelected(false)}
    >
      <div className="relative w-16 h-16 flex items-center justify-center">
        <img
          src={iconUrl}
          alt=""
          width={64}
          height={64}
          className="pixelated pointer-events-none"
          style={{
            imageRendering: "pixelated",
            filter: selected ? "url(#icon-select-filter)" : undefined,
          }}
        />
      </div>
      <span className="desktop-icon-label max-w-full break-words">{label}</span>
    </button>
  );
}
