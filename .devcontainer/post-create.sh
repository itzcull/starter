#!/usr/bin/env bash
set -euo pipefail

corepack enable
corepack prepare pnpm@10.32.1 --activate

pnpm config set store-dir /home/node/.local/share/pnpm/store

pnpm install

pnpm exec playwright install --with-deps

docker version >/dev/null
docker compose -f /workspace/docker-compose.yml up -d --wait
