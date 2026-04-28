"use client";

import type { WindowState } from "@/lib/wm/types";
import { useState } from "react";

/**
 * Case competitions & hackathons - aggregated from my LinkedIn Projects tab.
 * Each event is a text-authoritative card (placement, org, date) with its
 * treasury photos. Photos are placed WITHIN the matching event card so a
 * viewer can't mis-read who's in which photo.
 */
interface CaseFile {
  /** Label shown on the download button (no extension). */
  label: string;
  /** Public path under /competitions/{slug}/. */
  path: string;
  /** Canonical file type - drives the icon + button label. */
  kind: "pptx" | "xlsx" | "pdf";
  /** Pre-rendered preview image (first slide / first sheet / first page). */
  preview?: string;
}

interface CaseEntry {
  title: string;
  org: string;
  when: string;
  placement?: string;
  body: string;
  photos: string[];
  /** Real deliverables (deck / model / report). Empty when not shareable. */
  files?: CaseFile[];
}

const ENTRIES: CaseEntry[] = [
  {
    title: "PGA of America - Marketing Crisis Challenge",
    org: "PGA of America (Philadelphia Section) · Drexel LeBow",
    when: "February 2026",
    placement: "Live-stage pitch · Finalist",
    body:
      "Team pitch on the PGA of America marketing-crisis brief. Built a 10-year revenue model, walked the Topgolf/simulator funnel, REACH community expansion, and corporate-program lanes. Delivered the close under the “We Love This Game” banner. Teammates: Will Walker III, Aaisha Memon, Kyle Chen.",
    photos: ["pga-marketing-1.jpg", "pga-marketing-2.jpg"],
    files: [
      {
        label: "PGA-Marketing-Deck",
        path: "/competitions/pga-marketing/PGA-Marketing-Deck.pptx",
        kind: "pptx",
        preview: "/competitions/previews/PGA-Marketing-Deck.pptx.png",
      },
      {
        label: "PGA-Marketing-Model",
        path: "/competitions/pga-marketing/PGA-Marketing-Model.xlsx",
        kind: "xlsx",
        preview: "/competitions/previews/PGA-Marketing-Model.xlsx.png",
      },
    ],
  },
  {
    title: "Philly CodeFest 2026: PhilAIsion",
    org: "Drexel CCI · ~400 participants · $3,000 prize (1st Place · Advanced)",
    when: "April 12, 2026",
    placement: "1st Place · Advanced Track · $3,000",
    body:
      "Built a voice-first AI civic agent on a $50 Raspberry Pi 4 kiosk in 24 hours. 10 languages, 311 filing, BRT appeals, benefits screening. Sponsors on stage: Applied AI Studio, Comcast, Apollo, CSL, Wawa, Drexel CCI Corporate Partners. Full walkthrough in the PhilAIsion window.",
    photos: [
      "philaision-check.jpg",
      "philaision-1.jpg",
      "philaision-2.jpg",
      "philaision-3.jpg",
    ],
  },
  {
    title: "Jane Street - Estimathon",
    org: "Jane Street Capital",
    when: "2026",
    placement: "3rd Place",
    body:
      "Team estimation competition with Jane Street quants. Had to estimate Fermi-style quantities under time pressure with no lookups. Podium finish.",
    photos: ["jane-street-1.jpg", "jane-street-2.jpg", "jane-street-3.jpg"],
  },
  {
    title: "NJ Garden State Esports - Valorant",
    org: "Cherry Hill East · NJ Garden State Esports League",
    when: "2023 & 2024",
    placement: "State Champion · $40,000 prize pool",
    body:
      "Captained the Cherry Hill East Valorant squad to back-to-back NJ state titles. Ran practice structure, VOD review, draft prep, and calls during live matches. Bigger lesson than the trophy: team ops under pressure translates directly to case-comp and hackathon crunch time.",
    photos: [
      "hs-esports-state-champ.jpg",
      "hs-valorant-2024.jpg",
      "hs-valorant-2023.jpg",
      "hs-esports.jpg",
    ],
  },
  {
    title: "2026 Datathon with Deloitte",
    org: "Drexel LeBow × Deloitte - industry analytics",
    when: "2026",
    placement: "Finalist",
    body:
      "Industry-focused analytics competition co-hosted with Deloitte. Worked a dataset end-to-end: cleaning, modeling, and presenting the insight back to the sponsor panel.",
    photos: ["datathon-deloitte-1.jpg", "datathon-deloitte-2.jpg"],
    files: [
      {
        label: "Datathon-Deloitte-Model",
        path: "/competitions/datathon-deloitte/Datathon-Deloitte-Model.xlsx",
        kind: "xlsx",
        preview: "/competitions/previews/Datathon-Deloitte-Model.xlsx.png",
      },
    ],
  },
  {
    title: "Howley Finance Impact Challenge",
    org: "Howley Foundation · Drexel LeBow",
    when: "January 2026",
    placement: "Finalist",
    body:
      "Presented financial recommendations for Ben & Gerri’s Café. Built the model, structured the deck, defended the thesis under Q&A. Teammates: Michael Zong, Jeswin Geigy, Neil Rayarao.",
    photos: ["howley-finance-1.jpg"],
    files: [
      {
        label: "Finance-Impact-Deck",
        path: "/competitions/finance-impact/Finance-Impact-Deck.pptx",
        kind: "pptx",
        preview: "/competitions/previews/Finance-Impact-Deck.pptx.png",
      },
      {
        label: "Finance-Impact-Model",
        path: "/competitions/finance-impact/Finance-Impact-Model.xlsx",
        kind: "xlsx",
        preview: "/competitions/previews/Finance-Impact-Model.xlsx.png",
      },
      {
        label: "Finance-Impact-Report",
        path: "/competitions/finance-impact/Finance-Impact-Report.pdf",
        kind: "pdf",
        preview: "/competitions/previews/Finance-Impact-Report.pdf.png",
      },
    ],
  },
  {
    title: "Dean’s Student Advisory Board Equity Research Challenge",
    org: "Drexel LeBow - Dean’s SAB",
    when: "2026",
    placement: "Finalist",
    body:
      "Equity-research challenge run by the Dean’s Student Advisory Board. Wrote up a thesis, pitched the buy/sell call, stood up to a panel of senior students and faculty.",
    photos: ["dsab-research-1.jpg"],
    files: [
      {
        label: "DSAB-Equity-Deck",
        path: "/competitions/dsab-equity/DSAB-Equity-Deck.pptx",
        kind: "pptx",
        preview: "/competitions/previews/DSAB-Equity-Deck.pptx.png",
      },
      {
        label: "DSAB-Equity-WhitePaper",
        path: "/competitions/dsab-equity/DSAB-Equity-WhitePaper.pdf",
        kind: "pdf",
        preview: "/competitions/previews/DSAB-Equity-WhitePaper.pdf.png",
      },
    ],
  },
  {
    title: "UEV Venture Building Competition",
    org: "Urban Entrepreneurship & Ventures",
    when: "2026",
    body:
      "Team venture-building competition - built a full company concept, pricing model, and go-to-market plan, then pitched to judges.",
    photos: ["uev-venture-1.jpg", "uev-venture-2.jpg", "uev-venture-3.jpg"],
  },
  {
    title: "Baiada Institute Innovation Tournament",
    org: "Drexel LeBow",
    when: "2026",
    body:
      "Innovation tournament - pitched a product concept with full business model (deck, pricing, operations plan).",
    photos: ["biada-photo.jpg"],
  },
  {
    title: "Philly-Wide Case Competition - BCG × Aramark",
    org: "Boston Consulting Group · Aramark",
    when: "2026",
    placement: "Finalist",
    body:
      "City-wide undergraduate case comp sponsored by BCG and Aramark. Built a strategic recommendation deck and delivered it live to BCG / Aramark panels.",
    photos: [],
  },
  {
    title: "Ascend × EY × CLA Case Competition",
    org: "Ascend · EY · CliftonLarsonAllen",
    when: "2026",
    body:
      "Multi-sponsor case competition focused on professional-services strategy.",
    photos: [],
  },
  {
    title: "IMC Prosperity 4 - Algo Trade",
    org: "IMC Trading",
    when: "2026",
    body:
      "Algorithmic-trading competition run by IMC. Built & backtested a strategy against their simulated exchange.",
    photos: [],
  },
  {
    title: "FutureFest - Innovation Showcase",
    org: "Drexel LeBow · FutureFest",
    when: "2026",
    body:
      "Innovation showcase with a full pitch deck, Excel model, and written white paper.",
    photos: ["biada-photo.jpg"],
    files: [
      {
        label: "FutureFest-Deck",
        path: "/competitions/futurefest/FutureFest-Deck.pptx",
        kind: "pptx",
        preview: "/competitions/previews/FutureFest-Deck.pptx.png",
      },
      {
        label: "FutureFest-Model",
        path: "/competitions/futurefest/FutureFest-Model.xlsx",
        kind: "xlsx",
        preview: "/competitions/previews/FutureFest-Model.xlsx.png",
      },
      {
        label: "FutureFest-Writeup",
        path: "/competitions/futurefest/FutureFest-Writeup.pdf",
        kind: "pdf",
        preview: "/competitions/previews/FutureFest-Writeup.pdf.png",
      },
    ],
  },
  {
    title: "Johnson & Johnson - University Case Competition (UCC)",
    org: "Johnson & Johnson · Drexel LeBow",
    when: "April 2026",
    body: "",
    photos: ["jnj-ucc-1.png"],
  },
];

