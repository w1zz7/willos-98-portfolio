"use client";

import { useEffect, useRef, useState } from "react";
import { openApp } from "@/lib/wm/registry";
import { useWindowStore } from "@/lib/wm/store";
import { useExcelStore } from "@/lib/excel/store";
import { showToast } from "@/components/primitives/Toast";
import { SHEETS, SHEETS_BY_ID } from "@/data/excel";

const MENUS = [
  { label: "File", mnemonic: "F" },
  { label: "Edit", mnemonic: "E" },
  { label: "View", mnemonic: "V" },
  { label: "Insert", mnemonic: "I" },
  { label: "Format", mnemonic: "O" },
  { label: "Tools", mnemonic: "T" },
  { label: "Data", mnemonic: "D" },
  { label: "Window", mnemonic: "W" },
  { label: "Help", mnemonic: "H" },
];

interface MenuItemDef {
  label?: string;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
}

function arrangeAll() {
  const { windows, order, focusWindow } = useWindowStore.getState();
  const visibleIds = order.filter((id) => {
    const w = windows[id];
    return w && !w.isMinimized && !w.hideFromTaskbar;
  });
  if (visibleIds.length === 0) return;
  const cols = Math.ceil(Math.sqrt(visibleIds.length));
  const rows = Math.ceil(visibleIds.length / cols);
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight - 30;
  const cellW = Math.floor(viewportW / cols);
  const cellH = Math.floor(viewportH / rows);
  visibleIds.forEach((id, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    useWindowStore.getState().updateWindow(id, {
      position: { x: c * cellW, y: r * cellH },
      size: { w: cellW, h: cellH },
      isMaximized: false,
    });
  });
  if (visibleIds.length > 0) focusWindow(visibleIds[visibleIds.length - 1]);
}

function copySelectedCellValue() {
  const { selectedCell } = useExcelStore.getState();
  try {
    navigator.clipboard?.writeText(selectedCell);
  } catch {
    /* clipboard blocked */
  }
}

function closeFocusedWindow() {
  const { focusedId, closeWindow } = useWindowStore.getState();
  if (focusedId) closeWindow(focusedId);
}

function goToSheet(id: string) {
  useExcelStore.getState().setActiveSheet(id);
}

const MENU_ITEMS: Record<string, MenuItemDef[]> = {
  File: [
    { label: "Download WillZhang.xlsx (real Excel file)", action: downloadWorkbookXlsx },
    { label: "Save resume as PDF", action: triggerResumeDownload },
    { separator: true },
    { label: "Open Resume.pdf viewer", action: () => openApp("resume") },
    { label: "Open My Computer", action: () => openApp("my-computer") },
    { separator: true },
    { label: "Print (download resume)", action: triggerResumeDownload },
    { separator: true },
    { label: "Close", action: closeFocusedWindow },
    { label: "Exit", action: closeFocusedWindow },
  ],
  Edit: [
    { label: "Copy cell reference", action: copySelectedCellValue },
    { label: "Find → go to Metrics sheet", action: () => goToSheet("metrics") },
    { separator: true },
    { label: "Cut", disabled: true },
    { label: "Paste", disabled: true },
  ],
  View: [
    { label: "Formula Bar ✓", disabled: true },
    { label: "Status Bar ✓", disabled: true },
    { separator: true },
    { label: "Zoom to Fit", disabled: true },
  ],
  Insert: [
    {
      label: "Chart → jump to Metrics",
      action: () => goToSheet("metrics"),
    },
    {
      label: "Hyperlink → open LinkedIn (real tab)",
      action: () =>
        window.open(
          "https://www.linkedin.com/in/willzhang6200",
          "_blank",
          "noopener"
        ),
    },
  ],
  Format: [{ label: "Cells...", disabled: true }],
  Tools: [
    {
      label: "Macros → open Start menu",
      action: () => {
        // Nudge - nothing actually opens here, just humor
        openApp("about-dialog");
      },
    },
  ],
  Data: [
    {
      label: "Sort → jump to Overview",
      action: () => goToSheet("overview"),
    },
    {
      label: "Pivot → jump to Metrics",
      action: () => goToSheet("metrics"),
    },
  ],
  Window: [
    { label: "Arrange All", action: arrangeAll },
    { label: "New Window (Projects)", action: () => openApp("projects") },
  ],
  Help: [
    { label: "About WillOS 98", action: () => openApp("about-dialog") },
    { label: "Meet Will Zhang", action: () => openApp("about") },
  ],
};

