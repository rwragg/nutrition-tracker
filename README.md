# Nutrition Tracker

An MVP built to a written brief: a food log you can keep for more than one day. A Next.js 16 frontend
and a FastAPI backend in one container, with the data in SQLite.

- The brief: [`AGENTS.md`](AGENTS.md)
- The live plan, the phases and the decisions taken: [`docs/PLAN.md`](docs/PLAN.md)
- The database approach: [`docs/DATABASE.md`](docs/DATABASE.md)
- The app: [`frontend/`](frontend) - see [`frontend/README.md`](frontend/README.md) for how to run it

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

Nothing is saved yet: the app still keeps its data in the browser and resets on reload. The API and the
database are both built and tested - the frontend moves onto them in Part 7 of the plan.

## Running the whole stack

One container: FastAPI serves the frontend at `/`, owns the API, and keeps a SQLite database at
`/data/nutrition.db` in a named volume, so it survives a rebuild.

```bash
./scripts/start.sh    # builds and starts; exits 0 once the health check answers
./scripts/stop.sh     # stops it
```

On Windows, `scripts\start.bat` and `scripts\stop.bat`. The app is then at http://localhost:8000/, and
you sign in with `user` / `password`. The API is documented in [`backend/AGENTS.md`](backend/AGENTS.md).

## Tests

```bash
cd backend && uv run pytest          # 74 tests: routes, schema, guards, isolation, and the container
cd frontend && npm install
npm test                             # 59 unit and component tests
npm run test:e2e                     # 19 Playwright tests, against the container on :8000
npm run lint
```

The backend's container tests, and the Playwright suite, both exercise the built image rather than a
development server: they bring the stack up themselves and check the app that the container actually
serves. The browser tests compute their expected figures from the app's own pure functions, and the
backend tests compute theirs from the raw records, so a failure means two implementations disagree.

**One known flake:** the Playwright suite runs `fullyParallel` with unbounded workers against a single
container, and on a loaded machine one test in a run can time out waiting for the first render (the
default 5s expectation) - it is a different test each time, and it passes 19/19 with `--workers=1`. Bound
the workers or raise that first expectation when Part 7 reworks the suite.
