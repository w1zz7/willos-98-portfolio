/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Will Zhang - WillOS 98 Portfolio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * OG image rendered server-side. Shared links on Slack/Twitter/LinkedIn get
 * a retro Excel-styled preview of the Highlights sheet instead of a boring
 * default card.
 */
export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#008080",
          fontFamily: "system-ui, sans-serif",
          color: "#000",
        }}
      >
        {/* Window chrome */}
        <div
          style={{
            margin: 32,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: "#c0c0c0",
            boxShadow:
              "inset 2px 2px 0 #ffffff, inset -2px -2px 0 #000000, inset 4px 4px 0 #dfdfdf, inset -4px -4px 0 #808080",
          }}
        >
          {/* Titlebar */}
          <div
            style={{
              height: 48,
              padding: "0 12px",
              display: "flex",
              alignItems: "center",
              background:
                "linear-gradient(90deg, #000080, #1084d0)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 22,
            }}
          >
            WillZhang.xlsx - Microsoft Excel
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 18, opacity: 0.9 }}>_ □ ×</div>
          </div>

          {/* Content */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              padding: 32,
              background: "#fff",
            }}
          >
            <div
              style={{
                fontSize: 52,
                fontWeight: 800,
                letterSpacing: -0.5,
                marginBottom: 8,
              }}
            >
              WILL ZHANG
            </div>
            <div style={{ fontSize: 22, color: "#444", marginBottom: 24 }}>
              Drexel · B.S. Business Admin (Analytics + Marketing) · GPA 4.0 ·
              Philadelphia, PA
            </div>

            <div
              style={{
                fontSize: 26,
                lineHeight: 1.35,
                marginBottom: 30,
                maxWidth: 1040,
              }}
            >
              Co-founded <b>Bulletproof AI</b> - 75k+ tool runs/mo, 200k-resume
              ATS model. 1st place <b>Philly CodeFest 2026</b>. Processed
              <b> $315,020</b> in equity trades with <b>63.98%</b> return.
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              {[
                "🏆 Philly CodeFest 2026 to 1st Place",
                "🧠 Bulletproof AI - 75,000+ req/mo",
                "📈 63.98% gain ratio · $315,020 processed · 267 trades",
                "⚙ CNIPA Utility Model Patent",
              ].map((t) => (
                <div
                  key={t}
                  style={{
                    background: "#fff3b0",
                    border: "2px solid #c8a24c",
                    padding: "8px 14px",
                    fontSize: 20,
                    fontWeight: 600,
                  }}
                >
                  {t}
                </div>
              ))}
            </div>

            <div style={{ flex: 1 }} />

            <div
              style={{
                fontSize: 20,
                color: "#666",
                fontStyle: "italic",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>wz363@drexel.edu · linkedin.com/in/willzhang6200</span>
              <span>WillOS 98 · Build 2026.04</span>
            </div>
          </div>

          {/* Status bar */}
          <div
            style={{
              height: 32,
              padding: "0 12px",
              display: "flex",
              alignItems: "center",
              fontSize: 16,
              background: "#c0c0c0",
              color: "#000",
            }}
          >
            Ready
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
