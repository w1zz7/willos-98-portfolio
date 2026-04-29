"use client";

import type { WindowState } from "@/lib/wm/types";
import { useWindowStore } from "@/lib/wm/store";
import { openLink } from "@/lib/wm/openLink";

export default function AboutDialog({ window: win }: { window: WindowState }) {
  const close = () => useWindowStore.getState().closeWindow(win.id);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 p-[16px] flex gap-[12px]">
        <img
          src="/icons/info.svg"
          alt=""
          width={64}
          height={64}
          className="pixelated shrink-0 self-start"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="text-[20px] leading-relaxed">
          <div className="font-bold text-[19px]">WillOS 98</div>
          <div className="mb-[8px]">Version 2026.04 · Personal Portfolio Edition</div>
          <div className="mb-[4px]">
            Engineered by{" "}
            <button
              type="button"
              onClick={() => openLink("https://www.linkedin.com/in/willzhang6200")}
              className="text-[#0000ee] underline bg-transparent"
            >
              Will Zhang
            </button>
            .
          </div>
          <div className="text-[color:var(--color-win-text-disabled)]">
            Built with Next.js 15, React 19, TypeScript, Tailwind CSS, and a
            healthy respect for 1998.
          </div>
        </div>
      </div>
      <div className="border-t px-[10px] py-[8px] flex justify-end">
        <button type="button" className="win-btn" onClick={close}>
          OK
        </button>
      </div>
    </div>
  );
}
