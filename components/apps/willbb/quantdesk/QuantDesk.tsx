"use client";

/**
 * Research - quant-grade research terminal inside willBB.
 *
 *   Studies          OHLC chart + quant primitives (Garman-Klass / Yang-Zhang
 *                    vol, log returns, ACF/PACF, Hurst, rolling beta, IR)
 *   Cross-Section    Universe heatmap + correlation matrix + decile sort
 *                    alpha factory + IC / IC-decay
 *   Alpha Lab        DSL editor + compile + walk-forward CV + factor
 *                    regression + transaction-cost model
 *   PnL Attribution  Rolling Sharpe + factor exposures + risk decomp
 *                    (systematic vs idiosyncratic) + QQ plot + tail risk
 *
 * Session state is lifted here so all 4 panels share `activeSymbol`,
 * `lastBacktestResult`, and `paperTrades`.
 */

import { useState } from "react";
import { COLORS, FONT_UI, FONT_MONO } from "../OpenBB";
import Cockpit from "./Cockpit";
import Scanner from "./Scanner";
import StrategyLab from "./StrategyLab";
import RiskDashboard from "./RiskDashboard";
import PaperBlotter, { type PaperTrade } from "./PaperBlotter";
import type { BacktestResult } from "./backtest";

type SubTabId = "studies" | "crosssection" | "alphalab" | "attribution";

interface Props {
  symbol: string;
  setSymbol: (s: string) => void;
}

const SUB_TABS: { id: SubTabId; label: string; sub: string }[] = [
  { id: "studies", label: "Studies", sub: "OHLC vol estimators · ACF · Hurst · log-returns" },
  { id: "crosssection", label: "Cross-Section", sub: "decile sort · IC · L/S portfolio · corr matrix" },
  { id: "alphalab", label: "Alpha Lab", sub: "DSL · walk-forward CV · TC model · factor reg" },
  { id: "attribution", label: "PnL Attribution", sub: "factor exposures · risk decomp · QQ · ES" },
];

export default function QuantDesk({ symbol, setSymbol }: Props) {
  const [subTab, setSubTab] = useState<SubTabId>("studies");
  const [lastBacktest, setLastBacktest] = useState<BacktestResult | null>(null);
  const [paperTrades, setPaperTrades] = useState<PaperTrade[]>([]);
  const [blotterOpen, setBlotterOpen] = useState<boolean>(false);

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: COLORS.bg, fontFamily: FONT_UI, color: COLORS.text }}
    >
      <CapabilityStrip />
      <SubTabBar subTab={subTab} setSubTab={setSubTab} />

      <div className="flex-1 min-h-0 overflow-hidden relative">
        {subTab === "studies" && (
          <Cockpit symbol={symbol} setSymbol={setSymbol} />
        )}
        {subTab === "crosssection" && <Scanner onPickSymbol={setSymbol} />}
        {subTab === "alphalab" && (
          <StrategyLab
            symbol={symbol}
            setSymbol={setSymbol}
            onBacktestComplete={setLastBacktest}
            onTradesEmitted={(trades) => setPaperTrades((prev) => [...prev, ...trades])}
          />
        )}
        {subTab === "attribution" && (
          <RiskDashboard symbol={symbol} setSymbol={setSymbol} lastBacktest={lastBacktest} />
        )}
      </div>

      <PaperBlotter
        trades={paperTrades}
        open={blotterOpen}
        setOpen={setBlotterOpen}
        onClear={() => setPaperTrades([])}
      />
    </div>
  );
}

/**
 * "Capability strip" — a subtle banner at the top of the Research pane that
 * lists the heavyweight quantitative tools the desk uses. Reads as a
 * Bloomberg-style capability badge without being loud or distracting:
 * monospaced, dim, but with a red/cyan accent on the most differentiated
 * methods (HAC SE, PSR/DSR, Walk-forward CV, Reality Check). Sets the tone
 * that this is *quant-grade*, not retail TradingView.
 */
function CapabilityStrip() {
  const RED = "#f0686a";
  const items: Array<{ label: string; accent?: "red" | "cyan" }> = [
    { label: "PSR / DSR", accent: "red" },
    { label: "HAC SE (Newey-West)", accent: "red" },
    { label: "Carhart 4-factor", accent: "cyan" },
    { label: "Stationary Bootstrap", accent: "red" },
    { label: "White Reality Check", accent: "red" },
    { label: "Walk-forward CV", accent: "cyan" },
    { label: "Garman-Klass / Yang-Zhang", accent: "cyan" },
    { label: "ACF / PACF / ADF / Hurst" },
    { label: "Decile-sort IC factory" },
    { label: "ADV slippage + borrow" },
  ];
  return (
    <div
      className="px-[14px] py-[6px] flex items-center gap-[14px] overflow-x-auto shrink-0"
      style={{
        background: "linear-gradient(90deg, rgba(240,104,106,0.08) 0%, rgba(51,187,255,0.06) 100%)",
        borderBottom: "1px solid " + COLORS.border,
        fontFamily: FONT_MONO,
        fontSize: 10,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {/* Pulsing red dot — same animation as the Research tab badge so the
          eye carries the "this is the differentiated pane" cue from the
          tab bar down into the body. */}
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: RED,
          boxShadow: "0 0 6px " + RED,
          flexShrink: 0,
          animation: "willbb-livepulse 1.4s ease-in-out infinite",
        }}
      />
      <span style={{ color: COLORS.text, fontWeight: 700 }}>QUANT LAB</span>
      <span style={{ color: COLORS.borderSoft }}>│</span>
      {items.map((it, i) => (
        <span
          key={i}
          style={{
            color:
              it.accent === "red"
                ? RED
                : it.accent === "cyan"
                ? COLORS.brand
                : COLORS.textFaint,
            fontWeight: it.accent ? 600 : 500,
          }}
        >
          {it.label}
        </span>
      ))}
    </div>
  );
}

function SubTabBar({
  subTab,
  setSubTab,
}: {
  subTab: SubTabId;
  setSubTab: (s: SubTabId) => void;
}) {
  return (
    <div
      className="flex shrink-0"
      style={{
        background: COLORS.panel,
        borderBottom: "1px solid " + COLORS.border,
      }}
    >
      {SUB_TABS.map((t) => {
        const active = t.id === subTab;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className="px-[16px] py-[8px] text-left"
            style={{
              color: active ? COLORS.text : COLORS.textDim,
              borderBottom: active
                ? "2px solid " + COLORS.brand
                : "2px solid transparent",
              background: "transparent",
              fontFamily: FONT_UI,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                letterSpacing: "0.04em",
              }}
            >
              {t.label}
            </div>
            <div
              style={{
                fontSize: 10,
                color: active ? COLORS.textDim : COLORS.textFaint,
                marginTop: 1,
                fontFamily: FONT_MONO,
              }}
            >
              {t.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}
