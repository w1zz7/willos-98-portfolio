"use client";

import type { WindowState } from "@/lib/wm/types";
import { useEffect, useState } from "react";

/**
 * High School - Cherry Hill High School East (Sep 2021 - Jun 2025).
 *
 * LinkedIn-flavored card that opens above the scrollable gallery. Each
 * activity reads from a single source (no "wrong photo on the wrong
 * tile" problem). Media thumbnails click to a full-size lightbox.
 */

interface HsMedia {
  src: string;
  title: string;
  caption?: string;
}

interface Activity {
  name: string;
  role?: string;
  body: string;
  accent?: boolean;
}

const MEDIA: HsMedia[] = [
  {
    src: "/linkedin/hs-valorant-2023.jpg",
    title: "2023 NJ Garden State Esports - State Champion",
    caption:
      "Valorant varsity team, Cherry Hill East Esports Club. First state title.",
  },
  {
    src: "/linkedin/hs-valorant-2024.jpg",
    title: "2024 NJ Garden State Esports - State Champion",
    caption:
      "Back-to-back. Two-year run as NJ state champion in Valorant.",
  },
  {
    src: "/linkedin/hs-esports-state-champ.jpg",
    title: "Esports - State Champion (stage finals)",
    caption:
      "Full esports team on-stage at the NJ Garden State Esports finals. 2× champion run in Valorant.",
  },
  {
    src: "/linkedin/hs-esports.jpg",
    title: "Esports Club",
    caption:
      "Vice President. Ran practice ops + scrim scheduling for the Valorant squad.",
  },
  {
    src: "/linkedin/hs-marching-band.jpg",
    title: "Marching Band",
    caption:
      "Cherry Hill East Marching Band - sectional + state-level competition. NJ Marching Band State Champion program.",
  },
];

const ACTIVITIES: Activity[] = [
  {
    name: "Esports Club",
    role: "Vice President · Valorant team",
    body:
      "Vice president of the Cherry Hill East Esports Club. 2× NJ Garden State Esports State Champion in Valorant (2023, 2024). Ran practice ops and scrim scheduling.",
    accent: true,
  },
  {
    name: "Percussion Club",
    role: "President / Founder",
    body:
      "Founded the Percussion Club and served as president. Built it from zero members to a regular practice + performance cadence.",
    accent: true,
  },
  {
    name: "Alternative Band",
    role: "Multi-instrumentalist (guitar / bass / drums) · 5 performances",
    body:
      "Co-founded my own alternative rock band with friends. Played guitar, bass, and drums across the set (rotating by song). Performed 5 times for local churches in the Philly area.",
    accent: true,
  },
  {
    name: "Marching Band",
    role: "Member · NJ State Champion",
    body:
      "Competed with the Cherry Hill East Marching Band - program took the NJ Marching Band State Championship.",
    accent: true,
  },
  {
    name: "Eastside",
    role: "Staff writer",
    body:
      "Contributed to Eastside, the Cherry Hill East student newspaper.",
  },
  {
    name: "Vietnamese Culture Club",
    role: "Dance team",
    body:
      "Danced with the Vietnamese Culture Club - performed at school + community events.",
  },
  {
    name: "Coffee House Talent Show",
    role: "Performer · 2×",
    body:
      "Performed at Cherry Hill East's Coffee House talent show two years in a row.",
  },
];

