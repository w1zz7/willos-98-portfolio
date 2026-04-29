"use client";

import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useWindowStore, selectVisibleTaskbarWindows } from "@/lib/wm/store";
import { SystemTray } from "./SystemTray";
import { StartMenu } from "./StartMenu";

export function Taskbar() {
  const [startOpen, setStartOpen] = useState(false);
  const windows = useWindowStore(useShallow(selectVisibleTaskbarWindows));
  const focusedId = useWindowStore((s) => s.focusedId);
  const { focusWindow, minimizeWindow, restoreWindow } = useWindowStore.getState();

  return (
    <div className="win-raised fixed bottom-0 left-0 right-0 h-[44px] flex items-center gap-[5px] px-[4px] z-[9999]">
      <StartButton open={startOpen} onToggle={() => setStartOpen((v) => !v)} />

      <div className="flex-1 flex items-center gap-[4px] h-full py-[4px] overflow-x-auto win-scroll">
        {windows.map((w) => {
          const isActive = focusedId === w.id && !w.isMinimized;
          return (
            <button
              key={w.id}
              type="button"
              data-pressed={isActive}
              className={`win-btn flex-1 min-w-[130px] max-w-[220px] justify-start gap-[8px] overflow-hidden h-[36px] text-left`}
              style={{ boxShadow: isActive ? "var(--shadow-sunken)" : "var(--shadow-raised)" }}
              onClick={() => {
                if (w.isMinimized) {
                  restoreWindow(w.id);
                } else if (isActive) {
                  minimizeWindow(w.id);
                } else {
                  focusWindow(w.id);
                }
              }}
            >
              {w.iconUrl && (
                <img
                  src={w.iconUrl}
                  alt=""
                  width={30}
                  height={30}
                  className="pixelated shrink-0"
                  style={{ imageRendering: "pixelated" }}
                />
              )}
              <span className="truncate text-[19px]">{w.title}</span>
            </button>
          );
        })}
      </div>

      <SystemTray />

      {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}
    </div>
  );
}

function StartButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-pressed={open}
      className="win-btn h-[36px] gap-[8px] min-w-0 px-[10px] font-bold"
      onClick={onToggle}
      aria-haspopup="menu"
      aria-expanded={open}
    >
      <img
        src="/icons/start-flag.svg"
        alt=""
        width={30}
        height={30}
        className="pixelated"
        style={{ imageRendering: "pixelated" }}
      />
      <span className="pr-[2px]">Start</span>
    </button>
  );
}
