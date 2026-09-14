#!/usr/bin/env bash
# Pull the latest code and restart. Run from anywhere on the server:
#   bash ~/verdict/deploy/update.sh
set -euo pipefail
cd "$HOME/verdict"
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