export default function HighSchool({ window: _ }: { window: WindowState }) {
  const [lightbox, setLightbox] = useState<HsMedia | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  return (
    <div className="relative h-full w-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 flex flex-col bg-white overflow-auto win-scroll">
        {/* Title band */}
        <div className="win-raised flex items-center gap-[10px] px-[10px] py-[8px] border-b border-[#808080] shrink-0">
          <div
            className="win-sunken shrink-0 bg-white overflow-hidden flex items-center justify-center"
            style={{ width: 48, height: 48 }}
          >
            <img
              src="/linkedin/logo-cherry-hill.jpg"
              alt="Cherry Hill High School East"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[19px] leading-tight">
              Cherry Hill High School East
            </div>
            <div className="text-[17px] text-[color:var(--color-win-text-disabled)]">
              September 2021 to June 2025 · Cherry Hill, NJ
            </div>
          </div>
        </div>

        {/* Photo gallery - pictures on top */}
        <div className="p-[12px] border-b border-[#808080]">
          <SectionTitle>Photos</SectionTitle>
          <div
            className="grid gap-[10px]"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            }}
          >
            {MEDIA.map((m) => (
              <button
                key={m.src}
                type="button"
                className="win-window bg-white p-[4px] flex flex-col gap-[4px] text-left hover:bg-[#eef3f8]"
                onClick={() => setLightbox(m)}
                title={`Open "${m.title}" full size`}
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
                    src={m.src}
                    alt={m.title}
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                    onError={(e) => {
                      const el = e.currentTarget as HTMLImageElement;
                      el.style.display = "none";
                    }}
                  />
                </div>
                <div className="text-[16px] font-bold leading-snug px-[2px]">
                  {m.title}
                </div>
                {m.caption && (
                  <div className="text-[14px] text-[color:var(--color-win-text-disabled)] leading-snug px-[2px]">
                    {m.caption}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Activities & Societies */}
        <div className="p-[12px] border-b border-[#808080]">
          <SectionTitle>Activities &amp; Societies</SectionTitle>
          <div className="flex flex-col gap-[8px]">
            {ACTIVITIES.map((a) => (
              <div
                key={a.name}
                className="win-window bg-white p-[10px] flex items-start gap-[10px]"
                style={{ background: a.accent ? "#fffbe8" : "#ffffff" }}
              >
                <div
                  className="w-[40px] h-[40px] shrink-0 flex items-center justify-center font-bold text-white"
                  style={{
                    background: a.accent ? "#b88a00" : "#555",
                    borderRadius: 4,
                    fontSize: 20,
                  }}
                  aria-hidden
                >
                  {a.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[17px] leading-tight">
                    {a.name}
                  </div>
                  {a.role && (
                    <div className="text-[15px] text-[#444]">{a.role}</div>
                  )}
                  <div className="text-[17px] mt-[2px] leading-relaxed text-[#222]">
                    {a.body}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Narrative */}
        <div className="p-[12px] bg-[#fffbe8] text-[18px] leading-relaxed">
          <p className="mb-[6px]">
            Four years at Cherry Hill East (Sep 2021 to Jun 2025). Graduated
            June 2025 and started at Drexel LeBow the following fall.
          </p>
          <p className="italic text-[color:var(--color-win-text-disabled)]">
            The Esports / Percussion / Marching Band combo is where I learned
            to run a room, build a team from scratch, and ship performances
            under pressure. Most of the operations instinct I still use
            (scheduling, set lists, scrim routines) started here.
          </p>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="absolute inset-0 z-50 flex items-stretch justify-center p-[16px]"
          style={{ background: "rgba(0,0,0,0.78)" }}
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-label={lightbox.title}
        >
          <div
            className="win-window bg-white p-[4px] flex flex-col gap-[6px]"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxHeight: "100%", minHeight: 0 }}
          >
            <div
              className="win-sunken flex items-center justify-center flex-1 min-h-0"
              style={{ background: "#000" }}
            >
              <img
                src={lightbox.src}
                alt={lightbox.title}
                style={{
                  display: "block",
                  maxWidth: "100%",
                  maxHeight: "100%",
                  width: "auto",
                  height: "auto",
                  objectFit: "contain",
                }}
              />
            </div>
            <div className="px-[8px] pb-[4px] flex items-center gap-[10px] text-[17px] shrink-0">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[17px] leading-tight truncate">
                  {lightbox.title}
                </div>
                {lightbox.caption && (
                  <div className="text-[15px] text-[color:var(--color-win-text-disabled)] leading-snug">
                    {lightbox.caption}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="win-btn shrink-0"
                onClick={() => setLightbox(null)}
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
