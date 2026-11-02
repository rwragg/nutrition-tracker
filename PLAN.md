# Nutrition Tracker — Plan (v2)

> **Superseded.** This is the v2 plan, written before the project was broken into the eight parts that
> now govern it. It predates the backend, the database and sign-in, so where the two disagree - and they
> do - the live plan in [`docs/PLAN.md`](docs/PLAN.md) wins. Kept for the record of why v1 was scrapped.

Source of truth: `AGENTS.md`. Deliverable: Next.js client-rendered web app in `frontend/`, no
persistence, no auth, seeded with dummy history, server running at the end.

**v1 is superseded.** It was built against the brief as it stood on 2026-11-01 (single sample day,
frozen food catalogue and meal templates, search box in the add-food dialog). The brief then gained
three requirements — CRUD on foods, CRUD on meals, and tracking days over time — and renamed
"ingredient" to "food". v1 satisfied R1–R3 and R5–R11; it did not satisfy R4–R6. Its **data layer is
scrapped** (frozen `lib/foods.ts`, `lib/meals.ts`, `lib/day.ts`, `lib/dummy-day.ts` and the
single-day state shape) and its **views are extended** rather than rewritten. What survives: the
colour scheme and layout of the day view, the day summary panel, `MacroBar`, `EntryRow`, `Dialog`,
the macro maths in `lib/nutrition.ts`, `lib/format.ts`, `lib/targets.ts`, the test harness and the
whole of Phase 1 (scaffold, lint, Vitest, Playwright, .gitignore).

## Requirements checklist (from AGENTS.md)

- R1 Log daily meals
- R2 Entries can be individual foods (e.g. "1 cup rice")
- R3 Entries can be meals — a named group of foods (e.g. "typical breakfast")
- R4 Create, read, update and delete a **food**
- R5 Create, read, update and delete a **meal**
- R6 Track days over time, and dig into a day
- R7 Nothing else: no archive, no search/filter. Keep it simple.
- R8 Priority is a slick professional UI/UX over feature count
- R9 App opens populated with dummy data for a few sample days, so the day history is visible
  immediately
- R10 Next.js, client-rendered, in `frontend/`
- R11 No persistence, no user management
- R12 Popular libraries, elegant but simple
- R13 Palette and its per-colour assignment, exactly as `AGENTS.md` documents
- R14 Latest library versions; never over-engineer; no unnecessary defensive programming; no extra
  features; no emojis anywhere; minimal README
- R15 Bootstrap is the styling framework for the whole UI (`AGENTS.md`: "Use Bootstrap")
- R16 "Tracking days" is a history of days to move between and open — not an archive screen, saved
  views or filters over that history
- R17 Each day is summarised against targets of 2,200 kcal / 140 g protein / 250 g carbs / 70 g fat,
  held in one place (`lib/targets.ts`)
- R18 A food or a meal still in use is never deleted silently: the delete is refused and the app says
  where the record is referenced. Nothing cascades

## Decisions taken (recorded, per D-numbers)

- **D1 — searched the food list no longer.** R7 says no search/filter, and R4 now lets the food list
  grow. The v1 search box inside the add-food dialog is deleted; the list scrolls instead.
- **D2 — delete is guarded, not cascading.** A food that a meal or a day log refers to cannot be
  deleted; the dialog says where it is used and names it. Same for a meal logged in a day. Blocking
  is one pure function both the reducer and the dialog read, versus a cascade that silently rewrites
  meals and day logs.
- **D3 — days are seeded, not created.** R6 asks to track days over time and dig into a day, not to
  invent new ones, and R7 caps the feature list. Three days ship with dummy data; every one is a
  live, editable log, and the day switcher moves between them.
- **D4 — the app renders client-side behind a client gate.** Every date on screen is derived from
  "now", which a prerendered page cannot know without a hydration mismatch. The shell renders on the
  server, the app itself only on the client. This is also the literal reading of R10.
- **D5 — sections stay.** Breakfast / lunch / dinner / snacks remain the structure of a day's log;
  a "meal" is a named group of foods that can be logged into any of them.
- **D6 — PEP 8 is inert here.** There is no Python in this project (R10 is Next.js only), so the
  coding standard's style gate is ESLint instead. Flagged rather than silently ignored.