function FileChip({ file }: { file: CaseFile }) {
  const ICON: Record<CaseFile["kind"], string> = {
    pptx: "📊",
    xlsx: "📈",
    pdf: "📄",
  };
  const TYPE_LABEL: Record<CaseFile["kind"], string> = {
    pptx: "Deck",
    xlsx: "Excel",
    pdf: "PDF",
  };
  const BG: Record<CaseFile["kind"], string> = {
    pptx: "#d14836",
    xlsx: "#1e7e34",
    pdf: "#c00",
  };
  const fileName = `${file.label}.${file.kind}`;
  return (
    <a
      href={file.path}
      download={fileName}
      target="_blank"
      rel="noopener"
      className="win-window bg-white p-[4px] flex flex-col gap-[4px] no-underline hover:bg-[#eef3f8] shrink-0"
      style={{ width: 200, textDecoration: "none", color: "#000" }}
      title={`Download ${fileName}`}
    >
      <div
        className="win-sunken relative"
        style={{
          aspectRatio: "4 / 3",
          background: "#f0f0f0",
          overflow: "hidden",
        }}
      >
        {file.preview ? (
          <img
            src={file.preview}
            alt={fileName}
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top center",
              display: "block",
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div
            className="flex items-center justify-center w-full h-full text-[48px]"
          >
            {ICON[file.kind]}
          </div>
        )}
        <span
          className="absolute top-[4px] left-[4px] px-[5px] py-[1px] text-[13px] font-bold uppercase text-white"
          style={{
            background: BG[file.kind],
            letterSpacing: "0.4px",
          }}
        >
          {TYPE_LABEL[file.kind]}
        </span>
      </div>
      <div className="flex items-center gap-[4px] px-[2px]">
        <span aria-hidden className="text-[16px]">
          {ICON[file.kind]}
        </span>
        <span className="truncate flex-1 text-[15px]" title={fileName}>
          {file.label}.{file.kind}
        </span>
        <span
          className="text-[13px] text-[color:var(--color-win-text-disabled)] shrink-0"
          aria-hidden
        >
          ↓
        </span>
      </div>
    </a>
  );
}

