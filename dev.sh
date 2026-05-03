#!/usr/bin/env bash
set -euo pipefail

# Copy .env if missing
if [ ! -f packages/server/.env ]; then
  cp .env.example packages/server/.env
  echo "Created packages/server/.env from .env.example — edit before production use"
fi

# Install all workspace dependencies
npm install

# Run backend + two frontends concurrently with coloured output
npx concurrently \
  --names "SERVER,ADMIN,GAME" \
  --prefix-colors "cyan,magenta,yellow" \
  --kill-others-on-fail \
  "npm run dev -w packages/server" \
  "npm run dev -w packages/admin" \
  "npm run dev -w packages/game"
