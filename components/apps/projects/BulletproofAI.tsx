"use client";

import type { WindowState } from "@/lib/wm/types";
import { openApp } from "@/lib/wm/registry";

export default function BulletproofAI({ window: _ }: { window: WindowState }) {
  return (
    <div className="flex flex-col h-full overflow-auto win-scroll">
      <div className="p-[16px] border-b border-[#808080]">
        <div className="font-bold text-[20px]">
          Bulletproof AI · Local Launch Studio Co.
        </div>
        <div className="text-[20px] italic">
          Co-Founder · December 2025 – Present · Philadelphia, PA
        </div>
      </div>

      <div className="p-[16px] space-y-[10px] text-[20px] leading-relaxed">
        <Section title="What it is">
          Bulletproof AI is an AI-powered job preparation platform - resume
          analyzer, interview coach, cover-letter drafting, ATS scoring, and
          more. Also the consultancy arm (Local Launch Studio) ships full
          websites + SEO + Google Ads campaigns for local SMBs across NJ, PA,
          and DE.
        </Section>

        <Section title="What I built">
          <ul className="list-disc pl-[18px] space-y-[2px]">
            <li>
              Full-stack Next.js 15 platform with 11 production AI tools (resume
              analyzer, cover-letter writer, interview simulator, ATS scorer,
              cold-outreach generator, and more).
            </li>
            <li>
              RAG pipeline over 200,000 resumes to power the in-house ATS
              scoring model.
            </li>
            <li>
              10+ client websites with measurable SEO + paid-search traction.
            </li>
          </ul>
        </Section>

        <Section title="Team I lead">
          Seven people across UVA, UMD, Purdue, and MIT - content, engineering,
          and growth. Weekly sync, shared roadmap, shipped consistently since
          day one.
        </Section>

        <Section title="Distribution">
          Presented to 1,400+ students in lectures; drove 80,000+ cross-platform
          views in the first month across 3 platforms. Established Bulletproof
          AI as Drexel's largest student job-prep resource.
        </Section>

        <Section title="Numbers that matter">
          <Stat label="Monthly platform requests (Month 1)" value="75,000+" />
          <Stat label="Client websites shipped" value="10+" />
          <Stat label="SEO growth delivered" value="300%+" />
          <Stat label="Students reached via talks" value="1,400+" />
          <Stat label="Cross-platform views (1 mo)" value="80,000+" />
          <Stat label="Team members" value="7 across 4 schools" />
        </Section>

        <Section title="Why this reflects how I work">
          I like the full stack of shipping - product, code, GTM, partnerships.
          Bulletproof AI is proof I can hold all of them at once without
          dropping the ball.
        </Section>

        <div className="pt-[6px]">
          <button
            type="button"
            className="win-btn"
            onClick={() =>
              openApp("ie", {
                url: "https://bulletproofai.org",
                title: "BulletproofAI.org",
              })
            }
          >
            Open BulletproofAI.org
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-bold text-[18px] mb-[2px]">{title}</div>
      <div>{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-[12px] border-b border-dashed border-[#c0c0c0] py-[2px]">
      <div>{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}
