"use client";

import type { WindowState } from "@/lib/wm/types";
import { useState } from "react";

/**
 * Speaking engagements - TEXT-ONLY event cards + a generic-captioned photo
 * gallery below. Same pattern as GolfMemories: the authoritative data lives
 * in the text cards (dates, audience sizes, venues) so the photo assignment
 * can never mis-label an event. The gallery just shows "Speaking era ·
 * 2025–2026" on every tile.
 */
const EVENTS: Array<{
  title: string;
  when: string;
  where: string;
  audience: string;
  body: string;
  tag?: string;
}> = [
  {
    title: "Bulletproof AI @ Drexel BUSN 102",
    when: "December 2025",
    where: "Drexel University · LeBow College of Business",
    audience: "3 back-to-back lectures · ~1,400+ freshman business majors",
    body:
      "Presented Bulletproof AI across three BUSN 102 sections, reaching the entire freshman business cohort. Walked through the resume-analyzer, ATS scoring model, and why a peer-review pain point turned into 11 live AI tools with 75,000+ monthly tool runs. Closing slide: “Confidence.”",
    tag: "invited talk",
  },
  {
    title: "PGA of America - Marketing Crisis Challenge",
    when: "February 2026",
    where: "Drexel LeBow auditorium · Philadelphia Section PGA",
    audience: "Live-judged stage pitch",
    body:
      "Team pitch on a PGA of America marketing-crisis brief. Built the 10-year revenue model, walked the Topgolf/simulator funnel, REACH expansion, and corporate-program lanes, and delivered the close under the “We Love This Game” banner. Co-presenters: Will Walker III, Aaisha Memon, Kyle Chen.",
    tag: "competition",
  },
  {
    title: "Finance Impact Challenge - Ben & Gerri’s Café",
    when: "January 2026",
    where: "Drexel LeBow · judged live",
    audience: "Judge panel + student audience",
    body:
      "Presented financial recommendations for Ben & Gerri’s Café. Built the model, structured the deck, defended the thesis under Q&A. Teammates: Michael Zong, Jeswin Geigy, Neil Rayarao.",
    tag: "competition",
  },
  {
    title: "BUSN 101 / 102 - Reflection Talk",
    when: "January 2026",
    where: "Drexel LeBow",
    audience: "Class reflection session",
    body:
      "Reflection talk on what BUSN 101/102 actually teaches when you’re running something on the side - values, product sense, and why shipping early beats polishing slides.",
    tag: "class talk",
  },
  {
    title: "Bulletproof AI - Product Launch",
    when: "December 2025",
    where: "Drexel classroom · recorded",
    audience: "Team + student audience · launch video",
    body:
      "Live platform walkthrough for the launch video: resume analyzer, interview simulator, ATS scoring. Same footage now lives on the Bulletproof AI company page.",
    tag: "product launch",
  },
  {
    title: "Philly CodeFest 2026: PhilAIsion (1st Place)",
    when: "April 2026",
    where: "Drexel CCI · live demo on stage",
    audience: "~400 participants · judges · $3,000 winner share",
    body:
      "Stage demo of PhilAIsion - a voice-first AI civic agent running on a $50 Raspberry Pi 4 kiosk. Walked judges through 311 filing, BRT tax appeals, benefits screening, and legal-aid routing in 10 languages. Took home 1st place in the Advanced Track.",
    tag: "hackathon · 1st place",
  },
  {
    title: "2026 Datathon with Deloitte",
    when: "March 2026",
    where: "Drexel LeBow × Deloitte",
    audience: "Judge panel · live pitch",
    body:
      "Finalist. Industry-focused analytics competition - cleaned and modeled a Deloitte-sponsored dataset end-to-end, presented the key insight and recommendation to the sponsor panel.",
    tag: "competition · finalist",
  },
  {
    title: "Dean’s Student Advisory Board - Equity Research Challenge",
    when: "February 2026",
    where: "Drexel LeBow · Dean’s SAB",
    audience: "Senior students + faculty panel",
    body:
      "Finalist. Wrote an equity-research thesis, defended the buy/sell recommendation live in front of a panel of upperclassmen and Drexel faculty.",
    tag: "competition · finalist",
  },
  {
    title: "Philly-Wide Case Competition - BCG × Aramark",
    when: "March 2026",
    where: "Philadelphia · BCG + Aramark sponsors",
    audience: "BCG + Aramark consulting + brand panels",
    body:
      "Finalist. City-wide undergraduate case competition co-hosted by Boston Consulting Group and Aramark. Delivered the strategic recommendation deck live to combined BCG/Aramark panels.",
    tag: "competition · finalist",
  },
  {
    title: "UEV Venture Building Competition",
    when: "February 2026",
    where: "Drexel - Urban Entrepreneurship & Ventures",
    audience: "Judge panel · live pitch",
    body:
      "Team venture-building competition. Built the full company concept end-to-end - problem, pricing, operations, GTM - and pitched it to judges.",
    tag: "competition",
  },
  {
    title: "Baiada Institute Innovation Tournament",
    when: "January 2026",
    where: "Drexel LeBow · Baiada Institute for Entrepreneurship",
    audience: "Innovation tournament judges",
    body:
      "Innovation tournament - pitched a product concept with full business model (deck, pricing, operations plan) to a judging panel from the Baiada Institute.",
    tag: "competition",
  },
];

