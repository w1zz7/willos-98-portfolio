# Will Zhang — WillOS 98 Portfolio

A personal portfolio built as an interactive Windows 98 desktop, with an Excel
workbook as the primary content hub. Retro aesthetics, real interactivity,
portfolio-serious content.

> Student founder building where business, growth, and AI execution meet.
> — Drexel B.S. Business Admin · Co-founder, Bulletproof AI · Philly CodeFest 2026 Winner

---

## Local development

```bash
cd portfolio
npm install
npm run dev
```

Open <http://localhost:3000>.

Useful scripts:

- `npm run dev` — start the Next.js dev server
- `npm run build` — production build
- `npm run start` — run the production build locally
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — Next ESLint

---

## What's inside

```
portfolio/
  app/                        # Next.js App Router entry (RootLayout, page.tsx)
  components/
    wm/                       # Window manager: Desktop, Window, Taskbar, StartMenu, BootSequence
    apps/                     # Each "app" that can open in a window
      excel/                  # The centerpiece: workbook + charts
      about/                  # About Me window (bio + timeline)
      projects/               # Project index + 5 case study windows
      resume/                 # Resume PDF viewer
      contact/                # Notepad-style contact + mailto form
      my-computer/            # Retro file explorer
      recycle-bin/            # Easter egg jokes
      minesweeper/            # Fully playable 9×9 beginner
      ie/                     # Internet Explorer wrapper for external links
      dialogs/                # Welcome, Shutdown, About dialogs
  lib/
    wm/                       # Window manager core (Zustand store, drag, resize, URL sync)
    excel/                    # Excel workbook domain model (cell refs, selection)
    sound/                    # Sound system + muted-by-default toggle
  data/
    apps.ts                   # Desktop icon layout + Start menu
    excel/                    # Per-sheet content (Overview, Experience, Projects, Leadership, Skills, Metrics, Contact)
  public/
    icons/                    # 32×32 pixel-art SVG icons
    resume.pdf                # Resume (copy your own to this path)
    will-zhang.jpg            # Headshot
```

### The Excel workbook

The Excel window is **not a screenshot** — it's a real grid built from
declarative `SheetData` objects in `data/excel/*`. Each sheet defines columns,
cells, and optional interactions (`onClick` to open a detail window, `href`
for external links). Every cell is selectable; the formula bar shows an
authored formula string; the status bar reflects the current selection.

To add a sheet: drop a new file in `data/excel/`, add it to the `SHEETS` array
in `data/excel/index.ts`. Done.

### Window manager

- Zustand store in `lib/wm/store.ts`: windows, z-order, focus, maximize state
- Drag + resize are custom Pointer-Events hooks (`useDrag`, `useResize`) that
  mutate `style.transform` directly via `requestAnimationFrame`, then commit to
  the store on `pointerup`. This keeps drag at 60fps even with many windows
  open.
- Registry in `lib/wm/registry.tsx` maps every `AppId` to a dynamic component
  + default window size + singleton / noResize flags.
- Deep links via `?open=excel,about&sheet=metrics` (see `lib/wm/urlSync.ts`).

### Mobile behavior

Below the `md` (768 px) breakpoint, windows become fullscreen and the taskbar
becomes a horizontal tab strip. Dragging and resizing are skipped — the
desktop metaphor gracefully degrades to stacked cards.

### Sounds

Muted by default (polite first impression). Toggle with the speaker icon in
the system tray; preference persists in `localStorage`.

Drop your own `.wav` files into `public/sounds/`:

- `startup.wav`, `open.wav`, `close.wav`, `minimize.wav`, `click.wav`, `error.wav`, `ding.wav`

Missing files are silently skipped.

---

## Deployment

This is a standard Next.js 15 app. Primary target is **Netlify**, but it works
on any Node host (Railway, Render, Fly, Vercel) without changes.

### Netlify

```bash
# one-time
npx netlify-cli login
npx netlify-cli init    # link this folder to a new or existing site
# then either: push to git (auto-deploys) or:
npx netlify-cli deploy --prod
```

`netlify.toml` pins Node 20 + sets cache headers on `/api/markets/*`. Netlify's
built-in Next.js Runtime handles SSR, ISR, and on-demand functions for the
API routes automatically — no plugin block needed.

No environment variables are required. Quotes and equity-research data flow
through `/api/markets/*` (server-side proxies of Yahoo Finance + CoinGecko;
no API keys).

---

## Content source

Every fact displayed traces to `/Users/willzzh/Desktop/RESUME/WillZhangResume.pdf`. A copy lives at `public/resume.pdf` for the embedded viewer. Copy improvements were made for clarity and consistency — no fabricated accomplishments.

---

## Credits

Designed + engineered by [Will Zhang](https://www.linkedin.com/in/willzhang6200).
Built with Next.js 15, React 19, TypeScript, Tailwind CSS, and a healthy
respect for 1998.
