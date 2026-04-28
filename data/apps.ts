import type { AppId } from "@/lib/wm/types";

export interface DesktopIconDef {
  appId: AppId;
  label: string;
  iconUrl: string;
  /** Extra props passed to the app on open. */
  props?: Record<string, unknown>;
}

/**
 * The default desktop - only the 7 icons that matter for conversion. Games,
 * Recycle Bin, and the file explorer live in the Start Menu, not on the
 * desktop (where they'd distract a recruiter with 6 seconds to scan).
 */
export const DESKTOP_ICONS: DesktopIconDef[] = [
  { appId: "excel", label: "WillZhang.xlsx", iconUrl: "/icons/excel.svg" },
  { appId: "about", label: "About Me", iconUrl: "/icons/about.svg" },
  { appId: "projects", label: "Projects", iconUrl: "/icons/folder.svg" },
  { appId: "resume", label: "Resume.pdf", iconUrl: "/icons/pdf.svg" },
  { appId: "contact", label: "Contact Me.txt", iconUrl: "/icons/notepad.svg" },
  { appId: "bulletproof", label: "BulletproofAI.exe", iconUrl: "/icons/app-exe.svg" },
  { appId: "speaking", label: "Public Speaking", iconUrl: "/icons/mic.svg" },
  { appId: "golf-memories", label: "Golf Memories", iconUrl: "/icons/golf.svg" },
  { appId: "highschool", label: "High School", iconUrl: "/icons/about.svg" },
  { appId: "market-recaps", label: "Market Journal", iconUrl: "/icons/news.svg" },
  { appId: "willbb", label: "WillBB Terminal", iconUrl: "/icons/willbb.svg" },
  { appId: "strategy", label: "Trading Strategy", iconUrl: "/icons/strategy.svg" },
];

export interface StartMenuItem {
  appId?: AppId;
  label: string;
  iconUrl: string;
  props?: Record<string, unknown>;
  action?: "shutdown" | "about-dialog" | "fullscreen";
  separator?: boolean;
}

/**
 * The Start Menu - where secondary content lives. Keeps the desktop clean
 * while still giving discoverers access to everything.
 */
export const START_MENU: StartMenuItem[] = [
  { appId: "excel", label: "WillZhang.xlsx", iconUrl: "/icons/excel.svg" },
  { appId: "about", label: "About Me", iconUrl: "/icons/about.svg" },
  { appId: "projects", label: "Projects", iconUrl: "/icons/folder.svg" },
  { appId: "leadership", label: "Leadership", iconUrl: "/icons/users.svg" },
  { appId: "resume", label: "Resume.pdf", iconUrl: "/icons/pdf.svg" },
  { appId: "contact", label: "Contact Me", iconUrl: "/icons/notepad.svg" },
  { label: "", iconUrl: "", separator: true },
  { appId: "my-computer", label: "My Computer", iconUrl: "/icons/computer.svg" },
  { appId: "recycle-bin", label: "Recycle Bin", iconUrl: "/icons/recycle.svg" },
  { appId: "speaking", label: "Public Speaking", iconUrl: "/icons/mic.svg" },
  { appId: "golf-memories", label: "Golf Memories", iconUrl: "/icons/golf.svg" },
  { appId: "highschool", label: "High School", iconUrl: "/icons/about.svg" },
  { appId: "market-recaps", label: "Market Journal", iconUrl: "/icons/news.svg" },
  { appId: "willbb", label: "WillBB Terminal", iconUrl: "/icons/willbb.svg" },
  { appId: "strategy", label: "Trading Strategy", iconUrl: "/icons/strategy.svg" },
  { appId: "minesweeper", label: "Games › Minesweeper", iconUrl: "/icons/mine.svg" },
  { label: "", iconUrl: "", separator: true },
  { action: "fullscreen", label: "Toggle Full Screen", iconUrl: "/icons/fullscreen.svg" },
  { action: "about-dialog", label: "About WillOS 98...", iconUrl: "/icons/info.svg" },
  { action: "shutdown", label: "Shut Down...", iconUrl: "/icons/shutdown.svg" },
];
