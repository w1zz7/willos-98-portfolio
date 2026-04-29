"use client";

/**
 * Window Manager Zustand store.
 *
 * Uses selector-based subscriptions so dragging or updating one window does
 * not re-render the others. All positions/sizes are ultimately persisted
 * here, but during active drag/resize the DOM is mutated directly via refs
 * for 60fps, then the final value is written back on pointerup.
 */

import { create } from "zustand";
import type { AppId, Point, Size, WindowState } from "./types";

export interface WMState {
  windows: Record<string, WindowState>;
  /** Low-index-first; last entry is top-most. */
  order: string[];
  focusedId: string | null;
  nextZ: number;
  /** Tracks whether the welcome dialog has been shown for this session. */
  welcomeSeen: boolean;
  /** Tracks whether the boot sequence has played for this session. */
  bootComplete: boolean;

  openWindow: (opts: OpenWindowOpts) => string;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  toggleMaximize: (id: string) => void;
  restoreWindow: (id: string) => void;
  setPosition: (id: string, pos: Point) => void;
  setSize: (id: string, size: Size) => void;
  updateWindow: (id: string, patch: Partial<WindowState>) => void;
  setWelcomeSeen: () => void;
  setBootComplete: () => void;
}

export interface OpenWindowOpts {
  appId: AppId;
  title?: string;
  iconUrl?: string;
  position?: Point;
  size?: Size;
  minSize?: Size;
  props?: Record<string, unknown>;
  noResize?: boolean;
  hideFromTaskbar?: boolean;
  /** If true, focus existing instance of this appId instead of opening new. */
  singleton?: boolean;
}

const DEFAULT_MIN: Size = { w: 240, h: 160 };
const DEFAULT_SIZE: Size = { w: 560, h: 400 };
const TASKBAR_HEIGHT = 44;

function makeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Fit a requested window size into the current viewport with margins. */
export function fitSizeToViewport(requested: Size): Size {
  if (typeof window === "undefined") return requested;
  const maxW = Math.max(240, window.innerWidth - 16);
  const maxH = Math.max(160, window.innerHeight - TASKBAR_HEIGHT - 16);
  return {
    w: Math.min(requested.w, maxW),
    h: Math.min(requested.h, maxH),
  };
}

/**
 * Clamp a position so the window stays entirely onscreen when it fits,
 * or at least keeps 80px of titlebar visible when the window is larger
 * than the viewport.
 */
export function clampPositionToViewport(pos: Point, size: Size): Point {
  if (typeof window === "undefined") return pos;
  const vw = window.innerWidth;
  const vh = window.innerHeight - TASKBAR_HEIGHT;
  // If the window fits, clamp so the whole thing is visible.
  // If it doesn't fit, fall back to the "80px of titlebar" rule.
  const minX = size.w <= vw ? 0 : -size.w + 80;
  const maxX = size.w <= vw ? vw - size.w : vw - 80;
  const minY = 0;
  const maxY = size.h <= vh ? vh - size.h : vh - 40;
  return {
    x: Math.max(minX, Math.min(maxX, pos.x)),
    y: Math.max(minY, Math.min(maxY, pos.y)),
  };
}

/**
 * Cascade-place a new window so stacks of same-app openings don't perfectly
 * overlap. Each new window offsets down-right from the last. On narrower
 * viewports we cascade from a smaller starting offset so the window still
 * fits onscreen after clamping.
 */
function cascadePosition(existing: WindowState[]): Point {
  const n = existing.length;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const startX = vw < 1100 ? 20 : 60;
  const startY = vw < 1100 ? 20 : 40;
  return { x: startX + (n % 10) * 24, y: startY + (n % 10) * 24 };
}