- **D7 — Bootstrap is the framework, not a layer on top of another one.** R15 arrived after the UI
  was built, so the earlier utility-CSS theme and its build integration were removed rather than
  left underneath Bootstrap; two styling systems would be exactly the over-engineering R14 bans.
  The palette survives as CSS custom properties in `app/globals.css`, bridged into Bootstrap's own
  `--bs-*` variables, so the colour assignment in `AGENTS.md` still holds.
- **D8 — Bootstrap's CSS, not its JavaScript.** Plain `bootstrap/dist/css/bootstrap.min.css` imported
  in the layout, with the dialog markup built from Bootstrap's `modal-*` classes and our own
  overlay and focus handling. That drops a JS bundle and a hydration surface for four components we
  already control. Icons stay with lucide-react, which is orthogonal to the CSS framework.
- **D9 — "edgy enterprise" means dark, dense and numeric, so the scheme was replaced rather than
  tinted.** Ink base, one acid accent (volt) for live figures and active controls, cyan for actions,
  violet for commits, one status colour. Bootstrap runs in its own dark theme (`data-bs-theme="dark"`)
  so its form, modal and nav internals come along. Every pair was **measured, not eyeballed**: body
  text 4.5:1 minimum against both surfaces, hairlines picked at 1.6:1-or-better so a border reads on
  every surface. Recorded consequence: solid violet carries ink text, because white on violet is
  2.7:1 and fails.

## Phase 1 — Scaffold · complete in v1, unchanged

**Success criteria (all met, evidence in v1 status below):** P1.1–P1.5.

## Phase 2 — Domain model (v2, replaces v1's)

- `lib/types.ts` — `Food`, `Meal` (ingredients reference foods by id), `LogEntry` (a food with a
  quantity, or a meal), `Day` (id, date, four sections), `Store` (foods, meals, days)
- `lib/seed.ts` — seed foods, seed meals, three seeded days (today, yesterday, two days ago)
- `lib/store.ts` — reducer for food CRUD, meal CRUD, log entries, plus `foodUsage` / `mealUsage`
- `lib/nutrition.ts` — pure maths over the store: entry, section, meal and day macros

**Success criteria:** P2.1 types compile · P2.2 every macro figure derived from the store, nothing
hardcoded · P2.3 unit tests cover food CRUD, meal CRUD, the delete guards, entry add/remove, day
totals for a day other than the selected one, an empty food list and fractional quantities.

## Phase 3 — UI (v2)

- View switcher: Day · Foods · Meals
- **Day**: day switcher listing the seeded days with each day's calories; the navy summary panel;
  four section cards; add food / add meal / remove entry
- **Foods**: list every food with its unit and per-unit macros; create, edit, delete
- **Meals**: list every meal with calories and ingredient count; create, edit, delete; the meal
  form composes it from foods and their quantities
- Guarded deletes explained in a dialog rather than silently refused
- Palette and per-colour assignment exactly as R13; responsive from 360px; zero console errors

**Success criteria:** P3.1 the seeded day renders with its dummy data · P3.2 a new food can be
created and used · P3.3 a food can be edited and the change flows into meals and day totals ·
P3.4 deleting an unused food works; deleting a used food is refused with a reason · P3.5 the same for
meals · P3.6 a meal can be composed from foods · P3.7 switching day switches the log and the totals ·
P3.8 no console errors · P3.9 every control keyboard reachable with visible focus.

## Phase 4 — Integration testing (Playwright)

- Against the production build on :3100; expected numbers computed from the app's own pure functions
- Cover: seeded day, food CRUD end to end, meal CRUD end to end, both delete guards, day switching,
  mobile viewport, console/page errors on every run

**Success criteria:** P4.1 suite green · P4.2 zero console and page errors · P4.3 UI figures equal
the independently computed figures · P4.4 delete guards demonstrably refuse.

## Phase 5 — Handover

**Success criteria:** P5.1 README accurate · P5.2 `curl` on the served URL returns the app ·
P5.3 screenshots captured · P5.4 completion report lists each criterion with its evidence.

## Status — v4 (current)

Colour scheme replaced with the dark scheme in `AGENTS.md` (R13 rewritten, D9 recorded). Verified
2026-11-01 on a production build, after the change: build exit 0, lint exit 0, 55 unit and component
tests, 14 Playwright tests, zero console errors.

