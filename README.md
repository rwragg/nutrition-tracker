# Nutrition Tracker

An MVP built to a written brief: a food log you can keep for more than one day. Client-only
Next.js 16 app, styled with Bootstrap 5, no backend and no persistence - it opens on three seeded
sample days and resets on reload.

- The brief: [`AGENTS.md`](AGENTS.md)
- The plan, phases and the decisions taken: [`PLAN.md`](PLAN.md)
- The app: [`frontend/`](frontend) - see [`frontend/README.md`](frontend/README.md) for how to run it

## What it does

- Sign in with `user` / `password` (dummy credentials for the MVP), and log out
- Three views behind a header switcher: **Day**, **Foods**, **Meals**
- Log a day from individual foods with a quantity, or from a whole meal
- Create, edit and delete foods and meals; a meal is composed from foods
- Move between days and open any one of them to dig into its log
- Total each day against calorie and macronutrient targets
- Deleting a record that a meal or a day still refers to is refused, with the reason

Nothing is saved yet: the data lives in the browser and resets on reload. The database is in place and
seeded, but the app does not read or write it until the parts that rewire the frontend onto the API.

## Running the whole stack

One container: FastAPI serves the frontend at `/`, owns the API, and keeps a SQLite database at
`/data/nutrition.db` in a named volume, so it survives a rebuild.

```bash
./scripts/start.sh    # builds and starts; exits 0 once the health check answers
./scripts/stop.sh     # stops it
```

On Windows, `scripts\start.bat` and `scripts\stop.bat`. The app is then at http://localhost:8000/, and
you sign in with `user` / `password`. The database approach is documented in [`docs/DATABASE.md`](docs/DATABASE.md).

## Tests

```bash
cd backend && uv run pytest          # 7 tests: API routes, plus the container tests
cd frontend && npm install
npm test                             # 55 unit and component tests
npm run test:e2e                     # 14 Playwright tests, against the container on :8000
npm run lint
```

The backend's container tests, and the Playwright suite, both exercise the built image rather than a
development server: they bring the stack up themselves and check the app that the container actually
serves. The browser tests compute their expected figures from the app's own pure functions, so a
failure means the page and the model disagree.
