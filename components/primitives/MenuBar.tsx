"use client";

import { useEffect, useRef, useState } from "react";

export interface MenuItem {
  label?: string;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
}

export interface MenuDef {
  label: string;
  mnemonic?: string;
  items: MenuItem[];
}

/**
 * Reusable Win98-style menu bar. Every menu entry renders a dropdown with
 * actions. Used by IE, Notepad, and other apps to give authentic File/Edit/…
 * menu behavior with real functionality (no silent no-ops).
 */
export function MenuBar({ menus }: { menus: MenuDef[] }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenu]);

  return (
    <div ref={ref} className="win-raised flex h-[30px] items-stretch border-b border-[#808080] px-[3px] shrink-0">
      {menus.map((m) => (
        <button
          key={m.label}
          type="button"
          data-open={openMenu === m.label}
          className="win-menu-item relative flex items-center"
          onClick={() =>
            setOpenMenu((cur) => (cur === m.label ? null : m.label))
          }
          onMouseEnter={() => {
            if (openMenu) setOpenMenu(m.label);
          }}
        >
          {m.mnemonic ? (
            <>
              <span className="win-mnemonic">{m.mnemonic}</span>
              {m.label.replace(m.mnemonic, "")}
            </>
          ) : (
            m.label
          )}
          {openMenu === m.label && (
            <div
              className="win-window absolute top-full left-0 min-w-[240px] p-[3px] text-left z-30"
              onClick={(e) => e.stopPropagation()}
            >
              {m.items.map((item, i) =>
                item.separator ? (
                  <div
                    key={i}
                    className="my-[3px] mx-[4px] h-[2px]"
                    style={{
                      boxShadow:
                        "inset 0 1px 0 #808080, inset 0 -1px 0 #ffffff",
                    }}
                  />
                ) : (
                  <button
                    key={i}
                    type="button"
                    disabled={item.disabled}
                    className="block w-full text-left px-[14px] py-[5px] text-[18px] hover:bg-[color:var(--color-select-blue)] hover:text-white disabled:text-[color:var(--color-win-text-disabled)] disabled:hover:bg-transparent disabled:hover:text-[color:var(--color-win-text-disabled)]"
                    onClick={() => {
                      setOpenMenu(null);
                      item.action?.();
                    }}
                  >
                    {item.label}
                  </button>
                )
              )}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
