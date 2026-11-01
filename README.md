# Nutrition Tracker

An MVP built to a written brief: a food log you can keep for more than one day. Client-only
Next.js 16 app, styled with Bootstrap 5, no backend and no persistence - it opens on three seeded
sample days and resets on reload.

- The brief: [`AGENTS.md`](AGENTS.md)
- The plan, phases and the decisions taken: [`PLAN.md`](PLAN.md)
- The app: [`frontend/`](frontend) - see [`frontend/README.md`](frontend/README.md) for how to run it

## What it does

- Three views behind a header switcher: **Day**, **Foods**, **Meals**
- Log a day from individual foods with a quantity, or from a whole meal
- Create, edit and delete foods and meals; a meal is composed from foods
- Move between days and open any one of them to dig into its log
- Total each day against calorie and macronutrient targets
- Deleting a record that a meal or a day still refers to is refused, with the reason

Nothing is saved: the sample data is seeded in memory on load.

## Running the whole stack

One container: FastAPI serves the frontend at `/` and owns the API.

```bash
./scripts/start.sh    # builds and starts; exits 0 once the health check answers
./scripts/stop.sh     # stops it
```

On Windows, `scripts\start.bat` and `scripts\stop.bat`. The app is then at http://localhost:8000/.

## Tests

```bash
cd frontend
npm install
npm test          # unit and component tests (Vitest + Testing Library)
npm run test:e2e  # end-to-end tests (Playwright, serves the production build on :3100)
npm run lint
```

55 unit and component tests, 14 Playwright tests. The browser tests compute their expected figures
from the app's own pure functions, so a failure means the page and the model disagree.
