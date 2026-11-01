#!/usr/bin/env sh
# Stop the nutrition tracker. Mac and Linux.
set -eu

cd "$(dirname "$0")/.."

docker compose down
echo "Stopped."
