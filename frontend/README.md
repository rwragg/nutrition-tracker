# Nutrition Tracker frontend

A Next.js 16 app, built as a static export (`output: "export"`) and served by the FastAPI backend at `/`.
Signed out it shows the sign-in screen; signed in it shows the log. Every record it shows comes from the
backend's `/api` routes and every change it makes goes there, so nothing is held in the browser beyond what
was last read from the server. The log itself lives in SQLite, which the backend creates and seeds on first
run.

How it is put together: [`AGENTS.md`](AGENTS.md). Running the whole stack: [`../README.md`](../README.md).

## Run

The app is a static export served by the backend, so it is normally run through the container:

```bash
../scripts/start.sh    # builds and starts; the app is then at http://localhost:8000/
../scripts/stop.sh
```

`npm run dev` starts the Next development server on :3000. There is no proxy in `next.config.ts`, and the
app calls `/api` on whatever origin serves it, so a development server has no backend behind it - it is
useful only for work that does not need the data. To use the app, run the container and open :8000.
`npm run build` writes the export to `out/`, which is what the image serves; `next start` is not used
anywhere, because it does not serve a static export.

## Test

```bash
npm install
npm test             # 140 unit and component tests (Vitest + Testing Library)
npm run test:e2e     # 28 Playwright tests, against its own container on :8100 (needs docker)
npm run lint
npx tsc --noEmit
```

`npm run test:e2e` builds a compose stack of its own (project `nutrition-e2e`, port 8100) and throws it
away before and after the run, so every run starts from a freshly seeded database and the stack you are
using is left alone. It runs one worker, because its tests share that database.

## What it does

Three views, switched from the header:

- **Day** - the day switcher lists every logged day with the server's calorie figure for it; picking one
  digs into its log. The summary panel totals that day against its targets, and breakfast, lunch, dinner
  and snacks each hold entries. Log a food with a quantity, log a whole meal, or remove an entry.
- **Foods** - create, edit and delete a food. A food holds its name, its unit and the macros for one unit,
  so logging two units doubles them. Editing a food updates every meal and every day that uses it. The
  units include `g`, the gram basis: a food recorded in grams carries its macros per gram, so a weighed
  portion logs as it reads on the scale - 183 g of yogurt at 0.61 kcal/g is 111.63 kcal.
- **Meals** - create, edit and delete a meal by composing it from foods and their quantities, then log it
  on a day in one tap.

Deletes are guarded: a food that a meal or a day still refers to cannot be deleted, and the dialog says
where it is used. The same applies to a meal that a day logs.

## Styling

Bootstrap 5.3.8 is the framework, running in its dark theme (`data-bs-theme="dark"`), and it is the only
styling dependency - its CSS only, no Bootstrap JavaScript. Its stylesheet is imported in
`app/layout.tsx`, the components use its grid, nav, form, modal and button classes, and its `--bs-*`
variables are bridged to the palette in `app/globals.css`. Anything Bootstrap has no class for - the day
panel, the calorie ring, the macro bars, the coloured section strips, the attribute-driven row actions -
lives in that same file as a short, named set of rules.

Every text and surface pair is at least 4.5:1, measured rather than eyeballed. Solid accent fills carry ink
text, never white: white on the violet commit button is 2.7:1 and fails.

## Layout

```
app/          page shell and global theme (palette in app/globals.css)
components/   UI: the day, foods and meals views; section cards; entry rows; dialogs
lib/          types, the API client, the tracker hook, dates, macro maths, formatting
test/         the fixture and the fetch stub the component tests run against
e2e/          Playwright specs
```

Macros are per one unit of each food. Daily targets live in `lib/targets.ts`.
