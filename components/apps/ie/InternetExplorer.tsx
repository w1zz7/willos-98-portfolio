"use client";

import type { WindowState } from "@/lib/wm/types";
import { useState, useMemo, useEffect } from "react";
import { findPage } from "./pages";
import { openApp } from "@/lib/wm/registry";
import { useWindowStore } from "@/lib/wm/store";
import { MenuBar, type MenuDef } from "@/components/primitives/MenuBar";

const HOME = "https://bulletproofai.org";

interface HistoryEntry {
  url: string;
}

export default function InternetExplorer({ window: win }: { window: WindowState }) {
  const initialUrl = (win.props?.url as string | undefined) ?? HOME;
  const [history, setHistory] = useState<HistoryEntry[]>([{ url: initialUrl }]);
  const [cursor, setCursor] = useState(0);
  const [addressInput, setAddressInput] = useState(initialUrl);

  const currentUrl = history[cursor]?.url ?? HOME;
  const page = useMemo(() => findPage(currentUrl), [currentUrl]);

  useEffect(() => {
    setAddressInput(currentUrl);
  }, [currentUrl]);

  const go = (newUrl: string) => {
    if (/^mailto:/i.test(newUrl) || /^tel:/i.test(newUrl)) {
      openApp("contact");
      return;
    }
    let url = newUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const next = history.slice(0, cursor + 1).concat({ url });
    setHistory(next);
    setCursor(next.length - 1);
  };

  const back = () => cursor > 0 && setCursor(cursor - 1);
  const forward = () => cursor < history.length - 1 && setCursor(cursor + 1);
  const reload = () => setHistory([...history]);
  const close = () => useWindowStore.getState().closeWindow(win.id);

  const pageTitle = page?.title ?? currentUrl;

  const menus: MenuDef[] = [
    {
      label: "File",
      mnemonic: "F",
      items: [
        { label: "New Window", action: () => openApp("ie", { url: HOME }) },
        { label: "Open BulletproofAI.org", action: () => go("https://bulletproofai.org") },
        { separator: true },
        { label: "Open in real browser ↗", action: () => window.open(currentUrl, "_blank", "noopener") },
        { label: "Close", action: close },
      ],
    },
    {
      label: "Edit",
      mnemonic: "E",
      items: [
        {
          label: "Copy address",
          action: () => {
            try {
              navigator.clipboard?.writeText(currentUrl);
            } catch {
              /* noop */
            }
          },
        },
        { label: "Find... (not implemented)", disabled: true },
      ],
    },
    {
      label: "View",
      mnemonic: "V",
      items: [
        { label: "Refresh", action: reload },
        { label: "Go → Home", action: () => go(HOME) },
        { separator: true },
        { label: "Text Size: Normal ✓", disabled: true },
      ],
    },
    {
      label: "Favorites",
      mnemonic: "A",
      items: [
        { label: "★ BulletproofAI.org", action: () => go("https://bulletproofai.org") },
        { label: "★ Portfolio home", action: () => openApp("about") },
        { label: "★ Resume.pdf", action: () => openApp("resume") },
        { separator: true },
        { label: "Add to Favorites (coming soon)", disabled: true },
      ],
    },
    {
      label: "Tools",
      mnemonic: "T",
      items: [
        {
          label: "Mail → Contact Me",
          action: () => openApp("contact"),
        },
        { label: "Internet Options", disabled: true },
      ],
    },
    {
      label: "Help",
      mnemonic: "H",
      items: [
        { label: "About WillOS 98", action: () => openApp("about-dialog") },
        { label: "About Will Zhang", action: () => openApp("about") },
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full bg-white">
      <MenuBar menus={menus} />

      {/* Toolbar */}
      <div className="flex items-center gap-[5px] px-[5px] h-[40px] win-raised border-b border-[#808080] shrink-0">
        <button
          type="button"
          className="win-btn h-[32px] min-w-0 px-[10px] gap-[4px]"
          onClick={back}
          disabled={cursor === 0}
          title="Back"
        >
          ← Back
        </button>
        <button
          type="button"
          className="win-btn h-[32px] min-w-0 px-[10px] gap-[4px]"
          onClick={forward}
          disabled={cursor === history.length - 1}
          title="Forward"
        >
          Forward →
        </button>
        <button
          type="button"
          className="win-btn h-[32px] min-w-0 w-[32px] p-0 text-[20px]"
          onClick={reload}
          title="Refresh"
        >
          ⟳
        </button>
        <button
          type="button"
          className="win-btn h-[32px] min-w-0 px-[10px]"
          onClick={() => go(HOME)}
          title="Home"
        >
          🏠 Home
        </button>
        <button
          type="button"
          className="win-btn h-[32px] min-w-0 px-[10px]"
          onClick={() => openApp("contact")}
          title="Open mail → Contact Me"
        >
          ✉ Mail
        </button>
      </div>

      {/* Address bar */}
      <div className="flex items-center gap-[6px] px-[6px] h-[32px] border-b border-[#808080] bg-[color:var(--color-win-bg)] shrink-0">
        <span className="text-[18px] pl-[2px] font-bold">Address</span>
        <div className="flex-1 win-field flex items-center px-[6px] h-[24px]">
          <span
            className="pr-[4px] shrink-0"
            title="This page is inside WillOS 98"
          >
            🌐
          </span>
          <input
            className="flex-1 text-[18px] font-[var(--font-cell)] outline-none bg-transparent h-full"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") go(addressInput);
            }}
          />
        </div>
        <button
          type="button"
          className="win-btn h-[26px] min-w-0 px-[14px]"
          onClick={() => go(addressInput)}
        >
          Go
        </button>
        <button
          type="button"
          className="win-btn h-[26px] min-w-0 px-[8px] text-[19px]"
          title="Open in real browser (new tab)"
          onClick={() => window.open(currentUrl, "_blank", "noopener")}
        >
          ↗
        </button>
      </div>

      {/* Page area */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {page ? (
          page.render(currentUrl)
        ) : (
          <ExternalFallback url={currentUrl} />
        )}
      </div>

      {/* Status bar */}
      <div className="border-t border-[#808080] px-[6px] py-[1px] text-[19px] text-[color:var(--color-win-text-disabled)] flex justify-between">
        <span>Done - {pageTitle}</span>
        <span>Internet zone</span>
      </div>
    </div>
  );
}

function ExternalFallback({ url }: { url: string }) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    setBlocked(false);
    const id = window.setTimeout(() => setBlocked(true), 4000);
    return () => window.clearTimeout(id);
  }, [url]);

  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    /* invalid url */
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-white">
      {blocked && (
        <div className="bg-[#fffbcc] border-b border-[#e0d060] px-[10px] py-[4px] text-[18px] flex items-center justify-between gap-[8px]">
          <span>If the page didn't load, the site blocked embedding.</span>
          <button
            type="button"
            className="win-btn h-[26px] text-[16px]"
            onClick={() => window.open(url, "_blank", "noopener")}
          >
            Open {hostname} in a new tab ↗
          </button>
        </div>
      )}
      <iframe
        src={url}
        className="flex-1 w-full border-0"
        title={`IE · ${url}`}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  );
}
