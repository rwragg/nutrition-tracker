<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# The frontend app, as it stands

A client-rendered app over the backend's API. Every record it shows comes from the server, and every
change it makes goes to the server; nothing is kept in the browser beyond what was last read.

## What it is

A Next.js 16 app with three views — Day, Foods, Meals — reading and writing the FastAPI backend's
`/api` routes. Signed out it shows the sign-in screen; signed in it shows the tracker with a log-out
control in the header. The log lives in the database, so it is there after a reload, in another browser,
and after the container is rebuilt.

It is built as a **static export** (`output: "export"` in `next.config.ts`) and served by the FastAPI
backend at `/`, so there is no Next.js server in the deployment — which is also why the app asks the
server who is signed in rather than being gated server-side. Export mode rules out partial prefetching
and the `cacheComponents` machinery that enables it; neither is used here.

## Layout

- `app/` — `layout.tsx` imports Bootstrap's CSS and `globals.css` and sets `data-bs-theme="dark"` on
  the document; `page.tsx` renders `App`; `globals.css` holds every palette token and the bridge into
  Bootstrap's `--bs-*` variables.
- `lib/api.ts` — the only place the app talks to the network. One function per route, returning the
  app's own types, and `ApiError`, which carries the status and, for a refused delete, the structured
  reason behind it.
- `lib/use-tracker.ts` — the app's copy of what the server holds: reads the records, hands writes to the
  API, re-reads after every write. Not a source of truth; the database is.
- `components/` — `App.tsx` is the shell: the session gate, the client gate, the view switcher, and the
  loading and error states. `SignIn.tsx` is the way in - sign in, or register a new account, which then
  starts on an empty log of its own - and `TitleBar.tsx` the header.
  `DayView`, `FoodsView` and `MealsView` are the three views. `DaySummary` renders the day's ring and
  figures, `MacroBar` a single nutrient bar, `SectionCard` a meal section, `EntryRow` a logged entry.
  `Dialog` is the overlay every dialog is built on; `TelegramDialog` (link or unlink a chat: asks for a code on request, shows it with the `/bind` line, and polls until the bot redeems it), `AddFoodDialog`, `AddMealDialog`, `FoodFormDialog`
  and `MealFormDialog` are the add and edit flows, and `DeleteDialog` the delete flow. `styles.ts` holds
  the shared class-name constants and `use-is-client.ts` the hook that gates client rendering.
- `lib/` — `types.ts` (`Unit`, `Macros`, `Food`, `Meal`, `LogEntry`, `Day`, `Store`, `View`, and the
  input shapes), `api.ts`, `use-tracker.ts`, `nutrition.ts` (all macro maths, pure), `dates.ts`,
  `format.ts`, `targets.ts` (the four targets, in one place), `usage.ts` (putting the server's refusal
  into the app's own words).
- `test/fixture.ts` — a small world for the tests, written out rather than derived from the seed, which
  lives in the backend now.
- `test/fetch-stub.ts` — a stand-in for the backend over that world. The app is API-backed, so a
  component test needs a server to talk to; this answers the same routes with the same shapes and
  refuses a delete the same way. Fresh for every test.
- `e2e/` — `tracker.spec.ts`, Playwright against a stack of its own on :8100.

## How it works

- **The session comes first.** `App` asks `/api/session` before it renders anything: while the answer is
  pending it shows the shell, on a 401 it shows `SignIn`, and on a user it shows the tracker. The
  protection is not this screen — it is the guard on every `/api` route, which refuses without a session
  whatever the page chooses to render.
- **State is a cache, not the truth.** `useTracker` reads foods, meals, the day list and the open day,
  and re-reads all of it after any write — so a food edit moves every day that logs it without the
  client having to know which days those are. The hook holds no record the server did not give it.
- **Writes return their refusal.** A delete the server refuses comes back as a value, not an exception,
  and the dialog shows it and stays open. The client does not predict the rule; it asks and reports.
- **Every figure the API reports is used where the API reports it.** A day chip shows the server's figure
  for that date; the summary and the section subtotals are the app's own arithmetic over the entries it
  fetched. A test asserts both, so a disagreement shows up rather than being hidden by picking one.
- **The client gate.** `App` returns `useIsClient() ? <SessionGate/> : <Shell/>`. Every date on screen is
  derived from "now", which a prerendered page cannot know without a hydration mismatch, so the gate sits
  above everything that reads a clock.
- **Loading and error states.** The tracker shows a loading panel until the first read answers, a failure
  panel if it cannot read at all, and a dismissible line if a later refresh fails. A dialog reports its
  own failure inline and stays open.
- **Targets.** `lib/targets.ts` is the only place the targets live: 2,200 kcal / 140 g protein /
  250 g carbs / 70 g fat. They are not stored — the API returns sums, and the app compares.

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
npm run dev        # development server, for working on the UI
npm run build      # static export to out/ - this is what the image serves
npm test           # 94 unit and component tests (Vitest + Testing Library)
npm run test:e2e   # 25 Playwright tests, against its own stack on :8100 (needs docker)
npm run lint
```

`npm run test:e2e` takes its own compose stack down before and after the run, so every run starts from a
freshly seeded database and the stack you are using is left alone. `next start` is not used anywhere —
the app is a static export, and `next start` does not serve one.
