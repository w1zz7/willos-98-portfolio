"use client";

import { useRef } from "react";
import { useExcelStore } from "@/lib/excel/store";
import type { SheetData } from "@/lib/excel/types";

export function SheetTabs({ sheets }: { sheets: SheetData[] }) {
  const active = useExcelStore((s) => s.activeSheet);
  const setActive = useExcelStore((s) => s.setActiveSheet);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeIdx = sheets.findIndex((s) => s.id === active);

  const go = (idx: number) => {
    const clamped = Math.max(0, Math.min(sheets.length - 1, idx));
    setActive(sheets[clamped].id);
  };

  return (
    <div className="flex items-end h-[32px] win-raised border-t border-[#808080] pl-[6px] pt-[2px] gap-0">
      {/* Scroll arrows - now actually cycle sheets */}
      <div className="flex items-center gap-[2px] pr-[6px] pb-[4px] text-[20px]">
        <button
          type="button"
          className="win-btn w-[24px] h-[24px] min-w-0 p-0"
          aria-label="First sheet"
          title="First sheet"
          onClick={() => go(0)}
          disabled={activeIdx === 0}
        >
          ◀◀
        </button>
        <button
          type="button"
          className="win-btn w-[24px] h-[24px] min-w-0 p-0"
          aria-label="Previous sheet"
          title="Previous sheet"
          onClick={() => go(activeIdx - 1)}
          disabled={activeIdx <= 0}
        >
          ◀
        </button>
        <button
          type="button"
          className="win-btn w-[24px] h-[24px] min-w-0 p-0"
          aria-label="Next sheet"
          title="Next sheet"
          onClick={() => go(activeIdx + 1)}
          disabled={activeIdx >= sheets.length - 1}
        >
          ▶
        </button>
        <button
          type="button"
          className="win-btn w-[24px] h-[24px] min-w-0 p-0"
          aria-label="Last sheet"
          title="Last sheet"
          onClick={() => go(sheets.length - 1)}
          disabled={activeIdx === sheets.length - 1}
        >
          ▶▶
        </button>
      </div>
      {/* Tabs */}
      <div ref={scrollRef} className="flex items-end overflow-x-auto win-scroll flex-1">
        {sheets.map((s) => (
          <button
            key={s.id}
            type="button"
            data-active={s.id === active}
            className="excel-tab"
            onClick={() => setActive(s.id)}
          >
            {s.title}
          </button>
        ))}
      </div>
    </div>
  );
}
