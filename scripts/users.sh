#!/usr/bin/env bash
# Approve who may use the app (Part 14, R67). Runs on the machine, so being on the machine is the authority:
# there is deliberately no web route that changes who may sign in.
#
#   scripts/users.sh list                  every account and its status; says how many are waiting
#   scripts/users.sh approve NAME          a waiting account may sign in
#   scripts/users.sh reject NAME           a waiting account is deleted
#   scripts/users.sh disable NAME          an approved account is switched off, open sessions included
#   scripts/users.sh enable NAME           a disabled account is switched back on
#
# Options:  --project P   the Compose project to act on (default: the live one, from the current directory)
#
# It prints the app's own sentence and exits non-zero when a change is refused. It never prints a password or a
# hash, because the app never gives it one.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project=()

usage() {
  sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --project) [[ -n "${2:-}" ]] || usage; project=(-p "$2"); shift 2 ;;
    -h | --help) usage ;;
    *) echo "users.sh: unknown option $1" >&2; usage ;;
  esac
done

action="${1:-}"
case "$action" in
  list) [[ $# -eq 1 ]] || usage ;;
  approve | reject | disable | enable) [[ $# -eq 2 && -n "${2:-}" ]] || usage ;;
  *) usage ;;
esac

command -v docker >/dev/null 2>&1 || { echo "users.sh: docker is not installed or not on the PATH" >&2; exit 1; }
cd "$here"

# `</dev/null` so docker cannot swallow a terminal's input, and `-T` because this is not an interactive session.
# The `${project[@]+...}` form keeps an empty array from being an error under `set -u` on older bash.
# The status is captured with `|| status=$?`, not read after `if !`: there `$?` is the status of the negation, which is 0,
# and a refused change would then report success.
status=0
docker compose ${project[@]+"${project[@]}"} exec -T backend python -m app.admin "$@" </dev/null || status=$?

# 1 is the app refusing a change and has already said why; anything else is the stack, not the request.
if [[ $status -ne 0 && $status -ne 1 ]]; then
  echo "users.sh: could not reach the backend container (is the stack up?  docker compose ${project[*]:-} up -d)" >&2
fi
exit "$status"
