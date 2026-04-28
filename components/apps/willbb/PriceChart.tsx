"use client";

/**
 * SVG line chart for the WillBB Terminal price pane.
 *
 * Pure presentational component - no data fetching, no time formatting beyond
 * tick labels. Draws an area-fill line, baseline at "previousClose" if given,
 * grid + axis labels, and a hover crosshair that reports the price/date.
 */

import { useMemo, useRef, useState, useEffect } from "react";

export interface ChartPoint {
  t: number; // unix seconds
  c: number; // close price
}

interface Props {
  points: ChartPoint[];
  previousClose?: number | null;
  /** Phosphor "up" color when last >= first; "down" when below. */
  color?: { up: string; down: string };
  /** Chart background fill. */
  background?: string;
  /** Optional title placed above the chart. */
  caption?: string;
}

const DEFAULT_COLOR = { up: "#5dd39e", down: "#f0686a" };

export default function PriceChart({
  points,
  previousClose,
  color = DEFAULT_COLOR,
  background = "transparent",
  caption,
}: Props) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<ChartPoint | null>(null);
  const [width, setWidth] = useState<number>(640);
  const height = 260;
  const padX = 56;
  const padTop = 12;
  const padBottom = 24;

  // Resize observer so the chart fills its container.
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current.parentElement;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.floor(e.contentRect.width);
        if (w > 0) setWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { path, area, min, max, first, last, ticks, baselineY } = useMemo(() => {
    if (points.length === 0) {
      return {
        path: "",
        area: "",
        min: 0,
        max: 0,
        first: 0,
        last: 0,
        ticks: [] as { x: number; label: string }[],
        baselineY: null as number | null,
      };
    }
    const closes = points.map((p) => p.c);
    let mn = Math.min(...closes);
    let mx = Math.max(...closes);
    if (previousClose != null) {
      mn = Math.min(mn, previousClose);
      mx = Math.max(mx, previousClose);
    }
    if (mn === mx) {
      mn -= 1;
      mx += 1;
    }
    const span = mx - mn;
    const pad = span * 0.08;
    mn -= pad;
    mx += pad;

    const innerW = width - padX - 12;
    const innerH = height - padTop - padBottom;
    const xFor = (i: number) =>
      padX + (i / Math.max(1, points.length - 1)) * innerW;
    const yFor = (v: number) =>
      padTop + (1 - (v - mn) / (mx - mn)) * innerH;

    const d = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.c)}`)
      .join(" ");
    const a =
      d +
      ` L ${xFor(points.length - 1)} ${padTop + innerH} L ${xFor(0)} ${
        padTop + innerH
      } Z`;

    // Date ticks: 4 evenly spaced indices.
    const tickIdx =
      points.length <= 4
        ? points.map((_, i) => i)
        : [0, Math.floor(points.length / 3), Math.floor((2 * points.length) / 3), points.length - 1];
    const tickArr = tickIdx.map((i) => {
      const d = new Date(points[i].t * 1000);
      return {
        x: xFor(i),
        label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      };
    });

    return {
      path: d,
      area: a,
      min: mn,
      max: mx,
      first: closes[0],
      last: closes[closes.length - 1],
      ticks: tickArr,
      baselineY: previousClose != null ? yFor(previousClose) : null,
    };
  }, [points, previousClose, width]);

  const isUp = last >= first;
  const stroke = isUp ? color.up : color.down;
  const fillId = "willbb-fill-" + (isUp ? "u" : "d");

  // Mouse → nearest point.
  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!ref.current || points.length === 0) return;
    const rect = ref.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const innerW = width - padX - 12;
    const ratio = (px - padX) / innerW;
    const idx = Math.max(
      0,
      Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))
    );
    setHover(points[idx]);
  }

  const innerW = width - padX - 12;
  const innerH = height - padTop - padBottom;

  // Y-axis labels (5 lines).
  const yTicks = useMemo(() => {
    if (points.length === 0) return [];
    return [0, 0.25, 0.5, 0.75, 1].map((p) => {
      const v = max - p * (max - min);
      const y = padTop + p * innerH;
      return { v, y };
    });
  }, [min, max, innerH, points.length]);

  return (
    <div className="w-full" style={{ background }}>
      {caption && (
        <div
          className="text-[14px] uppercase tracking-[0.18em] mb-[4px]"
          style={{ color: "#7d8a99" }}
        >
          {caption}
        </div>
      )}
      <svg
        ref={ref}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.32} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Grid + Y labels */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padX}
              x2={width - 12}
              y1={t.y}
              y2={t.y}
              stroke="#1f2a36"
              strokeDasharray="2 4"
            />
            <text
              x={padX - 6}
              y={t.y + 4}
              fontSize={11}
              fill="#5d6b7c"
              textAnchor="end"
              fontFamily="ui-monospace, Menlo, monospace"
            >
              {t.v.toFixed(t.v >= 1000 ? 0 : 2)}
            </text>
          </g>
        ))}

        {/* Previous close baseline */}
        {baselineY != null && (
          <g>
            <line
              x1={padX}
              x2={width - 12}
              y1={baselineY}
              y2={baselineY}
              stroke="#3a4658"
              strokeDasharray="4 3"
            />
            <text
              x={width - 14}
              y={baselineY - 4}
              fontSize={10}
              fill="#7d8a99"
              textAnchor="end"
              fontFamily="ui-monospace, Menlo, monospace"
            >
              prev close
            </text>
          </g>
        )}

        {/* Area + line */}
        {area && <path d={area} fill={`url(#${fillId})`} />}
        {path && (
          <path
            d={path}
            fill="none"
            stroke={stroke}
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* X tick labels */}
        {ticks.map((t, i) => (
          <text
            key={i}
            x={t.x}
            y={height - 6}
            fontSize={11}
            fill="#5d6b7c"
            textAnchor="middle"
            fontFamily="ui-monospace, Menlo, monospace"
          >
            {t.label}
          </text>
        ))}

        {/* Hover crosshair */}
        {hover && points.length > 0 && (
          <HoverLayer
            point={hover}
            points={points}
            innerW={innerW}
            padX={padX}
            padTop={padTop}
            innerH={innerH}
            min={min}
            max={max}
            stroke={stroke}
            width={width}
            height={height}
          />
        )}
      </svg>
    </div>
  );
}

