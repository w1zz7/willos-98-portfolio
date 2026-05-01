"use client";

/**
 * MacroPanel — US macro indicators sourced from Alpha Vantage's economic
 * indicator endpoints. Powers a "Macro" sub-tab in Discovery.
 *
 * Fetches 6 series in parallel (each cached server-side 1h-7d):
 *   Treasury 10y / 2y      TREASURY_YIELD
 *   Federal Funds Rate     FEDERAL_FUNDS_RATE
 *   CPI                    CPI
 *   Real GDP (quarterly)   REAL_GDP
 *   Unemployment Rate      UNEMPLOYMENT
 *   Inflation              INFLATION
 *
 * Renders each as a hand-rolled SVG sparkline with the latest value, MoM/YoY
 * change, and a 5-year rolling min/max band. Two side-by-side rows: yields
 * (rates) and macro (CPI/GDP/UE/Inflation). The yield-curve mini-chart at
 * the top plots all 6 maturities (3M-30Y) on a single x-axis.
 */

import { useEffect, useMemo, useState } from "react";
import { swrFetch } from "@/lib/clientFetchCache";
import { COLORS, FONT_MONO, FONT_UI } from "./OpenBB";

interface MacroPoint {
  date: string;
  value: number;
}

interface SeriesResp {
  data?: MacroPoint[];
  unavailable?: boolean;
  name?: string;
  interval?: string;
}

const W = 320;
const H = 80;
const PAD = 6;

function Sparkline({
  data,
  color,
  showBand = true,
  yPercent = false,
}: {
  data: MacroPoint[];
  color: string;
  showBand?: boolean;
  yPercent?: boolean;
}) {
  if (!data || data.length === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }}>
        <text x={W / 2} y={H / 2} textAnchor="middle" fill={COLORS.textFaint} fontSize={10} fontFamily={FONT_MONO}>
          unavailable
        </text>
      </svg>
    );
  }
  // Last 60 points
  const recent = data.slice(0, 60).reverse(); // AV returns newest first
  const ys = recent.map((p) => p.value).filter((v) => Number.isFinite(v));
  if (ys.length === 0) return null;
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const range = Math.max(0.01, hi - lo);
  const xFor = (i: number) => PAD + (i / Math.max(1, recent.length - 1)) * (W - 2 * PAD);
  const yFor = (v: number) => H - PAD - ((v - lo) / range) * (H - 2 * PAD);

  const linePts = recent
    .map((p, i) => `${xFor(i)},${yFor(p.value)}`)
    .join(" ");
  const areaPts = `${xFor(0)},${H - PAD} ${linePts} ${xFor(recent.length - 1)},${H - PAD}`;

  // Latest + change
  const last = recent[recent.length - 1].value;
  const first = recent[0].value;
  const chg = last - first;
  const chgPct = first !== 0 ? (chg / first) * 100 : 0;
  const isUp = chg >= 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
      {showBand && (
        <>
          {/* Soft fill */}
          <polygon
            points={areaPts}
            fill={color}
            opacity={0.10}
          />
        </>
      )}
      <polyline
        points={linePts}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        opacity={0.95}
      />
      {/* Latest dot */}
      <circle
        cx={xFor(recent.length - 1)}
        cy={yFor(last)}
        r={2.5}
        fill={color}
      />
      {/* Latest value */}
      <text
        x={W - PAD}
        y={14}
        textAnchor="end"
        fontSize={11}
        fontFamily={FONT_MONO}
        fontWeight={700}
        fill={COLORS.text}
      >
        {last.toFixed(yPercent ? 2 : 2)}
        {yPercent ? "%" : ""}
      </text>
      <text
        x={W - PAD}
        y={26}
        textAnchor="end"
        fontSize={9}
        fontFamily={FONT_MONO}
        fill={isUp ? COLORS.up : COLORS.down}
      >
        {isUp ? "+" : ""}
        {chg.toFixed(2)} ({chgPct.toFixed(1)}%)
      </text>
    </svg>
  );
}

