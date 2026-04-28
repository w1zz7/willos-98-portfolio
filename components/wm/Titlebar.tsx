"use client";

import { useRef } from "react";
import type { RefObject } from "react";
import { useWindowStore } from "@/lib/wm/store";
import { useDrag } from "@/lib/wm/useDrag";

interface TitlebarProps {
  windowId: string;
  title: string;
  iconUrl: string;
  isFocused: boolean;
  canMaximize: boolean;
  windowRef: RefObject<HTMLDivElement | null>;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}

export function Titlebar({
  windowId,
  title,
  iconUrl,
  isFocused,
  canMaximize,
  windowRef,
  onMinimize,
  onMaximize,
  onClose,
}: TitlebarProps) {
  const { onPointerDown, onPointerMove, onPointerUp } = useDrag(
    windowId,
    windowRef
  );

  const doubleTapRef = useRef<number>(0);
  const onDoubleClick = () => {
    if (!canMaximize) return;
    useWindowStore.getState().toggleMaximize(windowId);
  };

  return (
    <div
      className={`flex items-center h-[36px] px-[4px] select-none ${
        isFocused ? "win-titlebar-active" : "win-titlebar-inactive"
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      style={{ touchAction: "none", cursor: "default" }}
    >
      <div className="flex items-center gap-[8px] flex-1 min-w-0 px-[2px]">
        {iconUrl && (
          <img
            src={iconUrl}
            alt=""
            width={32}
            height={32}
            className="pixelated pointer-events-none shrink-0"
            style={{ imageRendering: "pixelated" }}
          />
        )}
        <span className="truncate font-bold text-[19px] leading-none tracking-tight">
          {title}
        </span>
      </div>
      <div className="flex items-center gap-[3px]" data-no-drag>
        <button
          className="win-title-btn"
          aria-label="Minimize"
          onClick={onMinimize}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="2" y="9" width="8" height="2.5" fill="#000" />
          </svg>
        </button>
        {canMaximize && (
          <button
            className="win-title-btn"
            aria-label="Maximize"
            onClick={onMaximize}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect
                x="1"
                y="1"
                width="10"
                height="10"
                fill="none"
                stroke="#000"
                strokeWidth="1.2"
              />
              <rect x="1" y="1" width="10" height="2.5" fill="#000" />
            </svg>
          </button>
        )}
        <button
          className="win-title-btn"
          aria-label="Close"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path
              d="M2 2 L10 10 M10 2 L2 10"
              stroke="#000"
              strokeWidth="1.8"
              strokeLinecap="square"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
