"use client";

import { useEffect } from "react";
import type { WindowState } from "@/lib/wm/types";

/**
 * Classic Win98 "It is now safe to turn off your computer" screen.
 * Rendered as a full-viewport overlay instead of a small window, so it
 * takes over the whole screen for the joke effect.
 */
export default function ShutdownScreen({ window: _ }: { window: WindowState }) {
  useEffect(() => {
    // Lock scroll on body while this is up (already locked, but safe)
    return () => {};
  }, []);

  return (
    <ShutdownOverlay />
  );
}

function ShutdownOverlay() {
  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center cursor-pointer"
      style={{ background: "#000" }}
      onClick={() => location.reload()}
    >
      <div
        className="text-center px-[40px] py-[30px]"
        style={{
          fontFamily: "var(--font-chrome)",
        }}
      >
        <div
          className="font-bold mb-[16px]"
          style={{
            color: "#ffb800",
            fontSize: "22px",
            letterSpacing: "0.5px",
          }}
        >
          It's now safe to turn off
          <br />
          your computer.
        </div>
        <div className="text-white/60 text-[20px] mt-[30px]">
          Click anywhere to reboot.
        </div>
      </div>
    </div>
  );
}
