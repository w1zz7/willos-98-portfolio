"use client";

import { useEffect } from "react";
import { DESKTOP_ICONS } from "@/data/apps";
import { DesktopIcon } from "./DesktopIcon";
import { Taskbar } from "./Taskbar";
import { WindowLayer } from "./WindowLayer";
import { DesktopContextMenu } from "./ContextMenu";
import { BootSequence } from "./BootSequence";
import { useWindowStore } from "@/lib/wm/store";
import { APPS } from "@/lib/wm/registry";
import { hydrateFromUrl, syncUrl } from "@/lib/wm/urlSync";
import { useBreakpoint, useViewport } from "@/lib/wm/useMediaQuery";
import { ToastHost } from "@/components/primitives/Toast";
import { StickyNote } from "./StickyNote";

const TASKBAR_HEIGHT = 44;
const ICON_HEIGHT = 128;

export function Desktop() {
  const bootComplete = useWindowStore((s) => s.bootComplete);
  const welcomeSeen = useWindowStore((s) => s.welcomeSeen);
  const breakpoint = useBreakpoint();
  const viewport = useViewport();

  // Deep-link hydration + URL sync. On fresh visit, open the default
  // three-window layout EXACTLY matching the reference screenshot:
  //   • About - top-left (right of the icon column)
  //   • Projects - right column, full taskbar-to-top height
  //   • Golf Memories - BELOW About, same left column, no overlap
  // Sizes scale proportionally to the viewport; clampPositionToViewport
  // in the store keeps everything onscreen on smaller viewports.
  useEffect(() => {
    if (!bootComplete) return;
    const hydrated = hydrateFromUrl();
    if (!hydrated) {
      const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
      const vh = typeof window !== "undefined" ? window.innerHeight : 800;
      const openWindow = useWindowStore.getState().openWindow;
      const aboutDef = APPS.about;
      const projectsDef = APPS.projects;
      const golfDef = APPS["golf-memories"];

      // Icon column (desktop icons) occupies ~140px on the left.
      const iconColumn = 140;
      const margin = 8;
      const gap = 16;
      const taskbarH = 44;
      const available = vw - iconColumn - margin * 2;
      const verticalAvailable = vh - taskbarH - 8;

      // Wide enough to fit About + Projects side-by-side, tall enough to
      // stack About + Golf Memories below it? Needs ~1100w x ~780h.
      const canFitTopRow = available >= 1100;
      const canStackGolf =
        canFitTopRow && verticalAvailable >= aboutDef.minSize.h + golfDef.minSize.h + 12;

      if (canFitTopRow) {
        // 48 / 52 split: About a touch narrower so Projects can breathe.
        const aboutW = Math.min(
          900,
          Math.max(aboutDef.minSize.w, Math.round((available - gap) * 0.46))
        );
        const projectsW = Math.min(
          980,
          Math.max(projectsDef.minSize.w, available - aboutW - gap)
        );

        // About's height leaves room for Golf Memories at its minimum size
        // below it, plus the gap. Guarantees zero overlap.
        const aboutH = canStackGolf
          ? Math.min(
              700,
              Math.max(
                aboutDef.minSize.h,
                verticalAvailable - golfDef.minSize.h - gap - 8
              )
            )
          : Math.min(700, Math.max(aboutDef.minSize.h, verticalAvailable - 4));

        const projectsH = Math.min(
          960,
          Math.max(projectsDef.minSize.h, verticalAvailable - 4)
        );

        const aboutX = iconColumn + margin;
        const projectsX = aboutX + aboutW + gap;
        const topY = 4;

        // About - top-left
        openWindow({
          appId: "about",
          title: aboutDef.title,
          iconUrl: aboutDef.iconUrl,
          size: { w: aboutW, h: aboutH },
          minSize: aboutDef.minSize,
          singleton: aboutDef.singleton,
          position: { x: aboutX, y: topY },
        });
        // Projects - right column, full height
        openWindow({
          appId: "projects",
          title: projectsDef.title,
          iconUrl: projectsDef.iconUrl,
          size: { w: projectsW, h: projectsH },
          minSize: projectsDef.minSize,
          singleton: projectsDef.singleton,
          position: { x: projectsX, y: topY },
        });
        // Golf Memories - directly below About, same left column, NO overlap.
        if (canStackGolf) {
          const golfY = topY + aboutH + gap;
          const golfH = Math.max(
            golfDef.minSize.h,
            verticalAvailable - aboutH - gap - 4
          );
          const golfW = aboutW; // full About-column width so edges align
          openWindow({
            appId: "golf-memories",
            title: golfDef.title,
            iconUrl: golfDef.iconUrl,
            size: { w: golfW, h: golfH },
            minSize: golfDef.minSize,
            singleton: golfDef.singleton,
            position: { x: aboutX, y: golfY },
          });
        }
      } else {
        // Narrow viewport: cascade all three so every one is reachable
        // via the taskbar. clampPositionToViewport keeps them visible.
        openWindow({
          appId: "projects",
          title: projectsDef.title,
          iconUrl: projectsDef.iconUrl,
          size: projectsDef.defaultSize,
          minSize: projectsDef.minSize,
          singleton: projectsDef.singleton,
        });
        openWindow({
          appId: "golf-memories",
          title: golfDef.title,
          iconUrl: golfDef.iconUrl,
          size: golfDef.defaultSize,
          minSize: golfDef.minSize,
          singleton: golfDef.singleton,
        });
        openWindow({
          appId: "about",
          title: aboutDef.title,
          iconUrl: aboutDef.iconUrl,
          size: aboutDef.defaultSize,
          minSize: aboutDef.minSize,
          singleton: aboutDef.singleton,
        });
      }
    }
    const unsub = useWindowStore.subscribe(() => syncUrl());
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootComplete]);

  // Icon grid: wrap into extra columns when viewport height can't fit them
  // all. Uses `flex flex-col flex-wrap` with a max-height so icons spill
  // into additional columns when needed. On short screens that means a
  // 2nd/3rd column appears; on tall screens they stay in a single column.
  // We cap at ICON_HEIGHT * 8 so even on ultrawide screens icons don't
  // sprawl weirdly.
  const availableH = Math.max(
    ICON_HEIGHT + 16,
    Math.min(ICON_HEIGHT * 8, viewport.h - TASKBAR_HEIGHT - 24)
  );

  return (
    <div
      data-desktop-surface
      className="fixed inset-0 overflow-hidden"
      style={{
        backgroundColor: "#8fc7ec",
        backgroundImage: "url(/wallpaper/golf-course.svg)",
        backgroundSize: "cover",
        backgroundPosition: "center bottom",
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
      }}
    >
      {/* Giant WillOS 98 wallpaper watermark - sits between the wallpaper
          image and the icons/windows, low-opacity so it never fights real
          content. Classic retro branding in the dead center of the desktop. */}
      {breakpoint !== "mobile" && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
          style={{ zIndex: 0 }}
        >
          <div
            className="flex items-baseline gap-[12px]"
            style={{
              fontFamily: "var(--font-chrome)",
              color: "#ffffff",
              opacity: 0.18,
              textShadow: "2px 2px 0 rgba(0,0,0,0.35)",
              letterSpacing: "6px",
              fontWeight: 700,
              imageRendering: "pixelated",
            }}
          >
            <span style={{ fontSize: "120px", lineHeight: 1 }}>WillOS</span>
            <span
              style={{
                fontSize: "160px",
                lineHeight: 1,
                color: "#ffff80",
                letterSpacing: "4px",
              }}
            >
              98
            </span>
          </div>
        </div>
      )}

      {/* Desktop icons - wrap into multi-column when vertical space is tight */}
      <div
        className="absolute top-[8px] left-[8px] flex flex-col flex-wrap content-start gap-x-[2px] gap-y-[4px]"
        style={{
          maxHeight: availableH,
          // Mobile: don't let icons eat too much horizontal space
          maxWidth: breakpoint === "mobile" ? "70%" : undefined,
        }}
      >
        {DESKTOP_ICONS.map((icon) => (
          <div key={icon.appId + icon.label} data-desktop-icon>
            <DesktopIcon {...icon} />
          </div>
        ))}
      </div>

      {/* Draggable, closeable Win98 CRT sticky-note popup (desktop only) */}
      {breakpoint !== "mobile" && (
        <StickyNote imageSrc="/stickers/win98-crt.png" />
      )}

      {/* Welcome note - text-only, small, stacked above the CRT note */}
      {breakpoint !== "mobile" && (
        <StickyNote
          corner="bottom-right"
          stackOffset={290}
          caption={"Welcome to my website!\nIt's still a work in progress."}
          subcaption="Everything can be dragged around"
          width={180}
          rotation={-3}
          tapeColor="rgba(255, 182, 193, 0.65)"
        />
      )}

      {/* Small brand stamp bottom-right - hide on very narrow screens */}
      {breakpoint !== "mobile" && (
        <div
          className="absolute bottom-[38px] right-[8px] text-white/40 text-[13px] pointer-events-none select-none"
          style={{ textShadow: "1px 1px 0 rgba(0,0,0,0.4)" }}
        >
          WillOS 98 · Build 2026.04
        </div>
      )}

      <WindowLayer />
      <DesktopContextMenu />
      <Taskbar />
      <BootSequence />
      <ToastHost />
    </div>
  );
}
