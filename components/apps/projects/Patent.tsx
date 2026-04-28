"use client";

import type { WindowState } from "@/lib/wm/types";
import { openApp } from "@/lib/wm/registry";

const PATENT_PDF = "/patent-golf-bag.pdf";

function openPatentPdf() {
  // Open the PDF in a new browser tab so users can view / print / download.
  window.open(PATENT_PDF, "_blank", "noopener");
}

function downloadPatentPdf() {
  const a = document.createElement("a");
  a.href = PATENT_PDF;
  a.download = "WillZhang-CNIPA-Patent.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function Patent({ window: _ }: { window: WindowState }) {
  return (
    <div className="flex flex-col h-full overflow-auto win-scroll">
      <div className="p-[16px] border-b border-[#808080] flex items-center gap-[10px]">
        <img
          src="/icons/cert.svg"
          alt=""
          width={56}
          height={56}
          className="pixelated"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[20px]">
            CNIPA Utility Model Patent - A Multi-Purpose Golf Bag
          </div>
          <div className="text-[20px] italic">
            China National IP Administration · September 2024 · Credential
            202422233493.5
          </div>
        </div>
        <button
          type="button"
          className="win-btn shrink-0"
          onClick={openPatentPdf}
          title="Open patent PDF in a new tab"
        >
          📄 Open PDF
        </button>
      </div>

      <div className="p-[16px] space-y-[12px] text-[20px] leading-relaxed">
        {/* Patent cover card - styled like the cover page of a filing.
            Clicking the thumbnail opens the actual PDF. */}
        <div
          className="win-window p-[16px] flex gap-[14px] flex-wrap"
          style={{ background: "#fdfbf4" }}
        >
          <button
            type="button"
            onClick={openPatentPdf}
            className="shrink-0 flex items-center justify-center p-0 bg-transparent cursor-pointer hover:brightness-95"
            style={{
              background: "#fff",
              border: "2px solid #c8a24c",
              padding: 6,
              width: 180,
            }}
            title="Click to open the full patent PDF"
          >
            <img
              src="/linkedin/patent-golf-bag.jpg"
              alt="Multi-Purpose Golf Bag patent drawing - click to open PDF"
              style={{
                width: "100%",
                height: "auto",
                display: "block",
              }}
            />
          </button>
          <div className="flex-1 min-w-[220px]">
            <div className="font-bold text-[19px]">A Multi-Purpose Golf Bag</div>
            <div className="text-[20px] mt-[4px] space-y-[2px]">
              <div><b>Filing type:</b> Utility Model</div>
              <div><b>Filing authority:</b> CNIPA (China)</div>
              <div><b>Filed:</b> September 2024</div>
              <div><b>Credential ID:</b> 202422233493.5</div>
              <div><b>Co-inventor:</b> Will Zhang</div>
              <div><b>Status:</b> Filed</div>
            </div>
            <div className="flex gap-[6px] flex-wrap mt-[10px]">
              <button
                type="button"
                className="win-btn"
                onClick={openPatentPdf}
                title="View the full PDF"
              >
                📄 View full PDF
              </button>
              <button
                type="button"
                className="win-btn"
                onClick={downloadPatentPdf}
                title="Download PDF"
              >
                ⬇ Download
              </button>
              <button
                type="button"
                className="win-btn"
                onClick={() => openApp("golf-memories")}
                title="Context: the junior-golf chapter that led here"
              >
                Golf Memories →
              </button>
            </div>
          </div>
        </div>

        <Section title="What it is">
          A Utility Model patent covering a multi-purpose golf bag design -
          addressing durability, modularity, and seal-integrity gaps that
          existing commercial bags don't handle well through multi-day
          tournament use.
        </Section>

        <Section title="My contribution">
          Co-inventor. Contributed design improvements, material spec
          refinement, and testing notes during invention, prototyping, and
          filing.
        </Section>

        <Section title="Why it fits with the rest of my work">
          Links my operations work with Super Lychee Golf Series directly to a
          tangible product improvement. Fieldwork → observation → invention →
          filing. Same instinct I apply to software: see the gap, ship the fix.
        </Section>
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