const GALLERY_FILES = [
  "personal-1.jpg",
  "personal-2.jpg",
  "personal-3.jpg",
  "personal-4.jpg",
  "personal-5.jpg",
  "personal-6.jpg",
  "personal-7.jpg",
  "busn102-drexel.jpg",
  "pga-marketing-crisis.jpg",
  "finance-impact-challenge.jpg",
  "busn101-reflection.jpg",
  "bulletproof-launch.jpg",
];

export default function SpeakingEngagements({
  window: _,
}: {
  window: WindowState;
}) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Title band */}
      <div className="win-raised flex items-center gap-[8px] px-[8px] py-[6px] border-b border-[#808080]">
        <img
          src="/icons/mic.svg"
          alt=""
          width={28}
          height={28}
          className="pixelated shrink-0"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[18px]">Public Speaking</div>
          <div className="text-[19px] italic text-[color:var(--color-win-text-disabled)]">
            Invited talks · competitions · product launches · 2025–2026
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-auto win-scroll">
        {/* Photo gallery - generic captions so nothing can mismatch */}
        <div className="p-[12px] border-b border-[#808080]">
          <SectionTitle>On stage &amp; in the room</SectionTitle>
          <div
            className="grid gap-[10px]"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            }}
          >
            {GALLERY_FILES.map((file) => (
              <button
                key={file}
                type="button"
                className="win-window bg-white p-[4px] flex flex-col gap-[4px] text-left hover:bg-[#eef3f8]"
                onClick={() => setLightboxSrc(`/speaking/${file}`)}
              >
                <div
                  className="win-sunken w-full flex items-center justify-center"
                  style={{
                    aspectRatio: "4 / 3",
                    background: "#e5e5e5",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={`/speaking/${file}`}
                    alt="Public speaking"
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                    onError={(e) => {
                      const el = e.currentTarget as HTMLImageElement;
                      const tile = el.closest("button");
                      if (tile) (tile as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
                <div className="text-[19px] text-[color:var(--color-win-text-disabled)]">
                  Speaking era · 2025 – 2026
                </div>
              </button>
            ))}
          </div>
          <div className="mt-[10px] text-[19px] italic text-[color:var(--color-win-text-disabled)] leading-relaxed">
            Photos from my phone + LinkedIn posts across the BulletproofAI
            lectures, PGA Marketing Crisis Challenge, Finance Impact Challenge,
            and launch talks. Captions stay generic - the Events section below
            is the authoritative record.
          </div>
        </div>

        {/* Narrative */}
        <div className="p-[12px] border-b border-[#808080] bg-[#fffbe8] text-[20px] leading-relaxed">
          <p>
            In the past year I’ve gone from classroom presentations to
            live-stage pitches, back-to-back lectures, and product-launch
            talks. Most of it comes out of Bulletproof AI and the competition
            circuit at Drexel LeBow - invited talks for BUSN 101/102,
            marketing and finance case challenges, and launch demos for the
            product itself.
          </p>
        </div>

        {/* Events - text-only cards */}
        <div className="p-[12px] border-b border-[#808080]">
          <SectionTitle>Events</SectionTitle>
          <div className="flex flex-col gap-[8px]">
            {EVENTS.map((e) => (
              <div
                key={e.title}
                className="win-window bg-white p-[10px] flex gap-[10px]"
              >
                <Podium />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-[6px] flex-wrap">
                    <div className="font-bold text-[18px] leading-tight">
                      {e.title}
                    </div>
                    {e.tag && (
                      <span
                        className="text-[18px] uppercase tracking-wide border border-[#808080] px-[4px] py-[1px]"
                        style={{ background: "#fff3b0" }}
                      >
                        {e.tag}
                      </span>
                    )}
                  </div>
                  <div className="text-[19px] mt-[2px] text-[color:var(--color-win-text-disabled)]">
                    {e.when} · {e.where}
                  </div>
                  <div className="text-[19px] mt-[1px] text-[#444]">
                    <b>Audience:</b> {e.audience}
                  </div>
                  <div className="text-[20px] mt-[4px] leading-relaxed text-[#222]">
                    {e.body}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reach summary */}
        <div className="p-[12px] bg-[#f8f8f8]">
          <SectionTitle>Reach - at a glance</SectionTitle>
          <div
            className="grid gap-[8px]"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <Stat label="Total speaking events" value="11" />
            <Stat label="Students reached (lectures)" value="1,400+" />
            <Stat label="Competitions pitched live" value="7" />
            <Stat label="Finalist / 1st-place finishes" value="5" />
          </div>
          <div className="text-[19px] italic text-[color:var(--color-win-text-disabled)] mt-[6px] leading-relaxed">
            “Talks” counts invited classroom / lecture slots. The 1,400+ figure
            is the BUSN 102 attendance across three Drexel lectures.
            Competitions cover every live-pitch event (PGA, Howley, DSAB,
            Philly CodeFest, BCG × Aramark, UEV, Datathon, Baiada).
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-[#808080] px-[10px] py-[4px] text-[19px] text-[color:var(--color-win-text-disabled)] flex justify-between">
        <span>Click any photo to view full-size</span>
        <span>Speaking era · 2025 – 2026</span>
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-[20px]"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={() => setLightboxSrc(null)}
        >
          <div
            className="win-window bg-white p-[4px] flex flex-col gap-[6px] max-w-full max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="win-sunken" style={{ background: "#000" }}>
              <img
                src={lightboxSrc}
                alt=""
                style={{
                  display: "block",
                  maxWidth: "85vw",
                  maxHeight: "75vh",
                  objectFit: "contain",
                }}
              />
            </div>
            <div className="px-[8px] pb-[4px] flex items-center gap-[10px] text-[20px]">
              <span className="flex-1 italic text-[color:var(--color-win-text-disabled)]">
                Speaking era · 2025 – 2026
              </span>
              <button
                type="button"
                className="win-btn"
                onClick={() => setLightboxSrc(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-bold text-[18px] mb-[8px] border-b border-[#808080] pb-[2px]"
      style={{ letterSpacing: "0.3px" }}
    >
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="win-sunken bg-white p-[6px] flex flex-col gap-[2px]">
      <div className="text-[19px] text-[color:var(--color-win-text-disabled)]">
        {label}
      </div>
      <div className="font-bold text-[20px]">{value}</div>
    </div>
  );
}

/** Tiny pixel-style podium/mic SVG for event cards. */
function Podium() {
  return (
    <svg
      width="36"
      height="44"
      viewBox="0 0 36 44"
      className="shrink-0"
      shapeRendering="crispEdges"
    >
      {/* Mic */}
      <rect x="15" y="2" width="6" height="10" fill="#c0c0c0" stroke="#000" />
      <rect x="16" y="4" width="4" height="1" fill="#888" />
      <rect x="16" y="6" width="4" height="1" fill="#888" />
      <rect x="16" y="8" width="4" height="1" fill="#888" />
      <rect x="17" y="12" width="2" height="6" fill="#555" />
      {/* Podium */}
      <polygon points="6,18 30,18 28,40 8,40" fill="#a06a3c" stroke="#000" />
      <rect x="8" y="24" width="20" height="2" fill="#6b4422" />
      {/* Stage */}
      <rect x="2" y="40" width="32" height="3" fill="#555" />
      {/* Sound waves */}
      <path d="M2 8 Q0 12 2 16" stroke="#ff6600" strokeWidth="1" fill="none" />
      <path d="M34 8 Q36 12 34 16" stroke="#ff6600" strokeWidth="1" fill="none" />
    </svg>
  );
}
