"use client";

import type { WindowState } from "@/lib/wm/types";
import { useWindowStore } from "@/lib/wm/store";
import { openApp } from "@/lib/wm/registry";

export default function WelcomeDialog({ window: win }: { window: WindowState }) {
  const closeWindow = useWindowStore.getState().closeWindow;
  const close = () => closeWindow(win.id);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 p-[16px] flex gap-[16px]">
        <img
          src="/icons/info.svg"
          alt=""
          width={56}
          height={56}
          className="pixelated shrink-0"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="text-[20px] leading-relaxed">
          <div className="font-bold text-[20px] mb-[6px]">
            Welcome to WillOS 98 - Will Zhang's portfolio.
          </div>
          <p className="mb-[6px]">
            Start with{" "}
            <button
              type="button"
              className="text-[#0000ee] underline"
              onClick={() => {
                close();
                openApp("excel");
              }}
            >
              WillZhang.xlsx
            </button>{" "}
            - an interactive workbook covering experience, projects, leadership,
            skills, and impact metrics.
          </p>
          <p className="mb-[6px]">
            Double-click any icon on the desktop, or use the{" "}
            <span className="font-bold">Start</span> menu in the corner.
            Everything is draggable, resizable, and keyboard-friendly.
          </p>
          <p className="text-[color:var(--color-win-text-disabled)]">
            Sounds are muted by default. Toggle via the speaker icon in the
            system tray.
          </p>
        </div>
      </div>
      <div className="border-t px-[10px] py-[8px] flex justify-end gap-[6px]">
        <button
          type="button"
          className="win-btn"
          onClick={() => {
            close();
            openApp("excel");
          }}
        >
          Open WillZhang.xlsx
        </button>
        <button type="button" className="win-btn" onClick={close}>
          Close
        </button>
      </div>
    </div>
  );
}
