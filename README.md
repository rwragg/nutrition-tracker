# Nutrition Tracker

An MVP built to a written brief: a food log you can keep for more than one day. A Next.js 16 frontend
and a FastAPI backend in one container, with the log stored in SQLite.

- The brief: [`AGENTS.md`](AGENTS.md)
- The live plan, the phases and the decisions taken: [`docs/PLAN.md`](docs/PLAN.md)
- The database approach: [`docs/DATABASE.md`](docs/DATABASE.md)
- The completion report: [`docs/COMPLETION-REPORT.md`](docs/COMPLETION-REPORT.md)
- The app: [`frontend/`](frontend) - see [`frontend/AGENTS.md`](frontend/AGENTS.md) for how it works
- Screenshots: [`docs/screenshots/`](docs/screenshots)

(`PLAN.md` in the project root is the superseded v2 plan, kept for its history. The live plan is the
one in `docs/`.)

## What it does

- Sign in with `user` / `password` (dummy credentials for the MVP), and log out
- Three views behind a header switcher: **Day**, **Foods**, **Meals**
- Log a day from individual foods with a quantity, or from a whole meal
- Create, edit and delete foods and meals; a meal is composed from foods
- Move between days and open any one of them to dig into its log
- Total each day against calorie and macronutrient targets
- Deleting a record that a meal or a day still refers to is refused, with the reason

**The log is kept in the database**, so it is there when you come back, from another browser, and after
the container is rebuilt. The app reads every view from the API - there is no sample data in the
frontend, and nothing is held in the browser beyond what was last read from the server.

## Running the whole stack

One container: FastAPI serves the frontend at `/`, owns the API, and keeps a SQLite database at
`/data/nutrition.db` in a named volume, so it survives a rebuild.

```bash
./scripts/start.sh    # builds and starts; exits 0 once the health check answers
./scripts/stop.sh     # stops it
```

On Windows, `scripts\start.bat` and `scripts\stop.bat`. The app is then at http://localhost:8000/, and
you sign in with `user` / `password`. The first run seeds a sample log, once, into the empty database.
The API is documented in [`backend/AGENTS.md`](backend/AGENTS.md).

## Tests

```bash
cd backend && uv run pytest          # 80 tests: routes, schema, guards, isolation, and the container
cd frontend && npm install
npm test                             # 74 unit and component tests
npm run test:e2e                     # 22 Playwright tests, against its own container on :8100
npm run lint
```

The backend's container tests, and the Playwright suite, both exercise the built image rather than a
development server. The browser suite builds a **stack of its own** - its own compose project, volume
and port, thrown away and rebuilt before every run - so it always starts from a freshly seeded database
and never touches the one you are using. It runs one worker, because its tests share that database.

A run can fail rarely on a browser-level `net::ERR_NETWORK_CHANGED` console error, which the suite's
"no console errors" assertion counts and which has nothing to do with the app; a rerun is the remedy.
See `docs/COMPLETION-REPORT.md` for the evidence.

Expected figures come from two sides on purpose: the page's own arithmetic is asserted against the same
calculations run over what the API returned, and the figures the server reports are asserted against the
server's numbers. Comparing the two to each other would turn a float's summation order into a failure.

