"use client";

/**
 * App registry: every AppId maps to a component + metadata.
 * Heavy apps use next/dynamic so they're not in the initial bundle.
 */

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { AppId, Size, WindowState } from "./types";
import { useWindowStore } from "./store";

export interface AppDef {
  appId: AppId;
  title: string;
  iconUrl: string;
  defaultSize: Size;
  minSize: Size;
  component: ComponentType<{ window: WindowState }>;
  /** If true, opening again focuses the existing instance rather than spawning new. */
  singleton?: boolean;
  /** If true, no resize handles. */
  noResize?: boolean;
  /** If true, omit from taskbar (dialogs). */
  hideFromTaskbar?: boolean;
}

const Excel = dynamic(() => import("@/components/apps/excel/Excel"), { ssr: false });
const About = dynamic(() => import("@/components/apps/about/About"), { ssr: false });
const Projects = dynamic(() => import("@/components/apps/projects/Projects"), { ssr: false });
const BulletproofAI = dynamic(
  () => import("@/components/apps/projects/BulletproofAI"),
  { ssr: false }
);
const PhilAIsion = dynamic(
  () => import("@/components/apps/projects/PhilAIsion"),
  { ssr: false }
);
const StockPortfolio = dynamic(
  () => import("@/components/apps/projects/StockPortfolio"),
  { ssr: false }
);
const MarketRecaps = dynamic(
  () => import("@/components/apps/market-recaps/MarketRecaps"),
  { ssr: false }
);
const Patent = dynamic(() => import("@/components/apps/projects/Patent"), { ssr: false });
const Leadership = dynamic(
  () => import("@/components/apps/projects/Leadership"),
  { ssr: false }
);
const Competitions = dynamic(
  () => import("@/components/apps/projects/Competitions"),
  { ssr: false }
);
const GolfMemories = dynamic(
  () => import("@/components/apps/golf/GolfMemories"),
  { ssr: false }
);
const HighSchool = dynamic(
  () => import("@/components/apps/highschool/HighSchool"),
  { ssr: false }
);
const SpeakingEngagements = dynamic(
  () => import("@/components/apps/speaking/SpeakingEngagements"),
  { ssr: false }
);
const TradingStrategy = dynamic(
  () => import("@/components/apps/strategy/TradingStrategy"),
  { ssr: false }
);
const ResumeViewer = dynamic(
  () => import("@/components/apps/resume/ResumeViewer"),
  { ssr: false }
);
const ContactNotepad = dynamic(
  () => import("@/components/apps/contact/Notepad"),
  { ssr: false }
);
const MyComputer = dynamic(
  () => import("@/components/apps/my-computer/MyComputer"),
  { ssr: false }
);
const RecycleBin = dynamic(
  () => import("@/components/apps/recycle-bin/RecycleBin"),
  { ssr: false }
);
const Minesweeper = dynamic(
  () => import("@/components/apps/minesweeper/Minesweeper"),
  { ssr: false }
);
const InternetExplorer = dynamic(
  () => import("@/components/apps/ie/InternetExplorer"),
  { ssr: false }
);
const WillBB = dynamic(
  () => import("@/components/apps/willbb/OpenBB"),
  { ssr: false }
);
const GolfDataLab = dynamic(
  () => import("@/components/apps/golfdatalab/GolfDataLab"),
  { ssr: false }
);
const WelcomeDialog = dynamic(
  () => import("@/components/apps/dialogs/WelcomeDialog"),
  { ssr: false }
);
const ShutdownScreen = dynamic(
  () => import("@/components/apps/dialogs/ShutdownScreen"),
  { ssr: false }
);
const AboutDialog = dynamic(
  () => import("@/components/apps/dialogs/AboutDialog"),
  { ssr: false }
);

