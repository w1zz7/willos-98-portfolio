"use client";

import { useEffect, useState } from "react";
import { useFullscreen } from "@/lib/wm/useFullscreen";

export function SystemTray() {
  const [time, setTime] = useState(() => formatTime(new Date()));
  const { isFullscreen, supported, toggle } = useFullscreen();

  useEffect(() => {
    const tick = () => setTime(formatTime(new Date()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="win-sunken flex items-stretch h-[36px] text-[18px] font-mono tracking-tight overflow-hidden">
      {supported && (
        <button
          type="button"
          onClick={toggle}
          aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
          title={
            isFullscreen
              ? "Exit full screen (Esc)"
              : "Enter full screen — run WillOS edge-to-edge"
          }
          className="flex items-center justify-center px-[8px] hover:bg-[rgba(0,0,0,0.06)] active:bg-[rgba(0,0,0,0.12)] cursor-pointer"
          style={{
            borderRight: "1px solid rgba(0,0,0,0.18)",
          }}
        >
          <FullscreenIcon active={isFullscreen} />
        </button>
      )}
      <span className="flex items-center px-[12px]">{time}</span>
    </div>
  );
}

function FullscreenIcon({ active }: { active: boolean }) {
  // 16x16 pixel-art "expand" / "contract" arrows.
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {active ? (
        // Inward arrows = "exit fullscreen"
        <g fill="#000">
          <rect x={2} y={2} width={4} height={1} />
          <rect x={2} y={2} width={1} height={4} />
          <rect x={2} y={5} width={3} height={1} />
          <rect x={5} y={2} width={1} height={3} />

          <rect x={10} y={2} width={4} height={1} />
          <rect x={13} y={2} width={1} height={4} />
          <rect x={11} y={5} width={3} height={1} />
          <rect x={10} y={2} width={1} height={3} />

          <rect x={2} y={13} width={4} height={1} />
          <rect x={2} y={10} width={1} height={4} />
          <rect x={2} y={10} width={3} height={1} />
          <rect x={5} y={11} width={1} height={3} />

          <rect x={10} y={13} width={4} height={1} />
          <rect x={13} y={10} width={1} height={4} />
          <rect x={11} y={10} width={3} height={1} />
          <rect x={10} y={11} width={1} height={3} />
        </g>
      ) : (
        // Outward arrows = "enter fullscreen"
        <g fill="#000">
          <rect x={1} y={1} width={5} height={1} />
          <rect x={1} y={1} width={1} height={5} />

          <rect x={10} y={1} width={5} height={1} />
          <rect x={14} y={1} width={1} height={5} />

          <rect x={1} y={14} width={5} height={1} />
          <rect x={1} y={10} width={1} height={5} />

          <rect x={10} y={14} width={5} height={1} />
          <rect x={14} y={10} width={1} height={5} />
        </g>
      )}
    </svg>
  );
}

function formatTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}
