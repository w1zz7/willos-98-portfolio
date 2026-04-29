"use client";

import { useState, useEffect } from "react";
import type { WindowState } from "@/lib/wm/types";
import { openLink } from "@/lib/wm/openLink";

export default function PhilAIsion({ window: _ }: { window: WindowState }) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  return (
    <div className="relative flex flex-col h-full overflow-auto win-scroll">
      {/* Hero: winning check photo at the top of the page - shown in full
          (object-fit: contain) so the team + check are never cropped out.
          Left/right letterbox bars carry a "scroll for more" hint with a
          bouncing down arrow so users know the page continues below. */}
      <style>{`
        @keyframes philaision-bounce {
          0%, 100% { transform: translateY(0); opacity: 0.85; }
          50%      { transform: translateY(8px); opacity: 1; }
        }
      `}</style>
      <button
        type="button"
        className="relative block w-full p-0 border-0 cursor-zoom-in"
        onClick={() => setLightbox("/linkedin/philaision-check.jpg")}
        aria-label="View winning check photo"
        style={{ background: "#111" }}
      >
        <img
          src="/linkedin/philaision-check.jpg"
          alt="PhilAIsion team holding the $3,000 Philly CodeFest 1st-place check (Advanced Track) · April 12, 2026"
          loading="eager"
          style={{
            display: "block",
            width: "100%",
            height: 560,
            objectFit: "contain",
            background: "#111",
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />

        {/* Left scroll hint */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#fff",
            pointerEvents: "none",
            textAlign: "center",
            fontFamily: "var(--font-cell)",
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
            lineHeight: 1.25,
            zIndex: 2,
          }}
        >
          <div style={{ fontSize: 14, opacity: 0.85, letterSpacing: 1 }}>
            SCROLL
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>down</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>
            for more
          </div>
          <div
            style={{
              fontSize: 42,
              marginTop: 6,
              animation: "philaision-bounce 1.4s ease-in-out infinite",
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.7))",
            }}
          >
            ↓
          </div>
        </div>

        {/* Right scroll hint */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#fff",
            pointerEvents: "none",
            textAlign: "center",
            fontFamily: "var(--font-cell)",
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
            lineHeight: 1.25,
            zIndex: 2,
          }}
        >
          <div style={{ fontSize: 14, opacity: 0.85, letterSpacing: 1 }}>
            KEEP
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>scrolling</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>
            project details
          </div>
          <div
            style={{
              fontSize: 42,
              marginTop: 6,
              animation: "philaision-bounce 1.4s ease-in-out infinite 0.35s",
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.7))",
            }}
          >
            ↓
          </div>
        </div>
      </button>

      <div className="p-[16px] border-b border-[#808080] flex items-center gap-[10px]">
        <img
          src="/icons/trophy.svg"
          alt=""
          width={56}
          height={56}
          className="pixelated"
          style={{ imageRendering: "pixelated" }}
        />
        <div>
          <div className="font-bold text-[20px]">
            PhilAIsion - Philly CodeFest 2026 (Winner, Advanced Track)
          </div>
          <div className="text-[20px] italic">
            April 12, 2026 · ~400 participants · $3,000 winner share · 1st place
          </div>
        </div>
      </div>

      <div className="p-[16px] space-y-[10px] text-[20px] leading-relaxed">
        <div>
          <div className="font-bold text-[18px] mb-[2px]">The problem</div>
          Philadelphia residents - especially non-English speakers, elderly,
          and low-income communities - struggle to access city services buried
          across dozens of websites, phone trees, and PDF forms.
        </div>

        <div>
          <div className="font-bold text-[18px] mb-[2px]">
            What PhilAIsion is
          </div>
          A conversational AI agent that speaks your language, understands
          your problem, and takes action on your behalf. Walk up to a kiosk or
          open your phone. Say what you need to Phil. Phil will automatically
          file a 311 report, draft a BRT tax appeal, submit any PDF for you,
          connect you to legal aid, check your benefits eligibility, or email
          an organization's intake team. Everything is voice-driven with
          real-time text-to-speech, so literacy is never a barrier.
        </div>

        <div>
          <div className="font-bold text-[18px] mb-[2px]">Key features</div>
          <ul className="list-disc pl-[18px] space-y-[2px]">
            <li>Voice-first kiosk mode on a $50 Raspberry Pi 4</li>
            <li>10-language support via react-i18next</li>
            <li>
              Auto form-filling across 311, BRT appeals, and arbitrary PDFs
            </li>
            <li>
              AI agent actions: 311 filing, email outreach, legal matching,
              benefits screening
            </li>
            <li>
              Anonymous access for undocumented residents + civic document
              library
            </li>
          </ul>
        </div>

        <div>
          <div className="font-bold text-[18px] mb-[2px]">Stack</div>
          <div className="flex flex-wrap gap-[4px]">
            {[
              "Philly 311 API",
              "React 18 + Vite",
              "Node.js + Express + Prisma",
              "Supabase (auth + Postgres)",
              "OpenAI (conversational agent)",
              "ElevenLabs (text-to-speech)",
              "Web Speech API (STT)",
              "react-i18next · 10 languages",
              "Framer Motion",
              "Raspberry Pi 4 kiosk",
            ].map((tag) => (
              <span
                key={tag}
                className="bg-white border border-[#808080] px-[6px] py-[1px] text-[19px]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="font-bold text-[18px] mb-[2px]">Outcome</div>
          Took 1st place in the Advanced Track of the biggest 24-hour
          hackathon in Philadelphia. Judges specifically called out
          accessibility impact and hardware-constraint discipline.
        </div>

        <div>
          <div className="font-bold text-[18px] mb-[2px]">
            Why it reflects how I work
          </div>
          Real constraints (hardware, time, language). Real users (non-English
          speakers, civic services consumers). Real output - a working kiosk,
          not a slide deck.
        </div>

        <div>
          <div className="font-bold text-[18px] mb-[6px]">Build photos</div>
          <div
            className="grid gap-[10px]"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            }}
          >
            {["philaision-1.jpg", "philaision-2.jpg", "philaision-3.jpg"].map(
              (file) => (
                <button
                  key={file}
                  type="button"
                  className="win-sunken bg-white p-[3px] cursor-zoom-in"
                  style={{
                    aspectRatio: "4 / 3",
                    overflow: "hidden",
                    border: 0,
                  }}
                  onClick={() => setLightbox(`/linkedin/${file}`)}
                  aria-label={`View ${file} full-size`}
                >
                  <img
                    src={`/linkedin/${file}`}
                    alt="PhilAIsion team build"
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                </button>
              )
            )}
          </div>
          <div className="text-[19px] italic text-[color:var(--color-win-text-disabled)] mt-[6px]">
            Shots from the 24-hour build - team on the kiosk, the Raspberry Pi 4
            hardware, and the room during judging. Click any photo to view
            full-size.
          </div>
        </div>

        <div className="pt-[6px] flex gap-[6px] flex-wrap">
          <button
            type="button"
            className="win-btn"
            onClick={() =>
              openLink("https://github.com/Gilugali/Ben-Franklin")
            }
          >
            View source on GitHub →
          </button>
        </div>
      </div>

      {/* Lightbox - click outside / × / Esc to dismiss */}
      {lightbox && (
        <div
          className="absolute inset-0 z-50 flex items-stretch justify-center p-[16px]"
          style={{ background: "rgba(0,0,0,0.78)" }}
          onClick={() => setLightbox(null)}
          role="dialog"
        >
          <div
            className="win-window bg-white p-[4px] flex flex-col gap-[6px]"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "100%",
              maxHeight: "100%",
              minHeight: 0,
            }}
          >
            <div
              className="win-sunken flex items-center justify-center flex-1 min-h-0"
              style={{ background: "#000" }}
            >
              <img
                src={lightbox}
                alt=""
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
              <span className="flex-1 italic text-[color:var(--color-win-text-disabled)]">
                Philly CodeFest 2026 · PhilAIsion
              </span>
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
