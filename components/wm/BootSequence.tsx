"use client";

import { useEffect } from "react";
import { useWindowStore } from "@/lib/wm/store";

/**
 * Ultra-short boot "curtain". 400ms total - just a visual handoff from
 * page-white to Win98-teal, then gone. No click-to-skip, no loading bar,
 * no bloat. The real hero (the Excel workbook) is what users are here to see.
 */
const DURATION = 400;

export function BootSequence() {
  const bootComplete = useWindowStore((s) => s.bootComplete);
  const setBootComplete = useWindowStore.getState().setBootComplete;

  useEffect(() => {
    if (bootComplete) return;
    const id = window.setTimeout(() => setBootComplete(), DURATION);
    return () => window.clearTimeout(id);
  }, [bootComplete, setBootComplete]);

  if (bootComplete) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center pointer-events-none"
      style={{
        background: "#000",
        animation: `boot-fade ${DURATION}ms ease-out forwards`,
      }}
      aria-hidden
    >
      <div
        className="text-white tracking-widest"
        style={{
          fontFamily: "var(--font-chrome)",
          fontSize: 22,
          opacity: 0.8,
        }}
      >
        Will<span style={{ color: "#ffcc00" }}>OS</span>
        <span style={{ color: "#66ccff" }}>98</span>
      </div>
      <style>{`
        @keyframes boot-fade {
          0% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; visibility: hidden; }
        }
      `}</style>
    </div>
  );
}
