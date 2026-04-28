# Contributing

Thanks for taking a look. This is a personal portfolio repo, so the bar for
external contributions is high — but bug reports and small fixes are welcome.

## What I'll happily accept

- Typo + grammar fixes in copy
- Bug fixes with a clear repro (window manager edge cases, mobile layout
  glitches, accessibility issues)
- Performance fixes that ship a measurable improvement
- New `data/excel/*.ts` cells / chart data that strengthen an existing sheet

## What I'll probably close

- Features that change the visual identity (the Win98 aesthetic is the point)
- Forks of the personal content (resume, certificates, trade ledger, photos)
- Adding tracking, analytics, or third-party scripts beyond TradingView

## Local setup

```bash
npm install
npm run dev   # → http://localhost:3000
```

`npm run typecheck` and `npm run build` should both pass before opening a PR.

## Branch naming

`fix/...`, `feat/...`, `chore/...`, `docs/...` — matches the conventional-commit
prefixes used in commit messages.