export default function Competitions({ window: _ }: { window: WindowState }) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Title band */}
      <div className="win-raised flex items-center gap-[8px] px-[8px] py-[6px] border-b border-[#808080]">
        <img
          src="/icons/trophy.svg"
          alt=""
          width={28}
          height={28}
          className="pixelated shrink-0"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[18px]">
            Case Competitions &amp; Hackathons
          </div>
          <div className="text-[19px] italic text-[color:var(--color-win-text-disabled)]">
            Pulled from LinkedIn · {ENTRIES.length} events · photos grouped by event
          </div>
        </div>
      </div>

      {/* Scroll area */}
      <div className="flex-1 min-h-0 overflow-auto win-scroll p-[12px] flex flex-col gap-[10px]">
        {ENTRIES.map((e) => (
          <div
            key={e.title}
            className="win-window bg-white p-[10px] flex flex-col gap-[6px]"
          >
            <div className="flex items-baseline gap-[6px] flex-wrap">
              <div className="font-bold text-[18px] leading-tight">
                {e.title}
              </div>
              {e.placement && (
                <span
                  className="text-[18px] uppercase tracking-wide border border-[#808080] px-[4px] py-[1px]"
                  style={{ background: "#fff3b0" }}
                >
                  {e.placement}
                </span>
              )}
            </div>
            <div className="text-[19px] text-[color:var(--color-win-text-disabled)]">
              {e.when} · {e.org}
            </div>
            {e.body && (
              <div className="text-[20px] leading-relaxed text-[#222]">
                {e.body}
              </div>
            )}
            {e.files && e.files.length > 0 && (
              <div className="flex flex-wrap gap-[6px] mt-[2px]">
                {e.files.map((f) => (
                  <FileChip key={f.path} file={f} />
                ))}
              </div>
            )}
            {e.photos.length > 0 && (
              <div
                className="grid gap-[10px] mt-[4px]"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                }}
              >
                {e.photos.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="win-sunken bg-white p-[3px] hover:bg-[#eef3f8]"
                    style={{ aspectRatio: "4 / 3", overflow: "hidden" }}
                    onClick={() => setLightbox(`/linkedin/${p}`)}
                  >
                    <img
                      src={`/linkedin/${p}`}
                      alt={e.title}
                      loading="lazy"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                      onError={(ev) => {
                        (ev.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-[#808080] px-[10px] py-[4px] text-[19px] text-[color:var(--color-win-text-disabled)] flex justify-between">
        <span>Click a photo to view full-size</span>
        <span>
          {ENTRIES.filter((e) => e.photos.length > 0).length} events with photos
        </span>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-[20px]"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={() => setLightbox(null)}
        >
          <div
            className="win-window bg-white p-[4px] flex flex-col gap-[6px] max-w-full max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="win-sunken" style={{ background: "#000" }}>
              <img
                src={lightbox}
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
                Case competitions · 2026
              </span>
              <button
                type="button"
                className="win-btn"
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
