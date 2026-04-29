"use client";

import type { WindowState } from "@/lib/wm/types";
import { useState } from "react";

/**
 * Tours with finish counts - TEXT ONLY.
 *
 * These tiles don't carry a photo, so the copy is guaranteed to be
 * accurate regardless of which image ends up in the gallery below.
 * This prevents the "wrong photo on a medal tile" problem.
 */
const TOURS: Array<{ tour: string; accent: string; finishes: string }> = [
  {
    tour: "PGA Southern California Junior Tour",
    accent: "silver",
    finishes: "3× 2nd place · 2× 3rd place",
  },
  {
    tour: "Philadelphia Section PGA Junior Tour",
    accent: "silver",
    finishes: "2× 2nd place",
  },
  {
    tour: "TYGA - Tarheel Youth Golf Association",
    accent: "silver",
    finishes: "1× 2nd place (North Carolina)",
  },
  {
    tour: "China National Junior tournaments",
    accent: "podium",
    finishes: "2× podium finishes",
  },
];

/**
 * On-course photos + all available gallery shots.
 *
 * Files live in /public/golf-memories/. Any `golf-N.jpg` or `candidate-N.jpg`
 * (up to the numbers below) that exists on disk will render; missing files
 * silently skip (the onError handler hides the tile).
 */
const GALLERY_FILES = [
  "golf-1.jpg",
  "golf-2.jpg",
  "golf-3.jpg",
  "golf-4.jpg",
  "golf-5.jpg",
  "candidate-11.jpg",
  "candidate-12.jpg",
  "candidate-13.jpg",
  "candidate-14.jpg",
  "candidate-15.jpg",
];

