"use client";

/**
 * Curated "sites" rendered inside the IE window for URLs we control.
 * Every interactive element on these pages has a real handler - no dead
 * buttons.
 */

import { openApp } from "@/lib/wm/registry";
import { openLink } from "@/lib/wm/openLink";
import type { ReactNode } from "react";

export interface IEPage {
  match: (url: string) => boolean;
  title: string;
  render: (url: string) => ReactNode;
}

export const PAGES: IEPage[] = [
  {
    match: (u) => /bulletproofai\.org/i.test(u),
    title: "Bulletproof AI · Home",
    render: () => <BulletproofPage />,
  },
  {
    // AboutShortcut: WillOS-local URLs only. Exclude BulletproofAI so it can
    // fall through to its stylized match above.
    match: (u) =>
      !/bulletproofai\.org/i.test(u) &&
      /willzhang(?!ai)|portfolio\.local/i.test(u),
    title: "Will Zhang · WillOS 98",
    render: () => <AboutShortcut />,
  },
];

export function findPage(url: string): IEPage | null {
  return PAGES.find((p) => p.match(url)) ?? null;
}


/* --------------------------------------------------------------
   Bulletproof AI - every CTA wired
   -------------------------------------------------------------- */
function BulletproofPage() {
  const openReal = () =>
    window.open("https://bulletproofai.org", "_blank", "noopener");

  return (
    <div
      className="min-h-full bg-white overflow-auto"
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <div
        className="px-[20px] py-[10px] flex items-center gap-[12px] flex-wrap"
        style={{ background: "#0a1a33", color: "#fff" }}
      >
        <button
          type="button"
          onClick={() => openApp("bulletproof")}
          className="flex items-center gap-[8px] bg-transparent text-white"
          title="Case study"
        >
          <span
            className="w-[28px] h-[28px] flex items-center justify-center font-bold rounded"
            style={{ background: "#ff3b3b" }}
          >
            B
          </span>
          <span className="font-bold">Bulletproof AI</span>
        </button>
        <nav className="ml-auto text-[20px] flex items-center gap-[2px] flex-wrap">
          <BPNavChip label="Tools" onClick={openReal} />
          <BPNavChip label="Guides" onClick={openReal} />
          <BPNavChip label="Interview" onClick={openReal} />
          <BPNavChip label="Analyzer" onClick={openReal} />
          <BPNavChip label="Login" onClick={openReal} />
        </nav>
      </div>

      <div
        className="px-[20px] py-[32px] text-center"
        style={{ background: "linear-gradient(180deg, #eaf1fb, #ffffff)" }}
      >
        <div className="text-[28px] font-bold leading-tight mb-[8px]">
          Your AI-powered job-prep stack,
          <br /> built by students who ship.
        </div>
        <div className="text-[20px] text-[#555] max-w-[560px] mx-auto mb-[16px]">
          Resume analyzer, ATS score, interview simulator, cover-letter
          drafting, cold-outreach generator, and 6 more tools - all in one
          place.
        </div>
        <div className="flex justify-center gap-[8px] flex-wrap">
          <button
            type="button"
            className="px-[14px] py-[8px] text-white text-[19px] font-bold"
            style={{ background: "#0a1a33", borderRadius: 6 }}
            onClick={openReal}
          >
            Try the Analyzer ↗
          </button>
          <button
            type="button"
            className="px-[14px] py-[8px] text-[19px] font-bold border border-[#0a1a33]"
            style={{ borderRadius: 6 }}
            onClick={() => openApp("bulletproof")}
          >
            See how we built it
          </button>
          <button
            type="button"
            className="px-[14px] py-[8px] text-[19px] border border-[#0a1a33]"
            style={{ borderRadius: 6 }}
            onClick={() => openApp("contact")}
          >
            Message the founder
          </button>
        </div>
      </div>

      <div className="px-[20px] py-[20px]">
        <div className="text-[21px] font-bold mb-[10px]">By the numbers</div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-[10px] text-center text-[19px]">
          <Stat big="75,000+" small="Monthly platform requests (Month 1)" />
          <Stat big="200,000" small="Resumes powering the ATS model" />
          <Stat big="11" small="AI tools in production" />
          <Stat big="1,400+" small="Students reached in talks" />
          <Stat big="80,000+" small="Cross-platform views (1 mo)" />
          <Stat big="7" small="Team members across 4 universities" />
        </div>
      </div>

      <div className="px-[20px] py-[16px]" style={{ background: "#f6f8fb" }}>
        <div className="text-[21px] font-bold mb-[8px]">The 11 tools</div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-[6px] text-[18px]">
          {[
            "Resume Analyzer",
            "ATS Score + Keyword Fix",
            "Cover-Letter Writer",
            "Interview Simulator",
            "Behavioral Practice",
            "Cold-Outreach Generator",
            "LinkedIn Optimizer",
            "Job-Fit Ranker",
            "Company Research Pack",
            "Salary Negotiation Coach",
            "Portfolio Writer",
          ].map((t) => (
            <button
              key={t}
              type="button"
              onClick={openReal}
              className="bg-white border border-[#d0d0d0] p-[8px] text-left hover:border-[#0a1a33]"
            >
              ✓ {t}
            </button>
          ))}
        </div>
      </div>

      <div className="px-[20px] py-[20px] text-center text-[18px] text-[#666]">
        © 2026 Bulletproof AI · Local Launch Studio Co. · Philadelphia, PA
        <br />
        <button
          type="button"
          onClick={openReal}
          className="underline bg-transparent mt-[4px]"
        >
          Open the real BulletproofAI.org ↗
        </button>
      </div>
    </div>
  );
}

function BPNavChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-[8px] py-[4px] hover:bg-white/10 bg-transparent text-white/90 rounded"
    >
      {label}
    </button>
  );
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <div className="border border-[#d0d0d0] bg-white p-[10px]">
      <div className="text-[24px] font-bold" style={{ color: "#0a66c2" }}>
        {big}
      </div>
      <div className="text-[18px] text-[#555]">{small}</div>
    </div>
  );
}


/* --------------------------------------------------------------
   About shortcut - for the "willzhang" URL
   -------------------------------------------------------------- */
function AboutShortcut() {
  return (
    <div className="p-[40px] flex flex-col items-center gap-[12px] text-center">
      <div className="text-[19px] font-bold">Will Zhang's Portfolio</div>
      <div className="text-[18px] text-[#555]">
        Open the About window or the Excel workbook.
      </div>
      <div className="flex gap-[8px]">
        <button className="win-btn" onClick={() => openApp("about")}>
          Open About →
        </button>
        <button className="win-btn" onClick={() => openApp("excel")}>
          Open WillZhang.xlsx →
        </button>
      </div>
    </div>
  );
}
