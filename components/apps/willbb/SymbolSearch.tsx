"use client";

/**
 * SymbolSearch — autocomplete-style symbol input for willBB.
 *
 * Uses Alpha Vantage's SYMBOL_SEARCH endpoint via /api/markets/alpha?fn=SYMBOL_SEARCH.
 * Replaces the plain `<input>` symbol field used in Cockpit, StrategyLab,
 * RiskDashboard. While the user types we debounce 300ms then fetch matches;
 * each query is server-cached 10min so repeated typing is cheap.
 *
 * Design:
 *   - Free-typing always works (you can type a ticker that isn't in AV's
 *     index and it commits on Enter / blur)
 *   - On focus + ≥2 chars, dropdown shows up to 8 matches with name + region
 *   - Arrow keys navigate, Enter selects, Esc closes
 *   - Match-score visualisation (bright = 1.0 → faint = 0.5)
 *   - Falls back gracefully when AV is unavailable (just acts like a
 *     plain input)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { COLORS, FONT_MONO, FONT_UI } from "./OpenBB";

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  region: string;
  currency: string;
  matchScore: number;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  width?: number | string;
  fontSize?: number;
}

export default function SymbolSearch({
  value,
  onChange,
  placeholder = "SYMBOL",
  width = 120,
  fontSize = 14,
}: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync external value changes (e.g., when user clicks a symbol elsewhere
  // and the parent updates `value` prop). Don't override while user is typing.
  useEffect(() => {
    if (!open) setQuery(value);
  }, [value, open]);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !open) {
      setResults([]);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/markets/alpha?fn=SYMBOL_SEARCH&q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { results?: SearchResult[] };
        if (ctrl.signal.aborted) return;
        const filtered = (data.results ?? []).slice(0, 8);
        setResults(filtered);
        setHighlight(0);
      } catch {
        // ignore
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, open]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function commit(symbol: string) {
    const upper = symbol.toUpperCase().trim();
    if (upper.length === 0) return;
    onChange(upper);
    setQuery(upper);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && results[highlight]) commit(results[highlight].symbol);
      else commit(query);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => Math.min(results.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Tab") {
      // Tab commits the highlighted match if open; otherwise commits query
      if (open && results[highlight]) {
        e.preventDefault();
        commit(results[highlight].symbol);
      }
    }
  }

  const hasMatches = open && results.length > 0;

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", display: "inline-block", width, fontFamily: FONT_UI }}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay close so click on dropdown row registers first
          window.setTimeout(() => setOpen(false), 150);
          // On blur, commit the typed value if it differs from `value`
          if (query.toUpperCase().trim() !== value.toUpperCase()) {
            commit(query);
          }
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{
          width: "100%",
          background: COLORS.panelDeep,
          color: COLORS.text,
          border: "1px solid " + COLORS.borderSoft,
          padding: "4px 8px",
          fontSize,
          fontWeight: 700,
          fontFamily: FONT_MONO,
          letterSpacing: "0.04em",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {loading && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: COLORS.brand,
            boxShadow: `0 0 6px ${COLORS.brand}`,
            animation: "willbb-livepulse 1.5s ease-in-out infinite",
          }}
        />
      )}
      {hasMatches && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            minWidth: 280,
            background: COLORS.panel,
            border: `1px solid ${COLORS.border}`,
            boxShadow: "0 6px 18px rgba(0,0,0,0.55)",
            zIndex: 1000,
            maxHeight: 300,
            overflowY: "auto",
          }}
        >
          {results.map((r, i) => {
            const isHi = i === highlight;
            const matchOpacity = Math.max(0.45, Math.min(1, r.matchScore));
            return (
              <button
                key={`${r.symbol}-${i}`}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault(); // don't blur the input
                  commit(r.symbol);
                }}
                style={{
                  width: "100%",
                  display: "block",
                  textAlign: "left",
                  padding: "6px 10px",
                  background: isHi ? COLORS.brandSoft : "transparent",
                  border: "none",
                  borderBottom: "1px solid " + COLORS.borderSoft,
                  cursor: "pointer",
                  color: COLORS.text,
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: "0.04em" }}>
                    {r.symbol}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      color: COLORS.textFaint,
                      opacity: matchOpacity,
                      fontFamily: FONT_MONO,
                    }}
                  >
                    {r.region} · {r.type}
                  </span>
                </div>
                <div style={{ color: COLORS.textDim, fontSize: 10, marginTop: 1, fontFamily: FONT_UI }}>
                  {r.name}
                </div>
              </button>
            );
          })}
          <div
            style={{
              padding: "4px 10px",
              background: COLORS.panelDeep,
              fontSize: 9,
              color: COLORS.textFaint,
              fontFamily: FONT_MONO,
              letterSpacing: "0.06em",
              textAlign: "right",
            }}
          >
            powered by Alpha Vantage SYMBOL_SEARCH
          </div>
        </div>
      )}
    </div>
  );
}