export default function GolfMemories({ window: _ }: { window: WindowState }) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Title band */}
      <div className="win-raised flex items-center gap-[8px] px-[8px] py-[6px] border-b border-[#808080]">
        <img
          src="/icons/golf.svg"
          alt=""
          width={28}
          height={28}
          className="pixelated shrink-0"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[18px]">Golf Memories</div>
          <div className="text-[19px] italic text-[color:var(--color-win-text-disabled)]">
            Junior golf era · multiple tours · US + China
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-auto win-scroll">
        {/* Photo gallery - pictures on top */}
        <div className="p-[12px] border-b border-[#808080]">
          <SectionTitle>On the course</SectionTitle>
          <div
            className="grid gap-[10px]"
            style={{
              gridTemplateColumns:
                "repeat(auto-fill, minmax(160px, 1fr))",
            }}
          >
            {GALLERY_FILES.map((file) => (
              <button
                key={file}
                type="button"
                className="win-window bg-white p-[4px] flex flex-col gap-[4px] text-left hover:bg-[#eef3f8]"
                onClick={() => setLightboxSrc(`/golf-memories/${file}`)}
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
                    src={`/golf-memories/${file}`}
                    alt="Junior golf era"
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                    onError={(e) => {
                      // Silently hide missing tiles
                      const el = e.currentTarget as HTMLImageElement;
                      const tile = el.closest("button");
                      if (tile) (tile as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
                <div className="text-[19px] text-[color:var(--color-win-text-disabled)]">
                  Junior golf era · 2018 – 2020
                </div>
              </button>
            ))}
          </div>
          <div className="mt-[10px] text-[19px] italic text-[color:var(--color-win-text-disabled)] leading-relaxed">
            Captions kept generic on purpose. The tournament counts in the
            Hardware section below are the authoritative record.
          </div>
        </div>

        {/* Tournament Hardware - text-only medal tiles (cannot mismatch) */}
        <div className="p-[12px] border-b border-[#808080]">
          <SectionTitle>Tournament Hardware</SectionTitle>
          <div
            className="grid gap-[8px] mb-[10px]"
            style={{
              gridTemplateColumns:
                "repeat(auto-fit, minmax(200px, 1fr))",
            }}
          >
            {TOURS.map((t) => (
              <div
                key={t.tour}
                className="win-window bg-white p-[10px] flex items-center gap-[10px]"
              >
                <Medal accent={t.accent} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[20px] leading-tight">
                    {t.tour}
                  </div>
                  <div className="text-[19px] mt-[2px] text-[#444]">
                    {t.finishes}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Trophy wall hero image */}
          <div className="mt-[10px]">
            <button
              type="button"
              className="win-window bg-white p-[4px] w-full text-left hover:bg-[#eef3f8]"
              onClick={() => setLightboxSrc("/golf-memories/trophy-wall.jpg")}
              title="The trophy wall - click to view full-size"
            >
              <div
                className="win-sunken flex items-center justify-center"
                style={{
                  background: "#e5e5e5",
                  minHeight: 100,
                }}
              >
                <img
                  src="/golf-memories/trophy-wall.jpg"
                  alt="Trophy wall - stacked medals including China 2nd, 3rd, and multiple US 2nd-place finishes"
                  style={{
                    width: "100%",
                    height: "auto",
                    display: "block",
                  }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display =
                      "none";
                    const p = (e.currentTarget as HTMLImageElement).parentElement;
                    if (p && !p.querySelector("[data-missing]")) {
                      const m = document.createElement("div");
                      m.setAttribute("data-missing", "true");
                      m.style.cssText =
                        "color:#888;font-size:11px;padding:20px;text-align:center";
                      m.textContent =
                        "Save the trophy-wall screenshot as public/golf-memories/trophy-wall.jpg";
                      p.appendChild(m);
                    }
                  }}
                />
              </div>
              <div className="text-[19px] mt-[4px] text-[color:var(--color-win-text-disabled)] italic">
                The full wall. Medals from the PGA SoCal Junior Tour, Philly
                Section, TYGA, and China national junior tournaments.
              </div>
            </button>
          </div>
        </div>

        {/* Narrative - moved to the bottom so pictures lead the page */}
        <div className="p-[12px] bg-[#fffbe8] text-[20px] leading-relaxed">
          <p className="mb-[6px]">
            Before business, before AI, before any of this. I was a
            competitive junior golfer. Early mornings, long range sessions,
            tournaments on weekends. Golf taught me most of what I still use
            today: patience, process, and respect for a system bigger than any
            single swing.
          </p>
          <p className="mb-[6px]">
            The hardware:{" "}
            <b>3× 2nd and 2× 3rd on the PGA Southern California Junior Tour</b>,{" "}
            <b>2× 2nd on the Philadelphia Section PGA Junior Tour</b>,{" "}
            <b>1× 2nd on the TYGA (Tarheel Youth Golf Association)</b> in North
            Carolina, and <b>2× podium in China</b> (national junior
            tournaments).
          </p>
          <p className="mb-[6px]">
            That career ended the way these things usually do.{" "}
            <b>I injured my lower back and was diagnosed with a slipped disc</b>.
            The torque a competitive swing puts on the spine made it impossible
            to keep playing at that level without making things worse, so I
            stopped competing.
          </p>
          <p className="italic text-[color:var(--color-win-text-disabled)]">
            Still play casually. Still think about approach shots when I'm
            solving problems. The operations work with Super Lychee Golf
            Series and the CNIPA Multi-Purpose Golf Bag patent both come from
            this era.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-[#808080] px-[10px] py-[4px] text-[19px] text-[color:var(--color-win-text-disabled)] flex justify-between">
        <span>Click any photo to view full-size</span>
        <span>Junior golf era · 2018 – 2020</span>
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
                Junior golf era · 2018 – 2020
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

/**
 * Tiny SVG medal - color-coded by accent. No photo dependency, so the
 * tile is guaranteed to render even if the user never adds a photo.
 */
function Medal({ accent }: { accent: string }) {
  const color =
    accent === "gold"
      ? "#e0b82b"
      : accent === "silver"
        ? "#c0c0c0"
        : accent === "podium"
          ? "#cd7f32"
          : "#e0b82b";
  const ribbon = accent === "gold" ? "#1a4d8f" : accent === "silver" ? "#6b8caf" : "#c84141";
  return (
    <svg
      width="40"
      height="48"
      viewBox="0 0 40 48"
      className="shrink-0"
      shapeRendering="crispEdges"
    >
      {/* Ribbon */}
      <polygon points="10,0 16,0 22,20 12,20" fill={ribbon} />
      <polygon points="30,0 24,0 18,20 28,20" fill={ribbon} />
      <polygon points="16,0 24,0 24,6 16,6" fill={ribbon} />
      {/* Medal */}
      <circle cx="20" cy="32" r="13" fill={color} stroke="#000" strokeWidth="1" />
      <circle cx="20" cy="32" r="9" fill="none" stroke="#000" strokeWidth="0.5" opacity="0.5" />
      <text
        x="20"
        y="36"
        textAnchor="middle"
        fontFamily="Arial"
        fontSize="11"
        fontWeight="bold"
        fill="#000"
      >
        ★
      </text>
    </svg>
  );
}
