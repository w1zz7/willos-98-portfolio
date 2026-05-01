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
