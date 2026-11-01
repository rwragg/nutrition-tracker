# Nutrition Tracker

A food log you can keep for more than one day. Client-rendered Next.js app, no persistence and no
user accounts: it opens on three seeded sample days and resets on reload.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

## Test

```bash
npm test             # unit and component tests (Vitest + Testing Library)
npm run test:e2e     # end-to-end tests (Playwright, serves the production build on :3100)
npm run lint
```

## What it does

Three views, switched from the header:

- **Day** - the day switcher lists every day with its calories; picking one digs into its log. The
  navy panel totals that day against its targets, and breakfast, lunch, dinner and snacks each hold
  entries. Log a food with a quantity, log a whole meal, or remove an entry.
- **Foods** - create, edit and delete a food. A food holds its name, its unit and the macros for one
  unit, so logging two units doubles them. Editing a food updates every meal and day that uses it.
- **Meals** - create, edit and delete a meal by composing it from foods and their quantities, then
  log it on a day in one tap.

Deletes are guarded: a food that a meal or a day still refers to cannot be deleted, and the dialog
says where it is used. The same applies to a meal logged on a day.

## Layout

```
app/          page shell and global theme (palette in app/globals.css)
components/   UI: the day, foods and meals views; section cards; entry rows; dialogs
lib/          types, seeded store and its reducer, dates, macro maths, formatting
e2e/          Playwright specs
```

Macros are per one unit of each food, at typical USDA values. Daily targets live in
`lib/targets.ts`.
