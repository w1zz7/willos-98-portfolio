# WillOS 98 — A Windows 98 desktop portfolio that actually works

[![Next.js](https://img.shields.io/badge/Next.js-15-000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Zustand](https://img.shields.io/badge/Zustand-5-443e38?style=for-the-badge)](https://github.com/pmndrs/zustand)
[![Netlify](https://img.shields.io/badge/Netlify-deploy-00C7B7?style=for-the-badge&logo=netlify&logoColor=white)](https://www.netlify.com)

A live Windows 98 desktop in the browser. Drag windows, double-click icons, open a real Excel workbook, run a Bloomberg-style markets terminal, play Minesweeper, and read every project as a window in the OS. Built by [Will Zhang](https://www.linkedin.com/in/willzhang6200) — Drexel student founder, co-founder of [Bulletproof AI](https://bulletproofai.org), Philly CodeFest 2026 winner.

---

## What

| | |
|---|---|
| **Window manager** | Drag, resize, minimize, maximize, fullscreen, taskbar, Start menu, focus + z-order. Pure Zustand + custom Pointer-Events hooks (60fps drag via `style.transform` + `requestAnimationFrame`, then commit to the store on `pointerup`). |
| **Excel workbook** | Not a screenshot — a real grid built from declarative `SheetData` objects. Selectable cells, formula bar, frozen rows, click-to-open detail windows, status bar with the active selection. 8 sheets: Overview, Highlights, Experience, Projects, Leadership, Skills, Metrics, Contact. |
| **WillBB Markets Terminal** | TradingView-powered chart pane (MACD + RSI + 50-SMA pre-loaded) · 144-symbol watchlist transcribed from my actual trading platform · live index strip · Equity Research module with 12 sub-tabs (Profile, Technicals, Statistics, Income, Balance, Cash Flow, Analysts, Earnings, Holders, Dividends, Options, News) · Discovery screeners (gainers / losers / most-active) · boot animation with streaming log lines. |
| **Trading Strategy** | The actual playbook I run — pre-market level mapping (in my own words) plus a 5-step evaluation framework: **Fundamentals First → Trend → Momentum → Volume → Support/Resistance**, each with bullish/neutral/bearish chips. |
| **Stock Portfolio** | 267 closed trades · $315,020 processed · 63.98% G/L ratio · monthly P/L, per-ticker rollup, every figure reconciled against the underlying ledger in `data/trades.ts`. |
| **Other apps** | Projects (5 case studies) · Bulletproof AI · PhilAIsion (CodeFest winner deep-dive) · CNIPA Patent · Golf Memories · High School · Public Speaking · Market Journal (Jan→Apr 2026 daily/weekly recaps) · Case Competitions · Internet Explorer (with iframe-or-fallback) · Minesweeper (fully playable 9×9) · Recycle Bin (jokes) · Boot sequence · Mobile fallback. |

---

## How

```
portfolio/
├─ app/
│  ├─ page.tsx                     # Mounts PortfolioRoot (desktop) / MobilePortfolio
│  ├─ api/markets/                 # Server-side proxies (no API keys)
│  │  ├─ chart/route.ts            #   Yahoo v8 chart → CoinGecko fallback
│  │  ├─ quotes/route.ts           #   Multi-symbol live quotes (smart batch order)
│  │  └─ equity/route.ts           #   Equity research dispatcher (18 modules)
│  └─ opengraph-image.tsx
├─ components/
│  ├─ wm/                          # Window manager (Desktop, Window, Taskbar,
│  │                               # StartMenu, BootSequence, ResizeHandles,
│  │                               # ContextMenu, SystemTray, StickyNote)
│  └─ apps/
│     ├─ excel/                    # Centerpiece workbook + charts
│     ├─ willbb/                   # Markets Terminal + EquityResearch + Discovery
│     │                            # + TradingViewChart + BootScreen + Technicals
│     ├─ strategy/                 # Trading Strategy (fundamentals-first checklist)
│     ├─ projects/                 # 5 case study windows
│     ├─ market-recaps/            # Daily + weekly market journal
│     ├─ ie/                       # Internet Explorer iframe wrapper
│     ├─ minesweeper/              # Win98-correct beginner board
│     └─ ...                       # about, contact, golf, highschool, speaking,
│                                  # recycle-bin, dialogs, my-computer
├─ lib/
│  ├─ wm/                          # Zustand store · drag/resize hooks · URL sync
│  │                               # · fullscreen API · open-link helper
│  ├─ excel/                       # Excel domain model (cell refs, selection)
│  ├─ marketsFallback.ts           # Curated 113-symbol seed snapshot
│  ├─ equityFallback.ts            # Profile/Statistics seed for popular tickers
│  └─ equityModuleFallback.ts      # Seed-derived income / balance / cashflow /
│                                  # earnings / analysts / holders / options / news
└─ data/
   ├─ apps.ts                      # Desktop icon layout + Start menu
   ├─ excel/                       # Per-sheet declarative content
   ├─ trades.ts                    # 267 real closed trades
   └─ marketRecaps.ts              # Jan→Apr 2026 market journal
```

**Highlights:**

- **No external chart libs.** Mini sparkline / area charts in the markets terminal are hand-rolled SVG (`PriceChart.tsx`); the hero chart embeds TradingView's official widget.
- **No API keys required.** `/api/markets/*` proxies Yahoo Finance v8 (with cookie + crumb session) and CoinGecko (crypto fallback); falls through to the curated seed snapshot when upstreams rate-limit so the page is never blank.
- **Smart provider order.** Single-symbol requests go Yahoo-first (always live when available); large 144-symbol watchlist batches go seed-first to avoid a 429 storm.
- **Deep-linkable.** `?open=willbb&focused=NVDA` opens any combination of apps; URL stays in sync as you drag windows around.
- **Mobile-aware.** Below the `md` breakpoint, windows become fullscreen and the taskbar becomes a horizontal tab strip.
- **Fullscreen toggle.** Click ⛶ in the system tray to run the desktop edge-to-edge — a real Fullscreen API request.
- **Sound system (off by default).** Toggle from the system tray, preference persists in `localStorage`. Drop your own `.wav` files into `public/sounds/`.

---

## Why

Recruiters spend 7 seconds on a resume. A portfolio site has the same problem unless it makes you stop scrolling. WillOS 98 is built on the bet that a working Windows 98 desktop with a real markets terminal inside it earns more than 7 seconds — and once you're in, every project is one double-click away.

It's also where I keep my homework. The Excel sheet is the actual book of record. The Markets Terminal is what I open when I'm trading. The Trading Strategy app is the playbook I actually run.

---

## Run it locally

```bash
git clone https://github.com/w1zz7/willos-98-portfolio.git
cd willos-98-portfolio
npm install
npm run dev   # → http://localhost:3000
```

Useful scripts: `npm run build` · `npm run start` · `npm run typecheck` · `npm run lint`.
No environment variables required.

> **Heads up:** Yahoo Finance hard-rate-limits some shared dev IPs. If equity quotes show snapshot data locally, that's expected — production (Netlify) IPs are usually fine.

---

## Deploy

`netlify.toml` is included. Netlify's built-in Next.js Runtime handles SSR pages, the `/api/markets/*` routes (deployed as on-demand functions), and ISR cache headers automatically.

```bash
npx netlify-cli init        # link this folder to a new or existing site
npx netlify-cli deploy --prod
```

---

## License + content

Code: feel free to reference the patterns. The personal content (resume PDF, headshot, certificates, trade ledger, project deep-dives, photos) is mine — please don't fork those into your own portfolio verbatim.

## Find me

[![Email](https://img.shields.io/badge/Email-c14438?style=for-the-badge&logo=gmail&logoColor=white)](mailto:wz363@drexel.edu)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/willzhang6200)
[![Bulletproof AI](https://img.shields.io/badge/bulletproofai.org-111111?style=for-the-badge&logo=googlechrome&logoColor=white)](https://bulletproofai.org)