function triggerResumeDownload() {
  const a = document.createElement("a");
  a.href = "/resume.pdf";
  a.download = "WillZhang-Resume.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function downloadWorkbookXlsx() {
  try {
    showToast("Building WillZhang.xlsx…");
    const { downloadWorkbook } = await import("@/lib/excel/export");
    await downloadWorkbook(SHEETS, SHEETS_BY_ID, "WillZhang.xlsx");
    showToast("Downloaded - opens in real Excel");
  } catch (err) {
    console.error(err);
    showToast("Download failed - try again");
  }
}

/* Pixel-art 16x16 SVG icons - replace the emoji toolbar with period-authentic glyphs. */
type IconFC = (props: { className?: string }) => React.ReactElement;

const IcoNew: IconFC = ({ className }) => (
  <svg width="22" height="22" viewBox="0 0 16 16" className={className} shapeRendering="crispEdges">
    <path d="M3 1 L10 1 L13 4 L13 15 L3 15 Z" fill="#fff" stroke="#000" />
    <path d="M10 1 L10 4 L13 4 Z" fill="#c0c0c0" stroke="#000" />
    <line x1="5" y1="7" x2="11" y2="7" stroke="#888" />
    <line x1="5" y1="9" x2="11" y2="9" stroke="#888" />
    <line x1="5" y1="11" x2="9" y2="11" stroke="#888" />
  </svg>
);

const IcoOpen: IconFC = ({ className }) => (
  <svg width="22" height="22" viewBox="0 0 16 16" className={className} shapeRendering="crispEdges">
    <path d="M1 5 L5 5 L7 7 L15 7 L15 13 L1 13 Z" fill="#fcd456" stroke="#000" />
    <path d="M1 5 L5 5 L7 7 L15 7 L15 8 L1 8 Z" fill="#e5a92a" stroke="#000" />
  </svg>
);

const IcoSave: IconFC = ({ className }) => (
  <svg width="22" height="22" viewBox="0 0 16 16" className={className} shapeRendering="crispEdges">
    <rect x="1" y="1" width="14" height="14" fill="#4b6eaf" stroke="#000" />
    <rect x="3" y="1" width="10" height="5" fill="#f1f1f1" stroke="#000" />
    <rect x="10" y="2" width="2" height="3" fill="#1a1a1a" />
    <rect x="3" y="8" width="10" height="7" fill="#dcdcdc" stroke="#000" />
    <line x1="5" y1="10" x2="11" y2="10" stroke="#888" />
    <line x1="5" y1="12" x2="11" y2="12" stroke="#888" />
  </svg>
);

const IcoPrint: IconFC = ({ className }) => (
  <svg width="22" height="22" viewBox="0 0 16 16" className={className} shapeRendering="crispEdges">
    <rect x="3" y="2" width="10" height="5" fill="#f1f1f1" stroke="#000" />
    <rect x="1" y="7" width="14" height="5" fill="#c0c0c0" stroke="#000" />
    <rect x="3" y="10" width="10" height="4" fill="#ffffff" stroke="#000" />
    <circle cx="12" cy="9" r="0.8" fill="#2e8b2e" />
  </svg>
);

const IcoCut: IconFC = ({ className }) => (
  <svg width="22" height="22" viewBox="0 0 16 16" className={className} shapeRendering="crispEdges">
    <circle cx="5" cy="11" r="2.2" fill="none" stroke="#000" />
    <circle cx="11" cy="11" r="2.2" fill="none" stroke="#000" />
    <line x1="6" y1="9" x2="13" y2="2" stroke="#000" />
    <line x1="10" y1="9" x2="3" y2="2" stroke="#000" />
  </svg>
);

