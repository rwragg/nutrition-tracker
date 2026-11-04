#!/usr/bin/env bash
# Link a Telegram bot to a THROWAWAY stack: ask for the bot's token, prove it is real, start the bot beside that
# stack, and print the /bind line to send it. Part 12 follow-up, R55 in docs/PLAN.md.
#
#   scripts/link-bot.sh --project nutrition-shots --port 8200 [--user NAME] [--check]
#
# What it will not do, on purpose:
#   - touch the live stack (project "nutrition", port 8000). The live bot is rotated by hand: put the new token in
#     .env with `read -rsp`, then `docker compose --profile bot up -d`.
#   - take a token that another process already polls. Telegram lets ONE process poll a token, so reusing the live
#     bot's, or a Hermes profile's, would silently break that bot. Tokens are compared, never printed.
#   - show, log, store or put a secret on a command line. The token and the password are read hidden; the token reaches
#     curl through its stdin and docker through the environment of that one command; nothing is written to disk.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${NUTRITION_ENV_FILE:-$ROOT/.env}"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
LIVE_PROJECT="nutrition"
LIVE_PORT="8000"
WAIT_TRIES="${LINK_BOT_WAIT:-30}"
POLL_SECONDS="${LINK_BOT_POLL:-1}"

PROJECT=""
PORT=""
USER_NAME=""
CHECK_ONLY=0

usage() {
  cat <<'EOF'
usage: scripts/link-bot.sh --project NAME --port PORT [--user NAME] [--check]

  --project NAME   the throwaway compose project (for example nutrition-shots)
  --port PORT      the port that project's app answers on (for example 8200)
  --user NAME      the app account to mint the pairing code for (asked if omitted)
  --check          verify the token and the stack, then stop: nothing is started
EOF
}

die() {
  echo "link-bot: $*" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --user) USER_NAME="${2:-}"; shift 2 ;;
    --check) CHECK_ONLY=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

[ -n "$PROJECT" ] && [ -n "$PORT" ] || { usage >&2; exit 2; }
[ "$PROJECT" != "$LIVE_PROJECT" ] || die "refusing the live project '$LIVE_PROJECT'. Rotate the live bot by hand (see the header of this file)."
[[ "$PORT" =~ ^[0-9]+$ ]] || die "the port must be a number"
[ "$PORT" != "$LIVE_PORT" ] || die "port $LIVE_PORT is the live app. Use the throwaway stack's port."
[ -f "$ENV_FILE" ] || die "no environment file at $ENV_FILE"

env_value() { # value of KEY in the environment file, quotes removed; empty if absent
  grep -E "^[[:space:]]*$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//' || true
}

[ -n "$(env_value TELEGRAM_BOT_SECRET)" ] || die "TELEGRAM_BOT_SECRET is empty in $ENV_FILE: the bot and the app share it, and the bot refuses to start without it."
[ -n "$(env_value TELEGRAM_ALLOWED_USERS)" ] || die "TELEGRAM_ALLOWED_USERS is empty in $ENV_FILE: the bot answers nobody without it."

BASE="http://127.0.0.1:$PORT"
health="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$BASE/api/health" || true)"
[ "$health" = "200" ] || die "nothing healthy answers on $BASE (got '${health:-none}'). Start the throwaway stack first: NUTRITION_PORT=$PORT docker compose -p $PROJECT up --build --wait"

JAR=""
cleanup() {
  [ -z "$JAR" ] || rm -f "$JAR"
  unset TOKEN PASSWORD body 2>/dev/null || true
}
trap cleanup EXIT

# ---- 1. the token: hidden, shaped, then proved real by Telegram ------------------------------------------------
printf 'Bot token from BotFather (hidden): ' >&2
IFS= read -rs TOKEN || die "no token entered"
printf '\n' >&2
TOKEN="${TOKEN//[[:space:]]/}"

[[ "$TOKEN" =~ ^[0-9]{6,12}:[A-Za-z0-9_-]{30,}$ ]] || die "that does not look like a bot token (digits, a colon, then about 35 characters). Nothing was sent anywhere."

