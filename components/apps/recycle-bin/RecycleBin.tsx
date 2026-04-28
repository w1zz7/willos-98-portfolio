"use client";

import type { WindowState } from "@/lib/wm/types";
import { useState } from "react";
import { openApp } from "@/lib/wm/registry";

interface TrashItem {
  name: string;
  size: string;
  deleted: string;
  contents: string;
}

const JOKES: TrashItem[] = [
  {
    name: "business_ideas_v3_final_FINAL.doc",
    size: "42 KB",
    deleted: "Apr 2024",
    contents:
      "- NFT marketplace for golf bags (no).\n- Uber but for flashcards (also no).\n- AI that summarizes other AIs summarizing AIs (warmer).",
  },
  {
    name: "first-mvp-that-didnt-ship.ts",
    size: "8 KB",
    deleted: "Dec 2024",
    contents:
      "// TODO: stop refactoring, ship the thing.\n// note-to-self: you have not, in fact, shipped the thing.",
  },
  {
    name: "pitch_deck_that_was_too_long.pptx",
    size: "14 MB",
    deleted: "Feb 2025",
    contents:
      "Slide 1: WHY NOW?\nSlides 2-47: also WHY NOW?\n(the judges did not care)",
  },
  {
    name: "TODO_2026_Q2.txt",
    size: "2 KB",
    deleted: "last week",
    contents:
      "[x] ship PhilAIsion\n[x] win CodeFest\n[x] update resume\n[ ] sleep",
  },
  {
    name: "CS101_perfectionism_trap.bak",
    size: "1 KB",
    deleted: "long ago",
    contents: "the only real antidote was building and shipping.",
  },
];

export default function RecycleBin({ window: _ }: { window: WindowState }) {
  const [empty, setEmpty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showEmptyDialog, setShowEmptyDialog] = useState(false);

  const items = empty ? [] : JOKES;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="flex items-center flex-wrap gap-[4px] px-[4px] py-[4px] min-h-[40px] win-raised border-b border-[#808080]">
        <button
          type="button"
          className="win-btn h-[30px] min-w-0 px-[8px] text-[16px] shrink-0"
          onClick={() => setShowEmptyDialog(true)}
          disabled={empty}
          title="Empty Recycle Bin"
        >
          🗑 Empty Recycle Bin
        </button>
        <button
          type="button"
          className="win-btn h-[30px] min-w-0 px-[8px] text-[16px] shrink-0"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            alert(
              `"${selected}" has been restored to its original location.\n(Just kidding - these were deleted on purpose.)`
            );
          }}
          title="Restore selected item"
        >
          ↺ Restore
        </button>
        <button
          type="button"
          className="win-btn h-[30px] min-w-0 px-[8px] text-[16px] shrink-0"
          onClick={() => openApp("my-computer")}
          title="Open My Computer"
        >
          📂 My Computer
        </button>
        <div className="flex-1 min-w-[8px]" />
        <span className="text-[16px] italic text-[color:var(--color-win-text-disabled)] shrink-0">
          {empty
            ? "Empty - nothing to confess here."
            : `${items.length} item(s) deleted on purpose.`}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto win-scroll">
        {items.length === 0 ? (
          <div className="p-[24px] text-center text-[18px] text-[color:var(--color-win-text-disabled)]">
            Recycle Bin is empty.
            <br />
            <button
              type="button"
              className="win-btn mt-[10px]"
              onClick={() => setEmpty(false)}
            >
              Undo Empty
            </button>
          </div>
        ) : (
          <table className="w-full text-[16px]" style={{ tableLayout: "auto" }}>
            <thead className="sticky top-0 bg-[color:var(--color-win-bg)]">
              <tr>
                <th className="text-left px-[6px] py-[4px] border-b border-[#808080] font-normal whitespace-nowrap">
                  Name
                </th>
                <th className="text-left px-[6px] py-[4px] border-b border-[#808080] font-normal whitespace-nowrap" style={{ width: 70 }}>
                  Size
                </th>
                <th className="text-left px-[6px] py-[4px] border-b border-[#808080] font-normal whitespace-nowrap" style={{ width: 90 }}>
                  Deleted
                </th>
                <th className="text-left px-[6px] py-[4px] border-b border-[#808080] font-normal whitespace-nowrap">
                  Truth
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((j) => (
                <tr
                  key={j.name}
                  className={`hover:bg-[#e8e8e8] align-top cursor-pointer ${
                    selected === j.name ? "bg-[color:var(--color-select-blue)] text-white" : ""
                  }`}
                  onClick={() => setSelected(j.name)}
                  onDoubleClick={() =>
                    alert(`${j.name}\n\n${j.contents}`)
                  }
                >
                  <td className="px-[6px] py-[4px]">
                    <div className="flex items-center gap-[6px]">
                      <img
                        src="/icons/default.svg"
                        alt=""
                        width={24}
                        height={24}
                        className="pixelated shrink-0"
                        style={{ imageRendering: "pixelated" }}
                      />
                      <span className="truncate" style={{ maxWidth: 240 }} title={j.name}>
                        {j.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-[6px] py-[4px] whitespace-nowrap">{j.size}</td>
                  <td className="px-[6px] py-[4px] whitespace-nowrap">{j.deleted}</td>
                  <td
                    className="px-[6px] py-[4px] whitespace-pre-wrap"
                    style={{ maxWidth: 280 }}
                  >
                    {j.contents}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showEmptyDialog && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.2)" }}
          onClick={() => setShowEmptyDialog(false)}
        >
          <div
            className="win-window p-[2px] max-w-[380px] flex flex-col"
            style={{ background: "var(--color-win-bg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="win-titlebar-active flex items-center h-[28px] px-[6px] text-[16px] font-bold">
              Confirm Empty Recycle Bin
            </div>
            <div className="p-[12px] text-[16px] flex gap-[10px] items-start">
              <img
                src="/icons/info.svg"
                alt=""
                width={44}
                height={44}
                style={{ imageRendering: "pixelated" }}
                className="pixelated shrink-0"
              />
              <div>
                Are you sure you want to delete {items.length} item(s)?
                <br />
                <span className="text-[color:var(--color-win-text-disabled)] italic">
                  These aren't real files - just jokes about past mistakes. But OK.
                </span>
              </div>
            </div>
            <div className="p-[8px] flex justify-end gap-[6px] border-t border-[#808080]">
              <button
                type="button"
                className="win-btn"
                onClick={() => setShowEmptyDialog(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="win-btn font-bold"
                onClick={() => {
                  setEmpty(true);
                  setSelected(null);
                  setShowEmptyDialog(false);
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