const IcoCopy: IconFC = ({ className }) => (
  <svg width="22" height="22" viewBox="0 0 16 16" className={className} shapeRendering="crispEdges">
    <rect x="2" y="1" width="9" height="11" fill="#fff" stroke="#000" />
    <rect x="5" y="4" width="9" height="11" fill="#fff" stroke="#000" />
    <line x1="6" y1="7" x2="13" y2="7" stroke="#888" />
    <line x1="6" y1="9" x2="13" y2="9" stroke="#888" />
    <line x1="6" y1="11" x2="11" y2="11" stroke="#888" />
  </svg>
);

const IcoLink: IconFC = ({ className }) => (
  <svg width="22" height="22" viewBox="0 0 16 16" className={className} shapeRendering="crispEdges">
    <path d="M4 8 L6 6 L8 8 L7 9" fill="none" stroke="#0050a0" strokeWidth="1.6" />
    <path d="M12 8 L10 10 L8 8 L9 7" fill="none" stroke="#0050a0" strokeWidth="1.6" />
    <line x1="5" y1="11" x2="11" y2="5" stroke="#0050a0" strokeWidth="1.6" />
  </svg>
);

const IcoSum: IconFC = ({ className }) => (
  <svg width="22" height="22" viewBox="0 0 16 16" className={className} shapeRendering="crispEdges">
    <text x="8" y="13" fontFamily="Arial" fontSize="15" fontWeight="bold" textAnchor="middle" fill="#000">Σ</text>
  </svg>
);

const IcoSort: IconFC = ({ className }) => (
  <svg width="22" height="22" viewBox="0 0 16 16" className={className} shapeRendering="crispEdges">
    <path d="M4 2 L4 13 M2 11 L4 13 L6 11" fill="none" stroke="#000" strokeWidth="1.5" />
    <text x="11" y="6" fontFamily="Arial" fontSize="6" fontWeight="bold" textAnchor="middle" fill="#000">A</text>
    <text x="11" y="12" fontFamily="Arial" fontSize="6" fontWeight="bold" textAnchor="middle" fill="#000">Z</text>
  </svg>
);

const IcoChart: IconFC = ({ className }) => (
  <svg width="22" height="22" viewBox="0 0 16 16" className={className} shapeRendering="crispEdges">
    <rect x="2" y="9" width="2" height="5" fill="#3465a4" stroke="#000" />
    <rect x="5" y="6" width="2" height="8" fill="#73d216" stroke="#000" />
    <rect x="8" y="3" width="2" height="11" fill="#ef2929" stroke="#000" />
    <rect x="11" y="7" width="2" height="7" fill="#f57900" stroke="#000" />
  </svg>
);

// Excel toolbar icon row - every button does something useful
const TOOLBAR_ICONS: Array<{
  Icon: IconFC;
  title: string;
  action: () => void;
}> = [
  { Icon: IcoNew, title: "New → Contact Notepad", action: () => openApp("contact") },
  { Icon: IcoOpen, title: "Open → My Computer", action: () => openApp("my-computer") },
  { Icon: IcoSave, title: "Save → download resume", action: triggerResumeDownload },
  { Icon: IcoPrint, title: "Print → download resume", action: triggerResumeDownload },
  { Icon: IcoCut, title: "Cut (copy selected cell ref)", action: copySelectedCellValue },
  { Icon: IcoCopy, title: "Copy (selected cell ref)", action: copySelectedCellValue },
  {
    Icon: IcoLink,
    title: "Hyperlink → LinkedIn (real tab)",
    action: () =>
      window.open(
        "https://www.linkedin.com/in/willzhang6200",
        "_blank",
        "noopener"
      ),
  },
  { Icon: IcoSum, title: "AutoSum → Metrics sheet", action: () => goToSheet("metrics") },
  { Icon: IcoSort, title: "Sort → Overview sheet", action: () => goToSheet("overview") },
  { Icon: IcoChart, title: "Chart → Metrics sheet", action: () => goToSheet("metrics") },
];

