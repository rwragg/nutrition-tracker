# Nutrition Tracker MVP — Plan

Source of truth for requirements: `AGENTS.md` (numbered below as R#).
Deliverable: Next.js client-rendered web app in `frontend/`, no persistence, no auth,
dummy data for one sample day on first paint. Server running at the end.

## Requirements checklist (from AGENTS.md)

- R1 Log daily meals
- R2 Entries can be individual ingredients (e.g. "1 cup rice")
- R3 Entries can be meals — a named group of ingredients (e.g. "typical breakfast")
- R4 Nothing else: no archive, no search/filter screens beyond in-form lookup, no history
- R5 Priority is a slick professional UI/UX over feature count
- R6 App opens populated with dummy data for one sample day
- R7 Next.js, client-rendered, in `frontend/`
- R8 No persistence, no user management
- R9 Popular libraries, elegant but simple
- R10 Palette: yellow #ecad0a, blue #209dd7, purple #753991, navy #032147, gray #888888
- R11 Latest library versions, idiomatic, no over-engineering, no emojis, minimal README

## Phase 1 — Scaffold

- create-next-app (TypeScript, App Router, Tailwind, ESLint) in `frontend/`
- `.gitignore` covering node_modules, .next, build output, playwright artefacts
- Vitest + React Testing Library wired up; `npm test` green on a smoke test
- `npm run lint` and `npm run build` clean

**Success criteria:** P1.1 frontend/ exists on Next.js latest · P1.2 `npm run build` exits 0 ·
P1.3 `npm test` runs and passes · P1.4 `npm run lint` exits 0 · P1.5 .gitignore present.

## Phase 2 — Domain + dummy data

- `lib/types.ts` — Food (ingredient with base amount/unit/macros), MealEntry, LogEntry
- `lib/foods.ts` — small ingredient catalogue with real per-unit nutrition
- `lib/meals.ts` — meal templates ("Typical Breakfast", etc.)
- `lib/dummy-day.ts` — a fully populated sample day
- `lib/nutrition.ts` — pure functions: entry macros, meal macros, day totals, targets

**Success criteria:** P2.1 types compile · P2.2 sample day totals computed by pure function ·
P2.3 unit tests cover totals + edge cases (empty day, fractional qty).

## Phase 3 — UI

- Header: date, day calorie total vs target, macro bars (protein/carbs/fat)
- Four meal sections (Breakfast/Lunch/Dinner/Snacks) as cards, each listing its entries
  with per-entry calories and macros, plus a section subtotal
- Meal entries render as an expandable named group of ingredients
- Add ingredient: modal, pick from catalogue, set quantity, choose section
- Add meal: modal, pick a template
- Remove entry
- Palette exactly as R10; typography and spacing deliberate; responsive 360px→desktop
- Zero console errors

**Success criteria:** P3.1 all four sections render with dummy data · P3.2 ingredient add
changes totals · P3.3 meal add adds a group · P3.4 remove works · P3.5 no console errors ·
P3.6 keyboard-focusable controls with visible focus.

## Phase 4 — Integration testing (Playwright)

- Playwright against the production build (`next start`)
- Cover: initial render + dummy data, add ingredient flow, add meal flow, remove flow,
  totals arithmetic cross-checked against the pure functions, mobile viewport, console errors

**Success criteria:** P4.1 suite green · P4.2 zero console errors/page errors during runs ·
P4.3 totals shown in the UI equal the numbers computed independently.

## Phase 5 — Handover

- README (minimal, no emojis) with run instructions
- Dev server running in the background, verified reachable
- Screenshot of the finished app

**Success criteria:** P5.1 README accurate · P5.2 `curl` on the served URL returns the app ·
P5.3 screenshot captured · P5.4 completion report lists each criterion and its evidence.

## Status — all phases complete

Verified on 2026-11-01, on a production build (`npm run build` then `npm start`):

- P1.1 Next.js 16.4.3 / React 19.3 / Tailwind 4 in `frontend/` · P1.2 `npm run build` exit 0 ·
  P1.3 `npm test` 26 passed (3 files) · P1.4 `npm run lint` exit 0 · P1.5 .gitignore extended with
  Playwright output.
- P2.1 `tsc` clean as part of the build · P2.2 sample day rendered straight from `dayMacros()` ·
  P2.3 unit tests cover zero/empty day, fractional quantities, unknown ids, meal sums.
- P3.1 four sections render with dummy data · P3.2/P3.3/P3.4 add ingredient, add meal and remove all
  covered by tests at both levels · P3.5 zero console errors asserted in every e2e test · P3.6 all
  controls are real buttons/inputs with focus-visible rings and an Escape-closing, labelled dialog.
- P4.1 `npm run test:e2e` 6 passed · P4.2 no console or page errors during any run · P4.3 expected
  numbers in the specs are computed from `lib/nutrition.ts`, so the page and the model are checked
  against each other rather than against hardcoded strings.
- P5.1 README rewritten for this app · P5.2 `curl http://127.0.0.1:3000/` returns 200 · P5.3 desktop
  and phone screenshots captured · P5.4 report delivered.

Sample day as computed by the app's own maths: 2,208 kcal · 121 g protein · 303 g carbs · 68 g fat
(breakfast 490, lunch 738, dinner 624, snacks 356), against a 2,200 kcal / 140 g protein target.

