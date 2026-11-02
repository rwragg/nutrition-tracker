#!/usr/bin/env bash
# End-to-end check on the running stack: write through the API, rebuild the container, read the writes
# back, then clean up. This is P7.1 proved on the artifact rather than in a test.
set -euo pipefail

cd "$(dirname "$0")/.."
BASE=http://localhost:8000
J=/tmp/nutrition-e2e.cookies

sign_in() {
  rm -f "$J"
  curl -s -c "$J" -X POST "$BASE/api/login" \
    -H 'Content-Type: application/json' -d '{"username":"user","password":"password"}' >/dev/null
}

api() { curl -s -b "$J" "$@"; }

count_foods() { api "$BASE/api/foods" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))'; }

day_calories() {
  api "$BASE/api/days/$1" |
    python3 -c 'import sys,json; print(json.load(sys.stdin)["macros"]["calories"])'
}

sign_in

# The day the app opens on - the newest one the log holds.
DAY=$(api "$BASE/api/days" | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["date"])')
FOODS_BEFORE=$(count_foods)
CALORIES_BEFORE=$(day_calories "$DAY")

echo "open day: $DAY"
echo "before: $FOODS_BEFORE foods, $CALORIES_BEFORE kcal on $DAY"

FOOD=$(api -X POST "$BASE/api/foods" -H 'Content-Type: application/json' \
  -d '{"name":"Handover marker","unit":"piece","calories":100,"protein":1,"carbs":2,"fat":3}')
FID=$(python3 -c 'import sys,json; print(json.loads(sys.argv[1])["id"])' "$FOOD")

ENTRY=$(api -X POST "$BASE/api/days/$DAY/entries" -H 'Content-Type: application/json' \
  -d "{\"section\":\"snacks\",\"food_id\":\"$FID\",\"quantity\":2}")
EID=$(python3 -c 'import sys,json; print(json.loads(sys.argv[1])["id"])' "$ENTRY")

echo "wrote food $FID and entry $EID; $DAY is now $(day_calories "$DAY") kcal"

cleanup() {
  api -X DELETE "$BASE/api/days/$DAY/entries/$EID" -o /dev/null -w "cleanup: entry %{http_code}, " || true
  api -X DELETE "$BASE/api/foods/$FID" -o /dev/null -w "food %{http_code}\n" || true
}
trap cleanup EXIT

echo "== stop, rebuild the image, start again"
./scripts/stop.sh
docker compose -f docker-compose.yml build >/dev/null
./scripts/start.sh

# A fresh session secret each start signs everyone out, which is the MVP's documented behaviour.
sign_in

FOODS_AFTER=$(count_foods)
echo "after: $FOODS_AFTER foods (expected $((FOODS_BEFORE + 1)) - a re-run seed would give many more)"

api "$BASE/api/days/$DAY" | python3 -c '
import sys, json
day = json.load(sys.stdin)
marker = [e for e in day["sections"]["snacks"] if e.get("foodId") == sys.argv[1]]
print("marker entry survived:", bool(marker))
print("quantity read back:", marker[0]["quantity"] if marker else None)
' "$FID"
