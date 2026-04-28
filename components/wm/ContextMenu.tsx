"use client";

import { useEffect, useRef, useState } from "react";
import { openApp } from "@/lib/wm/registry";

interface Pos {
  x: number;
  y: number;
}

export function DesktopContextMenu() {
  const [pos, setPos] = useState<Pos | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-desktop-icon]") || target.closest(".win-window")) return;
      if (!target.closest("[data-desktop-surface]")) return;
      e.preventDefault();
      setPos({ x: e.clientX, y: e.clientY });
    };
    const onClick = () => setPos(null);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  if (!pos) return null;

  const items: Array<
    | { label: string; onClick: () => void; disabled?: boolean }
    | { separator: true }
  > = [
    { label: "Open About Me", onClick: () => openApp("about") },
    { label: "Open WillZhang.xlsx", onClick: () => openApp("excel") },
    { separator: true },
    { label: "View ▸", onClick: () => {}, disabled: true },
    { label: "Arrange Icons ▸", onClick: () => {}, disabled: true },
    { label: "Refresh", onClick: () => location.reload() },
    { separator: true },
    { label: "Properties", onClick: () => openApp("about-dialog") },
  ];

  return (
    <div
      ref={ref}
      className="win-window absolute p-[2px] min-w-[180px] z-[10001]"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((it, i) =>
        "separator" in it ? (
          <div
            key={i}
            className="my-[2px] mx-[4px] h-[2px]"
            style={{
              boxShadow: "inset 0 1px 0 #808080, inset 0 -1px 0 #ffffff",
            }}
          />
        ) : (
          <button
            key={i}
            type="button"
            disabled={it.disabled}
            className="block w-full text-left px-[12px] py-[2px] text-[14px] hover:bg-[color:var(--color-select-blue)] hover:text-white disabled:text-[color:var(--color-win-text-disabled)] disabled:hover:bg-transparent disabled:hover:text-[color:var(--color-win-text-disabled)]"
            onClick={() => {
              setPos(null);
              it.onClick();
            }}
          >
            {it.label}
          </button>
        )
      )}
    </div>
  );
}
