#!/bin/sh
set -e

envoy --mode validate -c /etc/envoy/envoy.yaml

envoy -c /etc/envoy/envoy.yaml --log-level "${ENVOY_LOG_LEVEL:-warning}" &

sleep 2

for i in 1 2 3 4 5; do
  bunx drizzle-kit push --force && break
  sleep 3
done

exec bun run src/server.ts
