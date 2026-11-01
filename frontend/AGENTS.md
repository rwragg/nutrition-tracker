<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# The frontend app, as it stands

This describes the code that exists today. Serving it from FastAPI and making it persistent are later
parts of the plan; what is here now is a client-rendered app over an in-memory store.

## What it is

A Next.js 16 app with three views — Day, Foods, Meals — over a single in-memory store. It makes **no
network call of any kind** and persists nothing: the store is seeded on load and resets on reload.
Sign-in and storage are the backend's job later.

## Layout

- `app/` — `layout.tsx` imports Bootstrap's CSS and `globals.css` and sets `data-bs-theme="dark"` on
  the document; `page.tsx` renders `App`; `globals.css` holds every palette token and the bridge into
  Bootstrap's `--bs-*` variables.
- `components/` — `App.tsx` is the shell: the client gate and the view switcher. `DayView`,
  `FoodsView` and `MealsView` are the three views. `DaySummary` renders the day's ring and figures,
  `MacroBar` a single nutrient bar, `SectionCard` a meal section, `EntryRow` a logged entry. `Dialog`
  is the overlay every dialog is built on; `AddFoodDialog`, `AddMealDialog`, `FoodFormDialog` and
  `MealFormDialog` are the add and edit flows, and `DeleteDialog` the guarded-delete flow. `styles.ts`
  holds the shared class-name constants and `use-is-client.ts` the hook that gates client rendering.
- `lib/` — `types.ts` (`Unit`, `Macros`, `Food`, `Meal`, `LogEntry`, `Day`, `Store`, `View`),
  `seed.ts` (31 foods, 5 meals, 3 seeded days), `store.ts` (the reducer), `nutrition.ts` (all macro
  maths, pure), `dates.ts`, `format.ts`, `targets.ts` (the four targets, in one place), `usage.ts`.
- `e2e/` — `tracker.spec.ts`, Playwright against a production build on :3100.

## How it works

- **State.** `useReducer(storeReducer, null, () => createSeedStore())` in `App.tsx`. One store,
  immutable updates, eight reducer cases. Nothing is written anywhere.
- **The client gate.** `App` returns `useIsClient() ? <Tracker/> : <Shell/>`. Every date on screen is
  derived from "now", which a prerendered page cannot know without a hydration mismatch, so the gate
  sits *above* the reducer rather than inside it.
- **Guarded deletes.** A food or a meal that anything still uses cannot be deleted. `usage.ts`
  computes where a record is referenced, the reducer refuses, and the dialog names the reference.
  Nothing cascades.
- **Targets.** `lib/targets.ts` is the only place the targets live: 2,200 kcal / 140 g protein /
  250 g carbs / 70 g fat.

## Conventions

- **Styling.** Bootstrap 5.3.8 CSS only — no Bootstrap JavaScript. The palette lives as custom
  properties in `globals.css`, bridged into `--bs-*`; no component hardcodes a colour. Contrast is
  measured, not eyeballed: every text pair is at least AA 4.5:1, and a solid accent fill carries ink
  text because white on the violet commit button fails at 2.7:1.
- **No emojis anywhere**, minimal README, and no unnecessary defensive programming.
- **Read the docs in `node_modules/next/dist/docs/` before writing code** — this Next.js major version
  differs from what you may have been trained on.

## Running it

```
cd frontend
npm install
npm run dev        # development
npm test           # 55 unit and component tests (Vitest + Testing Library)
npm run test:e2e   # 14 Playwright tests, against a production build on :3100
npm run lint
```