- Every token checked in the running app rather than in the file: body `rgb(10,13,18)`, card
  `rgb(18,22,31)`, input `rgb(26,32,43)`, active tab `rgb(200,255,77)`, hairline `rgb(56,67,85)`,
  dialog `rgb(18,22,31)`. No colour literal lives in any component.
- Contrast measured with a script before the palette was applied, in both directions: text on ink
  16.9:1, muted 6.4:1, volt 16.6:1, cyan 11.5:1, violet 6.2:1, ember 6.9:1. Two values changed because
  of the numbers: hairlines went to `#384355` (the first pick was invisible at 1.18:1 on a raised
  surface) and the solid commit button's text became ink (white on violet is 2.74:1, a fail).
- The e2e test that reads `.modal-content`'s computed background was updated to the new surface value,
  which is the test earning its keep: it is the thing that notices when a token change breaks a
  framework component.
- Also fixed: light scrollbars in a dark UI (`color-scheme`, `scrollbar-color` on the root and on
  scrollable dialogs).

## Status — v3 (superseded, kept as history)

Verified 2026-11-01 on a production build (`npm run build`, then `npm start` on :3000):

- R15 met: `bootstrap@5.3.8` is the only styling dependency; the previous utility framework and its
  Turbopack loader are gone from `package.json`, `next.config.ts` and `app/globals.css`. Bootstrap is
  loaded by the layout and the palette is bridged into `--bs-*`, so the colour assignment is intact.
- Re-verified after the migration: build exit 0, lint exit 0, 55 unit and component tests, 14
  Playwright tests, zero console errors in every e2e test, phone viewport clean.
- One defect the screenshots caught and the tests did not: Bootstrap's `.modal-content` takes its
  background from `--bs-modal-bg`, which Bootstrap only defines on `.modal`. Our overlay is not a
  `.modal`, so the dialog rendered transparent with an invisible title. Fixed by declaring the
  `--bs-modal-*` variables on the overlay, and **P4.5** now asserts the computed background of
  `.modal-content` is opaque, so the class of defect cannot come back silently.
- Also corrected during the migration: the meal expand label had become a blue link and `min-w-0`
  (a utility the old framework provided) had silently stopped doing anything.

## Status — v2 (superseded, kept as history)

Verified 2026-11-01 on a production build (`npm run build`, then `npm start` on :3000):

- P1.1-P1.5 unchanged from v1 (Next.js 16.4.3 / React 19.3 / Tailwind 4; build, lint and the test
  harness all green).
- P2.1-P2.3 `lib/` is types, `seed.ts` (31 foods, 5 meals, 3 days), `store.ts` (reducer + the two
  usage guards), `dates.ts`, `nutrition.ts`. 55 unit and component tests pass, covering food CRUD,
  meal CRUD, both guards refusing, entry add/remove, day totals per day, an empty food list,
  fractional quantities, unknown ids and the immutability of the input store.
- P3.1-P3.9 the day view renders the seeded day; foods and meals each have a working create, edit and
  delete; deletes that would break a reference are refused with the reason; day switching changes the
  log and the totals; every e2e test asserts the console stayed quiet.
- P4.1-P4.4 `npm run test:e2e` 13 passed, expected figures computed from the app's own functions,
  both guards demonstrably refusing, phone viewport clean.
- P5.1 README rewritten for the three views; P5.2 `curl` on :3000 returns 200; P5.3 screenshots of all
  three views captured; P5.4 report delivered.

Two deviations worth naming: R4/R5 ask for CRUD, which needs a create/edit/delete control per record —
that is more surface than v1 had, not an optional extra. And `createSeedStore()` is called from a
client-only branch: Next 16 refuses `new Date()` during prerender, so the tracker renders after the
client gate rather than inside it.

## Status — v1 (superseded, kept as history)

Verified 2026-11-01 on a production build: P1.1 Next.js 16.4.3 / React 19.3 / Tailwind 4 ·
P1.2 build exit 0 · P1.3 26 unit tests · P1.4 lint exit 0 · P1.5 .gitignore extended.
Sample day: 2,208 kcal · 121 g protein · 303 g carbs · 68 g fat (breakfast 490, lunch 738,
dinner 624, snacks 356) against 2,200 kcal / 140 g protein. e2e: 6 passed. Commits `5f2462e`,
`0a24b7e`, `4cebd30`.
