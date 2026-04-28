"use client";

import { useEffect, useRef } from "react";
import { START_MENU } from "@/data/apps";
import { openApp } from "@/lib/wm/registry";
import { useFullscreen } from "@/lib/wm/useFullscreen";

export function StartMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        // Also ignore clicks on the Start button itself (it handles its own toggle)
        const target = e.target as HTMLElement;
        if (target.closest("[aria-haspopup='menu']")) return;
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="win-window absolute bottom-[44px] left-0 w-[340px] p-[4px] flex z-[10000]"
      role="menu"
    >
      {/* Vertical banner */}
      <div
        className="w-[32px] flex items-end justify-center pb-[12px]"
        style={{
          background:
            "linear-gradient(180deg, #000080 0%, #000080 60%, #808080 100%)",
        }}
      >
        <div
          className="text-white font-bold"
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: "20px",
            letterSpacing: "1.4px",
          }}
        >
          WillOS <span className="text-[#ffff80]">98</span>
        </div>
      </div>

      {/* Menu items */}
      <div className="flex-1 flex flex-col">
        {START_MENU.map((item, i) =>
          item.separator ? (
            <div
              key={`sep-${i}`}
              className="my-[4px] mx-[4px] h-[2px]"
              style={{
                boxShadow: "inset 0 1px 0 #808080, inset 0 -1px 0 #ffffff",
              }}
            />
          ) : (
            <button
              key={i}
              type="button"
              className="flex items-center gap-[12px] px-[8px] py-[7px] text-left hover:bg-[color:var(--color-select-blue)] hover:text-white"
              onClick={() => {
                onClose();
                if (item.action === "shutdown") {
                  openApp("shutdown");
                } else if (item.action === "about-dialog") {
                  openApp("about-dialog");
                } else if (item.action === "fullscreen") {
                  fullscreen.toggle();
                } else if (item.appId) {
                  openApp(item.appId, item.props);
                }
              }}
            >
              <img
                src={item.iconUrl}
                alt=""
                width={38}
                height={38}
                className="pixelated shrink-0"
                style={{ imageRendering: "pixelated" }}
              />
              <span className="text-[19px]">{item.label}</span>
            </button>
          )
        )}
      </div>
    </div>
  );
}
