# Nutrition Tracker

A one-day meal log. Client-rendered Next.js app, no persistence and no user accounts:
the app opens with a populated sample day and resets on reload.

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
npm test             # unit tests (Vitest + Testing Library)
npm run test:e2e     # end-to-end tests (Playwright, serves the production build on :3100)
npm run lint
```

## What it does

- Four sections - breakfast, lunch, dinner, snacks - each with a calorie subtotal.
- Add either a single ingredient with a quantity, or a whole meal from the template list.
- Meals expand to show the ingredients they are made of.
- Remove any entry; the day total and macro bars follow.

## Layout

```
app/          page shell and global theme (palette in app/globals.css)
components/   UI: day summary, section cards, entry rows, add dialogs
lib/          types, ingredient catalogue, meal templates, sample day, macro maths
e2e/          Playwright specs
```
