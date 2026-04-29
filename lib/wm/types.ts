/**
 * Window Manager types.
 *
 * Every app that can open in a window is registered in registry.tsx under an
 * AppId, and each open instance is tracked in the Zustand store as a
 * WindowState.
 */

export type AppId =
  | "excel"
  | "about"
  | "projects"
  | "bulletproof"
  | "philaision"
  | "stock-portfolio"
  | "market-recaps"
  | "patent"
  | "leadership"
  | "competitions"
  | "golf-memories"
  | "highschool"
  | "speaking"
  | "strategy"
  | "resume"
  | "contact"
  | "my-computer"
  | "recycle-bin"
  | "minesweeper"
  | "ie"
  | "willbb"
  | "golfdatalab"
  | "notepad"
  | "welcome"
  | "shutdown"
  | "about-dialog";

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface WindowState {
  /** Unique instance id (crypto.randomUUID()) */
  id: string;
  appId: AppId;
  title: string;
  iconUrl: string;
  /** Current top-left on the desktop (px). */
  position: Point;
  /** Current size (px). */
  size: Size;
  /** Stored while maximized so un-maximize restores the right shape. */
  prevSize?: Size;
  prevPosition?: Point;
  /** Enforced during resize. */
  minSize: Size;
  zIndex: number;
  isMinimized: boolean;
  isMaximized: boolean;
  isFocused: boolean;
  /** Arbitrary per-app payload - e.g. Excel reads { sheet: 'metrics' }. */
  props?: Record<string, unknown>;
  /** Used for open-animation + deep-link ordering. */
  openedAt: number;
  /** If true, window cannot be resized (used by dialogs like Shutdown). */
  noResize?: boolean;
  /** If true, don't render in taskbar (modal dialogs). */
  hideFromTaskbar?: boolean;
}