for file in "$ENV_FILE" "$HERMES_HOME/.env" "$HERMES_HOME"/profiles/*/.env; do
  [ -f "$file" ] || continue
  other="$(grep -E '^[[:space:]]*TELEGRAM_BOT_TOKEN=' "$file" | head -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//' || true)"
  if [ -n "$other" ] && [ "$other" = "$TOKEN" ]; then
    die "that token is already in use by a bot configured in $file. A token can be polled by one process only, so using it here would break that bot. Make a new bot with BotFather."
  fi
done

reply="$(printf 'url = "https://api.telegram.org/bot%s/getMe"\n' "$TOKEN" | curl -sS -m 15 -K - 2>/dev/null || true)"
BOT_NAME="$(printf '%s' "$reply" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except ValueError:
    sys.exit(0)
if data.get("ok"):
    print(data["result"].get("username", ""))
' 2>/dev/null || true)"
[ -n "$BOT_NAME" ] || die "Telegram did not accept that token (or could not be reached). Check it with BotFather. Nothing was started."

echo "Verified: @$BOT_NAME (the token was not shown or stored)."
if [ "$CHECK_ONLY" = "1" ]; then
  echo "--check: nothing was started."
  exit 0
fi

# ---- 2. start the bot beside the throwaway stack, and only the bot ----------------------------------------------
# --no-deps so the backend is never recreated (its port mapping would differ from the one it runs with), and
# NUTRITION_PORT so compose reads the same configuration the stack was started with.
(
  cd "$ROOT"
  TELEGRAM_BOT_TOKEN="$TOKEN" NUTRITION_PORT="$PORT" \
    docker compose --env-file "$ENV_FILE" -p "$PROJECT" --profile bot up -d --no-deps --force-recreate bot
) >/dev/null 2>&1 </dev/null || die "docker could not start the bot for project '$PROJECT'."

listening=0
for ((i = 0; i < WAIT_TRIES; i++)); do
  logs="$(cd "$ROOT" && docker compose --env-file "$ENV_FILE" -p "$PROJECT" --profile bot logs --no-color --tail 30 bot 2>&1 </dev/null || true)"
  if printf '%s' "$logs" | grep -q "listening"; then
    listening=1
    break
  fi
  sleep "$POLL_SECONDS"
done
if [ "$listening" != "1" ]; then
  echo "link-bot: the bot did not report 'listening'. Its last log lines:" >&2
  printf '%s\n' "$logs" | tail -8 >&2
  die "stopped. The bot container is left as it is for you to look at."
fi
echo "The bot is running and listening, attached to project '$PROJECT'."

# ---- 3. the bind: sign in as the app account and mint a pairing code -------------------------------------------
if [ -z "$USER_NAME" ]; then
  printf 'App username to link (the account on %s): ' "$BASE" >&2
  IFS= read -r USER_NAME || true
fi
printf 'Password for %s (hidden): ' "${USER_NAME:-that account}" >&2
IFS= read -rs PASSWORD || true
printf '\n' >&2

by_hand="In the app at $BASE: sign in, press Telegram, Get a code, then send  /bind CODE  to @$BOT_NAME."
[ -n "$USER_NAME" ] && [ -n "$PASSWORD" ] || { echo "No sign-in given, so no code was minted. $by_hand"; exit 0; }

JAR="$(mktemp)"
body="$(printf '%s' "$PASSWORD" | python3 -c '
import json, sys
print(json.dumps({"username": sys.argv[1], "password": sys.stdin.read()}))
' "$USER_NAME")"
login="$(printf '%s' "$body" | curl -s -o /dev/null -w '%{http_code}' -m 10 -c "$JAR" -H 'Content-Type: application/json' --data-binary @- "$BASE/api/login" || true)"
unset PASSWORD body
if [ "$login" != "200" ]; then
  echo "Could not sign in as '$USER_NAME' (HTTP ${login:-none}). The bot is running. $by_hand"
  exit 0
fi

minted="$(curl -s -m 10 -b "$JAR" -X POST "$BASE/api/telegram/code" || true)"
CODE="$(printf '%s' "$minted" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except ValueError:
    sys.exit(0)
print(data.get("code", ""))
' 2>/dev/null || true)"
EXPIRES="$(printf '%s' "$minted" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("expires", ""))
except ValueError:
    pass
' 2>/dev/null || true)"
[ -n "$CODE" ] || { echo "Signed in, but the app gave no code. The bot is running. $by_hand"; exit 0; }

cat <<EOF

Send this to @$BOT_NAME  (the code expires ${EXPIRES:+at $EXPIRES, about 15 minutes out}):

    /bind $CODE

Then try:  /today     /log oats 1 cup
An account with no profile is refused with "set up your profile before adding anything. Nothing was logged."

Stop the bot when you are done (it is only attached to '$PROJECT'):
    docker compose -p $PROJECT --profile bot stop bot
EOF