export const useWindowStore = create<WMState>()((set, get) => ({
  windows: {},
  order: [],
  focusedId: null,
  nextZ: 10,
  welcomeSeen: false,
  bootComplete: false,

  openWindow: (opts) => {
    const state = get();

    // Singleton focus-existing behavior
    if (opts.singleton) {
      const existing = Object.values(state.windows).find(
        (w) => w.appId === opts.appId
      );
      if (existing) {
        get().focusWindow(existing.id);
        if (existing.isMinimized) {
          set((s) => ({
            windows: {
              ...s.windows,
              [existing.id]: { ...s.windows[existing.id], isMinimized: false },
            },
          }));
        }
        if (opts.props) {
          set((s) => ({
            windows: {
              ...s.windows,
              [existing.id]: {
                ...s.windows[existing.id],
                props: { ...s.windows[existing.id].props, ...opts.props },
              },
            },
          }));
        }
        return existing.id;
      }
    }

    const id = makeId();
    const rawPos = opts.position ?? cascadePosition(Object.values(state.windows));
    const size = fitSizeToViewport(opts.size ?? DEFAULT_SIZE);
    const position = clampPositionToViewport(rawPos, size);
    const newZ = state.nextZ + 1;

    const win: WindowState = {
      id,
      appId: opts.appId,
      title: opts.title ?? opts.appId,
      iconUrl: opts.iconUrl ?? "/icons/default.png",
      position,
      size,
      minSize: opts.minSize ?? DEFAULT_MIN,
      zIndex: newZ,
      isMinimized: false,
      isMaximized: false,
      isFocused: true,
      props: opts.props,
      openedAt: Date.now(),
      noResize: opts.noResize,
      hideFromTaskbar: opts.hideFromTaskbar,
    };

    set((s) => {
      const windows = { ...s.windows };
      // Unfocus everything else
      for (const wid of Object.keys(windows)) {
        if (windows[wid].isFocused) windows[wid] = { ...windows[wid], isFocused: false };
      }
      windows[id] = win;
      return {
        windows,
        order: [...s.order, id],
        focusedId: id,
        nextZ: newZ,
      };
    });
    return id;
  },

  closeWindow: (id) => {
    set((s) => {
      if (!s.windows[id]) return s;
      const { [id]: _removed, ...rest } = s.windows;
      const order = s.order.filter((x) => x !== id);
      const nextFocus = order[order.length - 1] ?? null;
      const windows = { ...rest };
      if (nextFocus && windows[nextFocus]) {
        windows[nextFocus] = { ...windows[nextFocus], isFocused: true };
      }
      return { windows, order, focusedId: nextFocus };
    });
  },

  focusWindow: (id) => {
    set((s) => {
      if (!s.windows[id]) return s;
      const newZ = s.nextZ + 1;
      const windows: Record<string, WindowState> = {};
      for (const [wid, w] of Object.entries(s.windows)) {
        windows[wid] = { ...w, isFocused: wid === id };
      }
      windows[id] = { ...windows[id], zIndex: newZ };
      // Move id to end of order
      const order = [...s.order.filter((x) => x !== id), id];
      return { windows, order, focusedId: id, nextZ: newZ };
    });
  },

  minimizeWindow: (id) => {
    set((s) => {
      const w = s.windows[id];
      if (!w) return s;
      const windows = { ...s.windows, [id]: { ...w, isMinimized: true, isFocused: false } };
      // Focus next visible window
      const visible = s.order
        .filter((wid) => wid !== id && !windows[wid]?.isMinimized)
        .reverse();
      const nextFocus = visible[0] ?? null;
      if (nextFocus) windows[nextFocus] = { ...windows[nextFocus], isFocused: true };
      return { windows, focusedId: nextFocus };
    });
  },

  toggleMaximize: (id) => {
    set((s) => {
      const w = s.windows[id];
      if (!w) return s;
      if (w.isMaximized) {
        return {
          windows: {
            ...s.windows,
            [id]: {
              ...w,
              isMaximized: false,
              position: w.prevPosition ?? w.position,
              size: w.prevSize ?? w.size,
              prevPosition: undefined,
              prevSize: undefined,
            },
          },
        };
      }
      return {
        windows: {
          ...s.windows,
          [id]: {
            ...w,
            isMaximized: true,
            prevPosition: w.position,
            prevSize: w.size,
          },
        },
      };
    });
  },

  restoreWindow: (id) => {
    set((s) => {
      const w = s.windows[id];
      if (!w) return s;
      return {
        windows: { ...s.windows, [id]: { ...w, isMinimized: false } },
      };
    });
    get().focusWindow(id);
  },

  setPosition: (id, position) =>
    set((s) =>
      s.windows[id]
        ? { windows: { ...s.windows, [id]: { ...s.windows[id], position } } }
        : s
    ),

  setSize: (id, size) =>
    set((s) =>
      s.windows[id]
        ? { windows: { ...s.windows, [id]: { ...s.windows[id], size } } }
        : s
    ),

  updateWindow: (id, patch) =>
    set((s) =>
      s.windows[id]
        ? { windows: { ...s.windows, [id]: { ...s.windows[id], ...patch } } }
        : s
    ),

  setWelcomeSeen: () => set({ welcomeSeen: true }),
  setBootComplete: () => set({ bootComplete: true }),
}));

/* -------------------------------------------------------------
   Selectors
   ------------------------------------------------------------- */
export const selectWindow = (id: string) => (s: WMState) => s.windows[id];
export const selectOrder = (s: WMState) => s.order;
export const selectVisibleTaskbarWindows = (s: WMState) =>
  s.order
    .map((id) => s.windows[id])
    .filter((w): w is WindowState => !!w && !w.hideFromTaskbar);
