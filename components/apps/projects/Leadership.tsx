"use client";

import type { WindowState } from "@/lib/wm/types";

const ROLES = [
  {
    org: "The Good Idea Fund",
    role: "Director of Relations",
    since: "Jan 2026",
    scope: [
      "Allocate $100,000+ across 100+ student budget proposals",
      "Public outreach, recruiting, and partner relationships",
      "Drexel's largest student-run funding organization",
    ],
  },
  {
    org: "Drexel Consulting Group",
    role: "Venture Advisory Consultant, Sport Entertainment Consultant",
    since: "Mar 2026",
    scope: [
      "Growing Gen Z exposure by overseeing 14.3M+ total followers for WOLF Financial's Marketing Team",
    ],
  },
  {
    org: "Google Developer Group",
    role: "Primary Technical Lead",
    since: "Mar 2026",
    scope: [
      "Leading Google CodeLab workshops on campus",
      "Tracks: Machine Learning, AI Studio, SubAgent",
    ],
  },
  {
    org: "Drexel High Finance Program",
    role: "Public Market",
    since: "Apr 2026",
    scope: [
      "Selective cohort focused on market research and portfolio construction",
      "LeBow College of Business",
    ],
  },
];

export default function Leadership({ window: _ }: { window: WindowState }) {
  return (
    <div className="flex flex-col h-full overflow-auto win-scroll">
      <div className="p-[16px] border-b border-[#808080]">
        <div className="font-bold text-[20px]">Leadership - Drexel ecosystem</div>
        <div className="text-[20px] italic">
          Four concurrent roles in finance, consulting, engineering community, and campus programs.
        </div>
      </div>

      <div className="p-[16px] space-y-[14px] text-[20px] leading-relaxed">
        {ROLES.map((r) => (
          <div key={r.org} className="win-window p-[10px]">
            <div className="flex items-baseline justify-between gap-[10px]">
              <div className="font-bold text-[18px]">{r.org}</div>
              <div className="text-[19px] text-[color:var(--color-win-text-disabled)]">
                Since {r.since}
              </div>
            </div>
            <div className="italic mb-[4px]">{r.role}</div>
            <ul className="list-disc pl-[18px] space-y-[2px]">
              {r.scope.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
