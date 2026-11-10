#!/usr/bin/env bash
#
# Start (or restart) a local MongoDB single-node replica set in Docker for dev
# and tests.
#
#   ./scripts/mongo-dev.sh          # start / ensure running
#   ./scripts/mongo-dev.sh stop     # stop and remove the container
#
# Connection string (already in .env.example):
#   mongodb://127.0.0.1:27017/koya_booking?replicaSet=rs0

set -euo pipefail

CONTAINER=koya-booking-mongo
IMAGE=mongo:7
PORT=27017

if [ "${1:-}" = "stop" ]; then
  docker rm -f "$CONTAINER" >/dev/null 2>&1 && echo "Removed $CONTAINER" || echo "$CONTAINER not running"
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon isn't running. Start Docker Desktop first (open -a Docker)." >&2
  exit 1
fi

if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" = "true" ]; then
  echo "$CONTAINER already running on :$PORT"
  exit 0
fi

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -p "$PORT:27017" "$IMAGE" --replSet rs0 --bind_ip_all >/dev/null

echo "Waiting for mongod..."
until docker exec "$CONTAINER" mongosh --quiet --eval "db.adminCommand('ping')" >/dev/null 2>&1; do
  sleep 1
done

docker exec "$CONTAINER" mongosh --quiet --eval \
  "try { rs.status() } catch (e) { rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] }) }" >/dev/null

echo "MongoDB running: mongodb://127.0.0.1:$PORT/koya_booking?replicaSet=rs0"
