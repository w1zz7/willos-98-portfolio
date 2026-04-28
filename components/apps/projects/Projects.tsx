"use client";

import type { WindowState } from "@/lib/wm/types";
import { openApp } from "@/lib/wm/registry";
import type { AppId } from "@/lib/wm/types";

interface Card {
  appId: AppId;
  label: string;
  summary: string;
  metric: string;
  icon: string;
}

const CARDS: Card[] = [
  {
    appId: "competitions",
    label: "Case Competitions & Hackathons",
    summary:
      "PGA Marketing Crisis, Philly CodeFest (1st · $3k), Jane Street Estimathon (3rd), NJ Esports State Champion ($40k pool), Howley Finance, DSAB Equity, Deloitte Datathon, BCG × Aramark, UEV, and more - with photos from each event.",
    metric: "14 events · 8 finalist/podium finishes · $43k+ prize money",
    icon: "/icons/trophy.svg",
  },
  {
    appId: "philaision",
    label: "PhilAIsion (Philly CodeFest 2026 Winner)",
    summary:
      "AI civic agent on a $50 Raspberry Pi 4 kiosk; 700+ city services across 10 languages.",
    metric: "1st place · $3,000 winner share",
    icon: "/icons/trophy.svg",
  },
  {
    appId: "stock-portfolio",
    label: "Stock Portfolio Management",
    summary:
      "Macro swing trading with strict Excel-validated strategy: S/R levels, moving averages, momentum.",
    metric: "63.98% gain ratio · $315,020 processed · 267 trades",
    icon: "/icons/chart.svg",
  },
  {
    appId: "market-recaps",
    label: "Market Journal - Daily Log",
    summary:
      "Daily + weekly journal entries (Jan – Apr 2026): Dow/S&P/Nasdaq moves, macro, sectors, crypto, TL;DR. The research layer behind the trades.",
    metric: "~50 entries · Jan – Apr 2026",
    icon: "/icons/news.svg",
  },
  {
    appId: "patent",
    label: "CNIPA Utility Model Patent",
    summary:
      "Co-invented a water-resistant golf bag innovation addressing durability gaps in existing gear.",
    metric: "China IP · Sept 2024",
    icon: "/icons/cert.svg",
  },
  {
    appId: "leadership",
    label: "Leadership - Drexel Ecosystem",
    summary:
      "Good Idea Fund · DCG · Google Developer Group · High Finance Program. $100k+ allocated, 14.3M+ followers overseen.",
    metric: "4 active roles",
    icon: "/icons/users.svg",
  },
  {
    appId: "bulletproof",
    label: "Bulletproof AI",
    summary:
      "Full-stack Next.js platform with RAG + ATS model trained on 200k resumes. 11 AI tools in production.",
    metric: "75,000+ req/mo",
    icon: "/icons/app-exe.svg",
  },
];

export default function Projects({ window: _ }: { window: WindowState }) {
  return (
    <div className="flex flex-col h-full overflow-auto win-scroll p-[10px] gap-[8px]">
      {CARDS.map((c) => (
        <button
          key={c.appId}
          type="button"
          className="win-window flex items-start gap-[10px] p-[10px] text-left hover:bg-[#e0e0e0]"
          onClick={() => openApp(c.appId)}
        >
          <img
            src={c.icon}
            alt=""
            width={48}
            height={48}
            className="pixelated shrink-0 mt-[2px]"
            style={{ imageRendering: "pixelated" }}
          />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[18px]">{c.label}</div>
            <div className="text-[20px] leading-snug mt-[2px]">{c.summary}</div>
            <div className="text-[20px] font-bold mt-[4px] text-[#000080]">
              {c.metric}
            </div>
          </div>
          <div className="text-[#000080] font-bold pr-[4px]">Open →</div>
        </button>
      ))}
    </div>
  );
}
