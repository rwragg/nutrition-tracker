# Scripts

Start and stop the stack, on all three platforms. Part 2 of `docs/PLAN.md`.

- `start.sh` / `stop.sh` - Mac and Linux
- `start.bat` / `stop.bat` - Windows

Both start scripts run `docker compose up -d --build` from the project root and then wait for
`/api/health` to answer, so a script that exits 0 means the app is actually serving, not merely that a
container was created. Both stop scripts run `docker compose down`.

If docker is not reachable, they say so and exit non-zero rather than failing silently, because the
usual cause is the daemon or socket permissions rather than the project.