export const APPS: Record<AppId, AppDef> = {
  excel: {
    appId: "excel",
    title: "WillZhang.xlsx - Microsoft Excel",
    iconUrl: "/icons/excel.svg",
    defaultSize: { w: 960, h: 640 },
    minSize: { w: 520, h: 380 },
    component: Excel,
    singleton: true,
  },
  about: {
    appId: "about",
    title: "About Will Zhang",
    iconUrl: "/icons/about.svg",
    defaultSize: { w: 680, h: 560 },
    minSize: { w: 440, h: 380 },
    component: About,
    singleton: true,
  },
  projects: {
    appId: "projects",
    title: "Projects",
    iconUrl: "/icons/folder.svg",
    defaultSize: { w: 720, h: 540 },
    minSize: { w: 440, h: 340 },
    component: Projects,
    singleton: true,
  },
  bulletproof: {
    appId: "bulletproof",
    title: "BulletproofAI.exe - Case Study",
    iconUrl: "/icons/app-exe.svg",
    defaultSize: { w: 720, h: 600 },
    minSize: { w: 440, h: 380 },
    component: BulletproofAI,
    singleton: true,
  },
  philaision: {
    appId: "philaision",
    title: "PhilAIsion - Philly CodeFest Winner",
    iconUrl: "/icons/trophy.svg",
    defaultSize: { w: 720, h: 600 },
    minSize: { w: 440, h: 380 },
    component: PhilAIsion,
    singleton: true,
  },
  "stock-portfolio": {
    appId: "stock-portfolio",
    title: "Stock Portfolio",
    iconUrl: "/icons/chart.svg",
    defaultSize: { w: 780, h: 600 },
    minSize: { w: 480, h: 400 },
    component: StockPortfolio,
    singleton: true,
  },
  "market-recaps": {
    appId: "market-recaps",
    title: "Market Journal",
    iconUrl: "/icons/news.svg",
    defaultSize: { w: 820, h: 680 },
    minSize: { w: 480, h: 420 },
    component: MarketRecaps,
    singleton: true,
  },
  patent: {
    appId: "patent",
    title: "CNIPA Utility Model Patent",
    iconUrl: "/icons/cert.svg",
    defaultSize: { w: 640, h: 500 },
    minSize: { w: 440, h: 340 },
    component: Patent,
    singleton: true,
  },
  leadership: {
    appId: "leadership",
    title: "Leadership",
    iconUrl: "/icons/users.svg",
    defaultSize: { w: 720, h: 560 },
    minSize: { w: 440, h: 380 },
    component: Leadership,
    singleton: true,
  },
  competitions: {
    appId: "competitions",
    title: "Case Competitions & Hackathons",
    iconUrl: "/icons/trophy.svg",
    defaultSize: { w: 820, h: 680 },
    minSize: { w: 460, h: 420 },
    component: Competitions,
    singleton: true,
  },
  "golf-memories": {
    appId: "golf-memories",
    title: "Golf Memories",
    iconUrl: "/icons/golf.svg",
    defaultSize: { w: 820, h: 640 },
    minSize: { w: 460, h: 420 },
    component: GolfMemories,
    singleton: true,
  },
  highschool: {
    appId: "highschool",
    title: "High School - Cherry Hill East",
    iconUrl: "/icons/about.svg",
    defaultSize: { w: 820, h: 680 },
    minSize: { w: 480, h: 420 },
    component: HighSchool,
    singleton: true,
  },
  speaking: {
    appId: "speaking",
    title: "Public Speaking",
    iconUrl: "/icons/mic.svg",
    defaultSize: { w: 820, h: 680 },
    minSize: { w: 460, h: 420 },
    component: SpeakingEngagements,
    singleton: true,
  },
  strategy: {
    appId: "strategy",
    title: "Trading Strategy",
    iconUrl: "/icons/strategy.svg",
    defaultSize: { w: 860, h: 680 },
    minSize: { w: 520, h: 420 },
    component: TradingStrategy,
    singleton: true,
  },
  resume: {
    appId: "resume",
    title: "Resume.pdf - Adobe Viewer",
    iconUrl: "/icons/pdf.svg",
    defaultSize: { w: 820, h: 680 },
    minSize: { w: 480, h: 380 },
    component: ResumeViewer,
    singleton: true,
  },
  contact: {
    appId: "contact",
    title: "Contact Me - Will Zhang",
    iconUrl: "/icons/notepad.svg",
    defaultSize: { w: 720, h: 580 },
    minSize: { w: 520, h: 440 },
    component: ContactNotepad,
    singleton: true,
  },
  "my-computer": {
    appId: "my-computer",
    title: "My Computer",
    iconUrl: "/icons/computer.svg",
    defaultSize: { w: 760, h: 540 },
    minSize: { w: 520, h: 400 },
    component: MyComputer,
    singleton: true,
  },
  "recycle-bin": {
    appId: "recycle-bin",
    title: "Recycle Bin",
    iconUrl: "/icons/recycle.svg",
    defaultSize: { w: 820, h: 520 },
    minSize: { w: 560, h: 360 },
    component: RecycleBin,
    singleton: true,
  },
  minesweeper: {
    appId: "minesweeper",
    title: "Minesweeper",
    iconUrl: "/icons/mine.svg",
    defaultSize: { w: 200, h: 260 },
    minSize: { w: 200, h: 260 },
    component: Minesweeper,
    singleton: true,
    noResize: true,
  },
  ie: {
    appId: "ie",
    title: "Internet Explorer",
    iconUrl: "/icons/ie.svg",
    defaultSize: { w: 820, h: 620 },
    minSize: { w: 480, h: 400 },
    component: InternetExplorer,
    singleton: false,
  },
  willbb: {
    appId: "willbb",
    title: "WillBB Markets Terminal",
    iconUrl: "/icons/willbb.svg",
    defaultSize: { w: 980, h: 680 },
    minSize: { w: 640, h: 460 },
    component: WillBB,
    singleton: true,
  },
  golfdatalab: {
    appId: "golfdatalab",
    title: "Golf Data Lab",
    iconUrl: "/icons/golf-data-lab.svg",
    defaultSize: { w: 1000, h: 700 },
    minSize: { w: 720, h: 520 },
    component: GolfDataLab,
    singleton: true,
  },
  notepad: {
    appId: "notepad",
    title: "Notepad",
    iconUrl: "/icons/notepad.svg",
    defaultSize: { w: 640, h: 500 },
    minSize: { w: 460, h: 340 },
    component: ContactNotepad,
    singleton: false,
  },
  welcome: {
    appId: "welcome",
    title: "Welcome to WillOS 98",
    iconUrl: "/icons/info.svg",
    defaultSize: { w: 520, h: 340 },
    minSize: { w: 520, h: 340 },
    component: WelcomeDialog,
    singleton: true,
    noResize: true,
  },
  shutdown: {
    appId: "shutdown",
    title: "Shut Down",
    iconUrl: "/icons/shutdown.svg",
    defaultSize: { w: 100, h: 100 },
    minSize: { w: 100, h: 100 },
    component: ShutdownScreen,
    singleton: true,
    noResize: true,
    hideFromTaskbar: true,
  },
  "about-dialog": {
    appId: "about-dialog",
    title: "About WillOS 98",
    iconUrl: "/icons/info.svg",
    defaultSize: { w: 460, h: 300 },
    minSize: { w: 460, h: 300 },
    component: AboutDialog,
    singleton: true,
    noResize: true,
  },
};

/**
 * Helper: open an app via its registry entry - uses default size/title/icon.
 */
export function openApp(
  appId: AppId,
  extraProps?: Record<string, unknown>
): string {
  const def = APPS[appId];
  if (!def) throw new Error(`Unknown app: ${appId}`);
  return useWindowStore.getState().openWindow({
    appId,
    title: def.title,
    iconUrl: def.iconUrl,
    size: def.defaultSize,
    minSize: def.minSize,
    singleton: def.singleton,
    noResize: def.noResize,
    hideFromTaskbar: def.hideFromTaskbar,
    props: extraProps,
  });
}
