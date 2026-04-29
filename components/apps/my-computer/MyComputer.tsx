"use client";

import type { WindowState } from "@/lib/wm/types";
import { openApp } from "@/lib/wm/registry";
import type { AppId } from "@/lib/wm/types";

interface Entry {
  label: string;
  icon: string;
  hint: string;
  onOpen?: () => void;
  appId?: AppId;
  props?: Record<string, unknown>;
}

const ENTRIES: Entry[] = [
  {
    label: "C:\\Experience",
    icon: "/icons/folder.svg",
    hint: "Roles, companies, dates",
    appId: "about",
  },
  {
    label: "C:\\Projects",
    icon: "/icons/folder.svg",
    hint: "Case studies and wins",
    appId: "projects",
  },
  {
    label: "C:\\Leadership",
    icon: "/icons/folder.svg",
    hint: "Campus roles and scope",
    appId: "leadership",
  },
  {
    label: "C:\\Skills",
    icon: "/icons/folder.svg",
    hint: "Stack and certifications",
    appId: "excel",
    props: { sheet: "skills" },
  },
  {
    label: "C:\\Metrics",
    icon: "/icons/folder.svg",
    hint: "Quantified impact",
    appId: "excel",
    props: { sheet: "metrics" },
  },
  {
    label: "C:\\Resume.pdf",
    icon: "/icons/pdf.svg",
    hint: "Resume viewer",
    appId: "resume",
  },
  {
    label: "C:\\Contact.txt",
    icon: "/icons/notepad.svg",
    hint: "Contact in retro notepad",
    appId: "contact",
  },
  {
    label: "C:\\Bulletproof AI",
    icon: "/icons/app-exe.svg",
    hint: "Case study",
    appId: "bulletproof",
  },
];

export default function MyComputer({ window: _ }: { window: WindowState }) {
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Address bar */}
      <div className="flex items-center gap-[4px] px-[4px] h-[22px] win-raised border-b border-[#808080]">
        <span className="text-[20px]">Address:</span>
        <div className="win-field flex-1 flex items-center px-[4px] text-[20px]">
          C:\
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0 overflow-auto win-scroll p-[10px] grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-[12px] content-start">
        {ENTRIES.map((e) => (
          <button
            key={e.label}
            type="button"
            className="flex flex-col items-center gap-[4px] p-[4px] hover:bg-[#e8e8e8] focus:outline focus:outline-1 focus:outline-dotted"
            onDoubleClick={() => {
              if (e.appId) openApp(e.appId, e.props);
              else e.onOpen?.();
            }}
            onClick={() => {
              // single click = select (no-op beyond focus)
            }}
          >
            <img
              src={e.icon}
              alt=""
              width={48}
              height={48}
              className="pixelated"
              style={{ imageRendering: "pixelated" }}
            />
            <span className="text-[20px] text-center leading-tight">
              {e.label}
            </span>
            <span className="text-[19px] text-center text-[color:var(--color-win-text-disabled)]">
              {e.hint}
            </span>
          </button>
        ))}
      </div>

      <div className="border-t border-[#808080] p-[4px] text-[19px] text-[color:var(--color-win-text-disabled)]">
        {ENTRIES.length} object(s). Double-click to open.
      </div>
    </div>
  );
}
