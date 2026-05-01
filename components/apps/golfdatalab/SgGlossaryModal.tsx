"use client";

/**
 * Reusable SG (Strokes Gained) glossary modal.
 * Opens from a "What is SG?" button on every PGA-related 3D scene so a
 * non-golf-fluent viewer can decode the axes mid-scene without leaving.
 */

interface Colors {
  bg: string;
  panel: string;
  panelAlt: string;
  panelDeep: string;
  border: string;
  borderSoft: string;
  text: string;
  textDim: string;
  textFaint: string;
  brand: string;
  brandSoft: string;
  accent: string;
  warn: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  colors: Colors;
  fontMono: string;
  fontUi: string;
}

const SG_COMPONENTS: { key: string; label: string; color: string; body: string }[] = [
  {
    key: "putt",
    label: "SG-Putt",
    color: "#f0a020",
    body: "Strokes saved on the green vs the field, weighted by distance. A +0.5 SG-Putt round means putting saved roughly half a stroke vs the avg pro that day.",
  },
  {
    key: "arg",
    label: "SG-Around-Green (Arg)",
    color: "#e063b8",
    body: "Chipping, pitching, and bunker shots within ~30 yards of the green. Captures the short-game touch that converts missed greens into pars.",
  },
  {
    key: "app",
    label: "SG-Approach (App)",
    color: "#33BBFF",
    body: "Iron play from the fairway - typically 100-225 yards. Often the biggest single dimension separating winners from cut-makers.",
  },
  {
    key: "ott",
    label: "SG-Off-the-Tee (Ott)",
    color: "#5dd39e",
    body: "Driving distance + accuracy. Sets up every other shot, so this is where elite ball-strikers build their edge over the rest of the field.",
  },
];

export default function SgGlossaryModal({ open, onClose, colors, fontMono, fontUi }: Props) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(6, 22, 13, 0.85)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        fontFamily: fontUi,
        cursor: "pointer",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.panel,
          border: "1px solid " + colors.brand,
          padding: "20px 24px",
          maxWidth: 520,
          maxHeight: "85%",
          overflowY: "auto",
          color: colors.text,
          cursor: "default",
          boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div
              style={{
                fontSize: 9,
                color: colors.brand,
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                fontWeight: 600,
              }}
            >
              Glossary
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>
              What is Strokes Gained?
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close glossary"
            style={{
              background: "transparent",
              border: "1px solid " + colors.borderSoft,
              color: colors.textDim,
              fontSize: 16,
              padding: "0 10px",
              height: 28,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: 13, color: colors.textDim, lineHeight: 1.55, marginBottom: 14 }}>
          <strong style={{ color: colors.text }}>Strokes Gained (SG)</strong> measures how many
          strokes a player saves vs the field average on a given shot type, given the same
          starting position.
        </p>

        <div
          style={{
            background: colors.panelDeep,
            border: "1px solid " + colors.borderSoft,
            padding: "10px 12px",
            marginBottom: 16,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
          }}
        >
          <Bench colors={colors} fontMono={fontMono} value="+1.0" label="Elite top-50" tone={colors.brand} />
          <Bench colors={colors} fontMono={fontMono} value="0.0" label="Tour-average" tone={colors.textDim} />
          <Bench colors={colors} fontMono={fontMono} value="−1.0" label="Struggling" tone="#f0686a" />
        </div>

        <div
          style={{
            fontSize: 9,
            color: colors.textFaint,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            marginBottom: 10,
          }}
        >
          The four components
        </div>
        {SG_COMPONENTS.map((c) => (
          <div
            key={c.key}
            style={{
              display: "grid",
              gridTemplateColumns: "12px 1fr",
              gap: 10,
              alignItems: "start",
              marginBottom: 12,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                background: c.color,
                borderRadius: 2,
                marginTop: 5,
                boxShadow: `0 0 6px ${c.color}`,
              }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: c.color }}>{c.label}</div>
              <div style={{ fontSize: 11.5, color: colors.textDim, lineHeight: 1.55, marginTop: 2 }}>
                {c.body}
              </div>
            </div>
          </div>
        ))}

        <div
          style={{
            marginTop: 14,
            padding: 10,
            background: colors.panelDeep,
            border: "1px solid " + colors.borderSoft,
            fontSize: 11,
            color: colors.textDim,
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: colors.text }}>Math note:</strong>{" "}
          <span style={{ fontFamily: fontMono }}>
            SG-Putt + SG-Arg + SG-App + SG-Ott ≈ SG-Total
          </span>{" "}
          (with rounding noise). The pool size in this lab is the top 60 PGA pros by career
          SG-Total, 2015–2022.
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 16,
            background: colors.brandSoft,
            border: "1px solid " + colors.brand,
            color: colors.text,
            padding: "6px 14px",
            fontSize: 12,
            cursor: "pointer",
            letterSpacing: "0.06em",
            fontFamily: fontUi,
          }}
        >
          Got it →
        </button>
      </div>
    </div>
  );
}

function Bench({
  colors,
  fontMono,
  value,
  label,
  tone,
}: {
  colors: Colors;
  fontMono: string;
  value: string;
  label: string;
  tone: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 18,
          fontWeight: 600,
          color: tone,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 9, color: colors.textFaint, marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </div>
    </div>
  );
}