export function Toolbar() {
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
    <div
      ref={ref}
      className="win-raised flex flex-col gap-0 border-b border-[#808080] min-w-0"
    >
      {/* Menu bar - always fits horizontally */}
      <div className="flex h-[28px] items-center flex-wrap">
        {MENUS.map((m) => (
          <button
            key={m.label}
            type="button"
            data-open={openMenu === m.label}
            className="win-menu-item relative"
            onClick={() =>
              setOpenMenu((cur) => (cur === m.label ? null : m.label))
            }
            onMouseEnter={() => {
              if (openMenu) setOpenMenu(m.label);
            }}
          >
            <span className="win-mnemonic">{m.mnemonic}</span>
            {m.label.replace(m.mnemonic, "")}
            {openMenu === m.label && (
              <div
                className="win-window absolute top-full left-0 min-w-[260px] p-[3px] text-left z-30"
                onClick={(e) => e.stopPropagation()}
              >
                {MENU_ITEMS[m.label]?.map((item, i) =>
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
                      className="block w-full text-left px-[14px] py-[5px] text-[20px] hover:bg-[color:var(--color-select-blue)] hover:text-white disabled:text-[color:var(--color-win-text-disabled)] disabled:hover:bg-transparent disabled:hover:text-[color:var(--color-win-text-disabled)]"
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

      {/* Icon toolbar row 1 - every button wired with period-authentic pixel SVGs */}
      <div className="flex h-[36px] items-center gap-[2px] px-[3px] border-t border-[#dfdfdf] overflow-x-auto win-scroll">
        {TOOLBAR_ICONS.map((t, i) => (
          <button
            key={i}
            type="button"
            className="win-btn min-w-0 w-[32px] h-[32px] p-0 flex items-center justify-center"
            onClick={t.action}
            title={t.title}
            aria-label={t.title}
          >
            <t.Icon />
          </button>
        ))}
      </div>

      {/* Formatting toolbar row 2 - font, size, B/I/U, align, $/%/,/.0/, borders */}
      <FormattingToolbar />
    </div>
  );
}

function FormattingToolbar() {
  const Sep = () => (
    <div
      className="mx-[3px] h-[22px]"
      style={{ width: 1, boxShadow: "1px 0 0 #ffffff", background: "#808080" }}
    />
  );

  const Btn = ({
    children,
    title,
    onClick,
    className = "",
    disabled,
  }: {
    children: React.ReactNode;
    title: string;
    onClick?: () => void;
    className?: string;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      className={`win-btn min-w-0 h-[28px] w-[30px] p-0 flex items-center justify-center ${className}`}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );

  const goSheet = (id: string) => () => goToSheet(id);

  return (
    <div className="flex h-[32px] items-center gap-[2px] px-[3px] border-t border-[#dfdfdf] overflow-x-auto win-scroll">
      {/* Font name select */}
      <div
        className="win-field flex items-center px-[4px] h-[24px] text-[16px] gap-[4px]"
        style={{ width: 120 }}
        title="Font (Arial)"
      >
        <span className="truncate">Arial</span>
        <span className="ml-auto text-[color:var(--color-win-text-disabled)]" style={{ fontSize: 10 }}>▾</span>
      </div>
      {/* Font size select */}
      <div
        className="win-field flex items-center px-[4px] h-[24px] text-[16px] gap-[4px]"
        style={{ width: 48 }}
        title="Font size"
      >
        <span className="truncate">10</span>
        <span className="ml-auto text-[color:var(--color-win-text-disabled)]" style={{ fontSize: 10 }}>▾</span>
      </div>
      <Sep />
      {/* B I U */}
      <Btn title="Bold (jump to Skills - bolded header row)" onClick={goSheet("skills")}>
        <span style={{ fontWeight: 900, fontSize: 17 }}>B</span>
      </Btn>
      <Btn title="Italic (jump to Overview)" onClick={goSheet("overview")}>
        <span style={{ fontStyle: "italic", fontSize: 17, fontFamily: "Times, serif" }}>I</span>
      </Btn>
      <Btn title="Underline (jump to Contact)" onClick={goSheet("contact")}>
        <span style={{ textDecoration: "underline", fontSize: 17 }}>U</span>
      </Btn>
      <Sep />
      {/* Alignment */}
      <Btn title="Align left" disabled>
        <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges">
          <line x1="2" y1="3" x2="14" y2="3" stroke="#000" />
          <line x1="2" y1="6" x2="11" y2="6" stroke="#000" />
          <line x1="2" y1="9" x2="14" y2="9" stroke="#000" />
          <line x1="2" y1="12" x2="11" y2="12" stroke="#000" />
        </svg>
      </Btn>
      <Btn title="Align center" disabled>
        <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges">
          <line x1="2" y1="3" x2="14" y2="3" stroke="#000" />
          <line x1="4" y1="6" x2="12" y2="6" stroke="#000" />
          <line x1="2" y1="9" x2="14" y2="9" stroke="#000" />
          <line x1="4" y1="12" x2="12" y2="12" stroke="#000" />
        </svg>
      </Btn>
      <Btn title="Align right" disabled>
        <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges">
          <line x1="2" y1="3" x2="14" y2="3" stroke="#000" />
          <line x1="5" y1="6" x2="14" y2="6" stroke="#000" />
          <line x1="2" y1="9" x2="14" y2="9" stroke="#000" />
          <line x1="5" y1="12" x2="14" y2="12" stroke="#000" />
        </svg>
      </Btn>
      <Btn title="Merge & Center (Highlights sheet uses merged cells)" onClick={goSheet("highlights")}>
        <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges">
          <rect x="2" y="2" width="12" height="6" fill="none" stroke="#000" />
          <line x1="5" y1="12" x2="11" y2="12" stroke="#000" />
          <line x1="5" y1="10" x2="5" y2="14" stroke="#000" />
          <line x1="11" y1="10" x2="11" y2="14" stroke="#000" />
        </svg>
      </Btn>
      <Sep />
      {/* Currency, percent, comma, decimal */}
      <Btn title="Currency format (Metrics)" onClick={goSheet("metrics")}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>$</span>
      </Btn>
      <Btn title="Percent format (Metrics)" onClick={goSheet("metrics")}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>%</span>
      </Btn>
      <Btn title="Comma format" disabled>
        <span style={{ fontWeight: 700, fontSize: 16 }}>,</span>
      </Btn>
      <Btn title="Increase decimal" disabled>
        <span style={{ fontSize: 11, fontWeight: 700 }}>.0→</span>
      </Btn>
      <Btn title="Decrease decimal" disabled>
        <span style={{ fontSize: 11, fontWeight: 700 }}>←.0</span>
      </Btn>
      <Sep />
      {/* Borders / fill / text color */}
      <Btn title="Borders" disabled>
        <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges">
          <rect x="2" y="2" width="12" height="12" fill="none" stroke="#000" strokeWidth="1.2" />
          <line x1="2" y1="8" x2="14" y2="8" stroke="#000" strokeDasharray="1 1" />
          <line x1="8" y1="2" x2="8" y2="14" stroke="#000" strokeDasharray="1 1" />
        </svg>
      </Btn>
      <Btn title="Fill color" disabled>
        <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges">
          <rect x="3" y="3" width="9" height="7" fill="#ffff00" stroke="#000" />
          <line x1="3" y1="13" x2="13" y2="13" stroke="#ff0000" strokeWidth="2.5" />
        </svg>
      </Btn>
      <Btn title="Font color" disabled>
        <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges">
          <text x="8" y="11" textAnchor="middle" fontFamily="Times, serif" fontWeight="bold" fontSize="10" fill="#000">A</text>
          <line x1="3" y1="14" x2="13" y2="14" stroke="#c00" strokeWidth="2" />
        </svg>
      </Btn>
    </div>
  );
}
