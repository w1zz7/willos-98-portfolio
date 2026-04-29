"use client";

import { useEffect, useMemo } from "react";
import type { WindowState } from "@/lib/wm/types";
import { useExcelStore } from "@/lib/excel/store";
import { SHEETS, SHEETS_BY_ID } from "@/data/excel";
import { Toolbar } from "./Toolbar";
import { FormulaBar } from "./FormulaBar";
import { Sheet } from "./Sheet";
import { SheetTabs } from "./SheetTabs";
import { StatusBar } from "./StatusBar";
import { showToast } from "@/components/primitives/Toast";

export default function Excel({ window: win }: { window: WindowState }) {
  const activeSheet = useExcelStore((s) => s.activeSheet);
  const setActiveSheet = useExcelStore((s) => s.setActiveSheet);

  // If window was opened with props.sheet, deep-link to that sheet
  useEffect(() => {
    const requested = (win.props?.sheet as string | undefined) ?? undefined;
    if (requested && SHEETS_BY_ID[requested] && requested !== activeSheet) {
      setActiveSheet(requested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.props?.sheet]);

  const sheet = useMemo(
    () => SHEETS_BY_ID[activeSheet] ?? SHEETS[0],
    [activeSheet]
  );

  const handleShare = async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied to clipboard");
    } catch {
      showToast("Couldn't copy - select the address bar instead");
    }
  };

  return (
    <div className="flex flex-col h-full w-full min-w-0 bg-white overflow-hidden">
      {/* Slim action bar - title + Share link. */}
      <div className="win-raised flex items-center gap-[8px] px-[8px] py-[5px] border-b border-[#808080]">
        <span className="text-[18px] font-bold truncate flex-1 min-w-0">
          WillZhang.xlsx - updated April 2026
        </span>
        <button
          type="button"
          className="win-btn h-[30px] min-w-0 px-[12px] text-[20px] shrink-0 whitespace-nowrap"
          onClick={handleShare}
          title="Copy shareable link to clipboard"
        >
          🔗 Share
        </button>
      </div>
      <Toolbar />
      <FormulaBar sheet={sheet} />
      <Sheet key={sheet.id} sheet={sheet} />
      <SheetTabs sheets={SHEETS} />
      <StatusBar sheet={sheet} />
    </div>
  );
}
