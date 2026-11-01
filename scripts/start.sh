#!/usr/bin/env sh
# Start the nutrition tracker. Mac and Linux.
set -eu

cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then
    echo "docker is not reachable." >&2
    echo "Check the daemon is running and that this user can use /var/run/docker.sock." >&2
    exit 1
fi

docker compose up -d --build

echo "Waiting for the health check..."
attempt=0
while [ "$attempt" -lt 60 ]; do
    if curl -sf -o /dev/null http://localhost:8000/api/health; then
        echo "Ready: http://localhost:8000/"
        exit 0
    fi
    attempt=$((attempt + 1))
    sleep 1
done

echo "The container started but never passed its health check. Try: docker compose logs" >&2
exit 1