function HoverLayer({
  point,
  points,
  innerW,
  padX,
  padTop,
  innerH,
  min,
  max,
  stroke,
  width,
  height,
}: {
  point: ChartPoint;
  points: ChartPoint[];
  innerW: number;
  padX: number;
  padTop: number;
  innerH: number;
  min: number;
  max: number;
  stroke: string;
  width: number;
  height: number;
}) {
  const idx = points.indexOf(point);
  const x = padX + (idx / Math.max(1, points.length - 1)) * innerW;
  const y = padTop + (1 - (point.c - min) / (max - min)) * innerH;
  const dateLabel = new Date(point.t * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const priceLabel = "$" + point.c.toFixed(point.c >= 1000 ? 0 : 2);

  // Place tooltip on whichever side has more room.
  const tipW = 130;
  const onRight = x + tipW + 12 < width;
  const tipX = onRight ? x + 8 : x - tipW - 8;
  const tipY = Math.max(padTop, Math.min(height - 48, y - 24));

  return (
    <g pointerEvents="none">
      <line
        x1={x}
        x2={x}
        y1={padTop}
        y2={padTop + innerH}
        stroke="#3a4658"
        strokeDasharray="2 3"
      />
      <circle cx={x} cy={y} r={4} fill={stroke} />
      <rect
        x={tipX}
        y={tipY}
        width={tipW}
        height={40}
        fill="#0c1218"
        stroke="#2b3744"
      />
      <text
        x={tipX + 8}
        y={tipY + 16}
        fontSize={12}
        fill="#d4dee9"
        fontFamily="ui-monospace, Menlo, monospace"
      >
        {dateLabel}
      </text>
      <text
        x={tipX + 8}
        y={tipY + 32}
        fontSize={13}
        fill={stroke}
        fontFamily="ui-monospace, Menlo, monospace"
        fontWeight={600}
      >
        {priceLabel}
      </text>
    </g>
  );
}
