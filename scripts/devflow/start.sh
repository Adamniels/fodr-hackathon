#!/usr/bin/env bash
# Dev flow's start for Fodr (.devflow/project.json): brings Fodr up inside a Dev flow worker (.devflow/Dockerfile) so the
# worker can take screenshots of the pages a card changed, signed in as the demo account, with no login page between.
# The worker runs it from the root of a clean copy of the pushed commit, with DEVFLOW=1, waits for http://localhost:5173
# and ends the whole process group afterwards. Refuses to run without DEVFLOW=1; the signed-in server it starts
# (apps/api/test/devflow-server.ts) refuses too, and is never part of the production image.
#   DEVFLOW=1 bash scripts/devflow/start.sh
set -euo pipefail
if [ "${DEVFLOW:-}" != 1 ]; then
  echo "devflow: start.sh signs every request in as the demo account and runs only in a Dev flow worker (DEVFLOW=1)" >&2
  exit 1
fi
cd "$(dirname "$0")/../.."
source scripts/devflow/env.sh
source scripts/devflow/services.sh

run="$(mktemp -d)"
trap 'devflow_services_down; rm -rf "$run"' EXIT
trap 'exit 143' TERM INT

npm ci
devflow_services_up "$run"

# The API's settings, as the e2e run's in apps/web/playwright.config.ts, but on the development ports. Dev-only values.
export DATABASE_URL=postgres://fodr:fodr@127.0.0.1:5432/fodr
export PORT=3000
export LOG_LEVEL=warn
export BETTER_AUTH_SECRET=devflow-only-secret-of-at-least-32-characters
export BETTER_AUTH_URL=http://localhost:5173
export SMTP_HOST=127.0.0.1 SMTP_PORT=1025 MAIL_FROM='Fodr <no-reply@fodr.test>'
export S3_ENDPOINT=http://127.0.0.1:8333 S3_BUCKET=fodr S3_ACCESS_KEY_ID=fodr S3_SECRET_ACCESS_KEY=fodr-dev-secret
export S3_CREATE_BUCKET=true
export AI_DAILY_CALLS_PER_USER=30 AI_PRICE_SEK_PER_MTOK_INPUT=30 AI_PRICE_SEK_PER_MTOK_OUTPUT=150
# The demo account with Sixten and Pysen, the one .env.example names.
export SEED_EMAIL=demo@fodr.local SEED_PASSWORD=demo-losenord-123

npm run db:migrate
# The API refuses to start without a product catalogue (#35).
npm run products:import
npm run seed

node --import tsx apps/api/test/devflow-server.ts &
(cd apps/web && API_PORT=3000 exec npm run dev -- --port 5173 --strictPort) &
# Either ending ends the start, and the trap stops the rest.
wait -n