function SeriesCard({
  title,
  description,
  data,
  loading,
  unavailable,
  color,
  yPercent = false,
}: {
  title: string;
  description: string;
  data: MacroPoint[] | null;
  loading: boolean;
  unavailable: boolean;
  color: string;
  yPercent?: boolean;
}) {
  return (
    <div
      style={{
        background: COLORS.panel,
        border: "1px solid " + COLORS.border,
        padding: 10,
        fontFamily: FONT_UI,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.text, letterSpacing: "0.04em" }}>
            {title}
          </div>
          <div style={{ fontSize: 9, color: COLORS.textFaint, marginTop: 1 }}>
            {description}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        {loading ? (
          <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.brand, fontFamily: FONT_MONO, fontSize: 10 }}>
            loading...
          </div>
        ) : unavailable || !data ? (
          <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.textFaint, fontFamily: FONT_MONO, fontSize: 10 }}>
            unavailable
          </div>
        ) : (
          <Sparkline data={data} color={color} yPercent={yPercent} />
        )}
      </div>
    </div>
  );
}

interface YieldCurveDatum {
  maturity: string;
  yearsOut: number;
  value: number | null;
}

function YieldCurveChart({ points }: { points: YieldCurveDatum[] }) {
  const valid = points.filter((p) => p.value != null);
  if (valid.length === 0) {
    return (
      <div style={{ color: COLORS.textFaint, fontSize: 11, padding: 14, fontFamily: FONT_MONO }}>
        Yield curve data unavailable.
      </div>
    );
  }
  const W2 = 800;
  const H2 = 220;
  const PAD_L = 50;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 28;

  const xs = valid.map((p) => p.yearsOut);
  const ys = valid.map((p) => p.value as number);
  const xMin = 0;
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const yPad = (yMax - yMin) * 0.1 || 0.1;
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;

  const xFor = (xv: number) => PAD_L + ((xv - xMin) / (xMax - xMin)) * (W2 - PAD_L - PAD_R);
  const yFor = (yv: number) => PAD_T + ((yHi - yv) / (yHi - yLo)) * (H2 - PAD_T - PAD_B);

  const linePts = valid.map((p) => `${xFor(p.yearsOut)},${yFor(p.value as number)}`).join(" ");

  const yGrid: number[] = [];
  for (let s = 0; s <= 4; s++) yGrid.push(yLo + (s / 4) * (yHi - yLo));

  return (
    <svg viewBox={`0 0 ${W2} ${H2}`} style={{ width: "100%", height: H2 }}>
      {/* Y grid */}
      {yGrid.map((g, i) => (
        <g key={i}>
          <line x1={PAD_L} y1={yFor(g)} x2={W2 - PAD_R} y2={yFor(g)} stroke={COLORS.borderSoft} strokeWidth={0.4} strokeDasharray="2,3" />
          <text x={PAD_L - 6} y={yFor(g) + 3} fontSize={9} fill={COLORS.textFaint} fontFamily={FONT_MONO} textAnchor="end">
            {g.toFixed(2)}%
          </text>
        </g>
      ))}
      {/* X labels */}
      {valid.map((p, i) => (
        <g key={i}>
          <line x1={xFor(p.yearsOut)} y1={H2 - PAD_B} x2={xFor(p.yearsOut)} y2={H2 - PAD_B + 4} stroke={COLORS.borderSoft} strokeWidth={0.5} />
          <text x={xFor(p.yearsOut)} y={H2 - PAD_B + 16} fontSize={10} fill={COLORS.textDim} fontFamily={FONT_MONO} textAnchor="middle">
            {p.maturity}
          </text>
        </g>
      ))}
      {/* Curve */}
      <polyline points={linePts} fill="none" stroke={COLORS.brand} strokeWidth={2} />
      {/* Points */}
      {valid.map((p, i) => (
        <g key={i}>
          <circle cx={xFor(p.yearsOut)} cy={yFor(p.value as number)} r={3} fill={COLORS.brand} />
          <text
            x={xFor(p.yearsOut)}
            y={yFor(p.value as number) - 8}
            fontSize={9}
            fill={COLORS.text}
            fontFamily={FONT_MONO}
            textAnchor="middle"
            fontWeight={700}
          >
            {(p.value as number).toFixed(2)}%
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function MacroPanel() {
  const [tsy3m, setTsy3m] = useState<MacroPoint[] | null>(null);
  const [tsy2y, setTsy2y] = useState<MacroPoint[] | null>(null);
  const [tsy5y, setTsy5y] = useState<MacroPoint[] | null>(null);
  const [tsy7y, setTsy7y] = useState<MacroPoint[] | null>(null);
  const [tsy10y, setTsy10y] = useState<MacroPoint[] | null>(null);
  const [tsy30y, setTsy30y] = useState<MacroPoint[] | null>(null);
  const [fedFunds, setFedFunds] = useState<MacroPoint[] | null>(null);
  const [cpi, setCPI] = useState<MacroPoint[] | null>(null);
  const [gdp, setGDP] = useState<MacroPoint[] | null>(null);
  const [unemp, setUnemp] = useState<MacroPoint[] | null>(null);
  const [infl, setInfl] = useState<MacroPoint[] | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [unavailable, setUnavailable] = useState<Record<string, boolean>>({});

  // SWR-cached fetches for the 11 macro series. The data is monthly/quarterly
  // economic data — a 15-min stale window is fine. Without this, every visit
  // to Discovery → Macro fired 11 fresh AV calls (eating into the 25/day
  // budget) and waited 100-500ms × 11 sequentially due to AV's 5/min throttle.
  // Now: instant render from cache on subsequent visits, AV budget preserved.
  useEffect(() => {
    const ctrl = new AbortController();
    const STALE_MS = 15 * 60_000;
    type Setter = (data: MacroPoint[] | null) => void;
    const seriesList: { key: string; url: string; setter: Setter }[] = [
      { key: "tsy3m", url: "/api/markets/alpha?fn=TREASURY&maturity=3month&interval=monthly", setter: setTsy3m },
      { key: "tsy2y", url: "/api/markets/alpha?fn=TREASURY&maturity=2year&interval=monthly", setter: setTsy2y },
      { key: "tsy5y", url: "/api/markets/alpha?fn=TREASURY&maturity=5year&interval=monthly", setter: setTsy5y },
      { key: "tsy7y", url: "/api/markets/alpha?fn=TREASURY&maturity=7year&interval=monthly", setter: setTsy7y },
      { key: "tsy10y", url: "/api/markets/alpha?fn=TREASURY&maturity=10year&interval=monthly", setter: setTsy10y },
      { key: "tsy30y", url: "/api/markets/alpha?fn=TREASURY&maturity=30year&interval=monthly", setter: setTsy30y },
      { key: "fedFunds", url: "/api/markets/alpha?fn=FED_FUNDS&interval=monthly", setter: setFedFunds },
      { key: "cpi", url: "/api/markets/alpha?fn=CPI&interval=monthly", setter: setCPI },
      { key: "gdp", url: "/api/markets/alpha?fn=GDP&interval=quarterly", setter: setGDP },
      { key: "unemp", url: "/api/markets/alpha?fn=UNEMPLOYMENT", setter: setUnemp },
      { key: "infl", url: "/api/markets/alpha?fn=INFLATION", setter: setInfl },
    ];
    // Initial loading flags only set true if no cached entry exists for that
    // series. Cached entries paint instantly without a "loading…" flash.
    const initialLoading: Record<string, boolean> = {};
    seriesList.forEach((s) => {
      const r = swrFetch<SeriesResp>(s.url, STALE_MS, { signal: ctrl.signal });
      if (r.cached) {
        if (r.cached.unavailable || !r.cached.data) {
          setUnavailable((u) => ({ ...u, [s.key]: true }));
        } else {
          s.setter(r.cached.data);
        }
      }
      initialLoading[s.key] = !r.isFresh;
      r.promise
        .then((d) => {
          if (ctrl.signal.aborted) return;
          if (!d || d.unavailable || !d.data) {
            setUnavailable((u) => ({ ...u, [s.key]: true }));
          } else {
            s.setter(d.data);
            setUnavailable((u) => ({ ...u, [s.key]: false }));
          }
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading((u) => ({ ...u, [s.key]: false }));
        });
    });
    setLoading(initialLoading);
    return () => ctrl.abort();
  }, []);

  // Yield curve: latest value of each maturity
  const yieldCurve: YieldCurveDatum[] = useMemo(
    () => [
      { maturity: "3M", yearsOut: 0.25, value: tsy3m?.[0]?.value ?? null },
      { maturity: "2Y", yearsOut: 2, value: tsy2y?.[0]?.value ?? null },
      { maturity: "5Y", yearsOut: 5, value: tsy5y?.[0]?.value ?? null },
      { maturity: "7Y", yearsOut: 7, value: tsy7y?.[0]?.value ?? null },
      { maturity: "10Y", yearsOut: 10, value: tsy10y?.[0]?.value ?? null },
      { maturity: "30Y", yearsOut: 30, value: tsy30y?.[0]?.value ?? null },
    ],
    [tsy3m, tsy2y, tsy5y, tsy7y, tsy10y, tsy30y]
  );

  return (
    <div className="px-[16px] py-[14px] space-y-[16px]" style={{ background: COLORS.bg, fontFamily: FONT_UI, height: "100%", overflowY: "auto" }}>
      {/* Yield curve hero */}
      <div
        style={{
          background: COLORS.panel,
          border: "1px solid " + COLORS.border,
          padding: 12,
        }}
      >
        <div style={{ fontSize: 11, color: COLORS.textFaint, letterSpacing: "0.08em", marginBottom: 6 }}>
          US TREASURY YIELD CURVE · LATEST
        </div>
        <YieldCurveChart points={yieldCurve} />
        <div style={{ fontSize: 9, color: COLORS.textFaint, fontFamily: FONT_MONO, marginTop: 4 }}>
          Inverted (2Y &gt; 10Y) historically signals recession risk. Steeper curves typically indicate growth expectations.
        </div>
      </div>

      {/* Rates row */}
      <div>
        <div style={{ fontSize: 11, color: COLORS.textFaint, letterSpacing: "0.08em", marginBottom: 6 }}>
          INTEREST RATES · MONTHLY · LAST 5Y
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[8px]">
          <SeriesCard
            title="Federal Funds Rate"
            description="Effective FFR (target range midpoint). Set by the FOMC."
            data={fedFunds}
            loading={loading.fedFunds ?? true}
            unavailable={unavailable.fedFunds ?? false}
            color={COLORS.brand}
            yPercent
          />
          <SeriesCard
            title="10Y Treasury Yield"
            description="Long-end benchmark. Drives mortgage rates + duration risk."
            data={tsy10y}
            loading={loading.tsy10y ?? true}
            unavailable={unavailable.tsy10y ?? false}
            color={COLORS.up}
            yPercent
          />
          <SeriesCard
            title="2Y Treasury Yield"
            description="Short-end policy proxy. 2Y/10Y inversion = recession signal."
            data={tsy2y}
            loading={loading.tsy2y ?? true}
            unavailable={unavailable.tsy2y ?? false}
            color={COLORS.down}
            yPercent
          />
        </div>
      </div>

      {/* Macro row */}
      <div>
        <div style={{ fontSize: 11, color: COLORS.textFaint, letterSpacing: "0.08em", marginBottom: 6 }}>
          ECONOMIC INDICATORS
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[8px]">
          <SeriesCard
            title="CPI · All Urban"
            description="Consumer Price Index. Headline inflation gauge."
            data={cpi}
            loading={loading.cpi ?? true}
            unavailable={unavailable.cpi ?? false}
            color="#33BBFF"
          />
          <SeriesCard
            title="Inflation · YoY"
            description="World Bank inflation rate, US, annual."
            data={infl}
            loading={loading.infl ?? true}
            unavailable={unavailable.infl ?? false}
            color="#f5b042"
            yPercent
          />
          <SeriesCard
            title="Unemployment Rate"
            description="U-3 unemployment, BLS. Above 4.5% is recessionary."
            data={unemp}
            loading={loading.unemp ?? true}
            unavailable={unavailable.unemp ?? false}
            color={COLORS.down}
            yPercent
          />
          <SeriesCard
            title="Real GDP · Quarterly"
            description="BEA. Annualized, chained 2017 dollars."
            data={gdp}
            loading={loading.gdp ?? true}
            unavailable={unavailable.gdp ?? false}
            color={COLORS.up}
          />
        </div>
      </div>

      <div
        style={{
          fontSize: 9,
          color: COLORS.textFaint,
          fontFamily: FONT_MONO,
          letterSpacing: "0.06em",
          textAlign: "right",
        }}
      >
        powered by Alpha Vantage · TREASURY_YIELD · FEDERAL_FUNDS_RATE · CPI · INFLATION · UNEMPLOYMENT · REAL_GDP
      </div>
    </div>
  );
}
