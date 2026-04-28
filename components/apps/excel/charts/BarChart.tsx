"use client";

/**
 * Hand-crafted vintage Excel bar chart. SVG with dithered <pattern> fills,
 * hard 1px borders, and no anti-aliased gradients.
 *
 * Renders at its natural viewBox but uses `width: 100%` so it scales down
 * smoothly on narrow containers. `preserveAspectRatio="xMidYMid meet"`
 * keeps labels readable.
 */
export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

export function BarChart({
  data,
  width = 340,
  height = 180,
  title,
}: {
  data: BarDatum[];
  width?: number;
  height?: number;
  title?: string;
}) {
  const padL = 48;
  const padR = 12;
  const padT = title ? 28 : 12;
  const padB = 40;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const max = Math.max(1, ...data.map((d) => d.value));

  const barW = chartW / data.length - 8;
  const step = chartW / data.length;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{
        background: "#ffffff",
        border: "1px solid #000",
        width: "100%",
        height: "auto",
        maxWidth: width,
        maxHeight: height,
        display: "block",
      }}
      shapeRendering="crispEdges"
    >
      <defs>
        <pattern id="diag" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" fill="#ffffff" />
          <path d="M0 4 L4 0" stroke="#204060" strokeWidth="1" />
        </pattern>
        <pattern id="dots" width="3" height="3" patternUnits="userSpaceOnUse">
          <rect width="3" height="3" fill="#ffffff" />
          <rect width="1" height="1" fill="#c00" />
        </pattern>
        <pattern id="cross" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" fill="#ffffff" />
          <path d="M0 2 L4 2 M2 0 L2 4" stroke="#070" strokeWidth="1" />
        </pattern>
      </defs>

      {title && (
        <text
          x={width / 2}
          y={16}
          textAnchor="middle"
          fontFamily="Arial"
          fontSize="11"
          fontWeight="bold"
        >
          {title}
        </text>
      )}

      {/* Y-axis gridlines + labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = padT + chartH * (1 - f);
        const v = Math.round(max * f);
        return (
          <g key={f}>
            <line
              x1={padL}
              y1={y}
              x2={width - padR}
              y2={y}
              stroke="#c0c0c0"
              strokeDasharray="1,1"
            />
            <text
              x={padL - 4}
              y={y + 3}
              textAnchor="end"
              fontFamily="Arial"
              fontSize="9"
              fill="#000"
            >
              {v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
            </text>
          </g>
        );
      })}

      {/* Axes */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="#000" />
      <line
        x1={padL}
        y1={padT + chartH}
        x2={width - padR}
        y2={padT + chartH}
        stroke="#000"
      />

      {/* Bars */}
      {data.map((d, i) => {
        const h = (d.value / max) * chartH;
        const x = padL + i * step + 4;
        const y = padT + chartH - h;
        const fill =
          d.color ??
          (i % 3 === 0 ? "url(#diag)" : i % 3 === 1 ? "url(#dots)" : "url(#cross)");
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              fill={fill}
              stroke="#000"
            />
            <text
              x={x + barW / 2}
              y={padT + chartH + 12}
              textAnchor="middle"
              fontFamily="Arial"
              fontSize="9"
            >
              {d.label}
            </text>
            <text
              x={x + barW / 2}
              y={y - 4}
              textAnchor="middle"
              fontFamily="Arial"
              fontSize="9"
              fontWeight="bold"
            >
              {d.value >= 1000 ? `${(d.value / 1000).toFixed(0)}k` : d.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
