"use client";

import { useEffect, useRef } from "react";
import { Titlebar } from "./Titlebar";
import { ResizeHandles } from "./ResizeHandles";
import {
  useWindowStore,
  clampPositionToViewport,
  fitSizeToViewport,
} from "@/lib/wm/store";
import { APPS } from "@/lib/wm/registry";
import { useBreakpoint, useViewport } from "@/lib/wm/useMediaQuery";
import type { WindowState } from "@/lib/wm/types";

interface WindowProps {
  window: WindowState;
}

const TASKBAR_HEIGHT = 44;

export function Window({ window: win }: WindowProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const breakpoint = useBreakpoint();
  const viewport = useViewport();
  const app = APPS[win.appId];
  const Content = app?.component;

  const { focusWindow, minimizeWindow, toggleMaximize, closeWindow } =
    useWindowStore.getState();

  // On viewport resize, clamp the window back onscreen and scale size down
  // if it now exceeds the viewport (e.g. rotating phone, resizing browser).
  useEffect(() => {
    if (win.isMaximized || breakpoint !== "desktop") return;
    const fitted = fitSizeToViewport(win.size);
    const clamped = clampPositionToViewport(win.position, fitted);
    if (
      fitted.w !== win.size.w ||
      fitted.h !== win.size.h ||
      clamped.x !== win.position.x ||
      clamped.y !== win.position.y
    ) {
      useWindowStore.getState().updateWindow(win.id, {
        size: fitted,
        position: clamped,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.w, viewport.h, breakpoint]);

  if (win.isMinimized) return null;

  const onFocus = () => {
    if (!win.isFocused) focusWindow(win.id);
  };

  // Non-desktop (mobile / tablet): window fills the viewport - no drag or resize.
  if (breakpoint !== "desktop") {
    return (
      <div
        ref={ref}
        className="win-window absolute flex flex-col animate-open"
        style={{
          left: 0,
          top: 0,
          right: 0,
          bottom: TASKBAR_HEIGHT,
          zIndex: win.zIndex,
        }}
        onPointerDown={onFocus}
      >
        <Titlebar
          windowId={win.id}
          title={win.title}
          iconUrl={win.iconUrl}
          isFocused={win.isFocused}
          canMaximize={false}
          windowRef={ref}
          onMinimize={() => minimizeWindow(win.id)}
          onMaximize={() => toggleMaximize(win.id)}
          onClose={() => closeWindow(win.id)}
        />
        <div className="flex-1 min-h-0 overflow-hidden relative">
          {Content ? <Content window={win} /> : null}
        </div>
      </div>
    );
  }

  // Desktop: draggable + resizable
  const isMax = win.isMaximized;
  const style: React.CSSProperties = isMax
    ? {
        left: 0,
        top: 0,
        width: "100vw",
        height: `calc(100vh - ${TASKBAR_HEIGHT}px)`,
        zIndex: win.zIndex,
      }
    : {
        left: win.position.x,
        top: win.position.y,
        width: win.size.w,
        height: win.size.h,
        zIndex: win.zIndex,
      };

  return (
    <div
      ref={ref}
      className="win-window absolute flex flex-col animate-open"
      style={style}
      onPointerDown={onFocus}
    >
      <Titlebar
        windowId={win.id}
        title={win.title}
        iconUrl={win.iconUrl}
        isFocused={win.isFocused}
        canMaximize={!win.noResize}
        windowRef={ref}
        onMinimize={() => minimizeWindow(win.id)}
        onMaximize={() => toggleMaximize(win.id)}
        onClose={() => closeWindow(win.id)}
      />
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {Content ? <Content window={win} /> : null}
      </div>
      {!isMax && !win.noResize && <ResizeHandles windowId={win.id} windowRef={ref} />}
    </div>
  );
}
