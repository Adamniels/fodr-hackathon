#!/usr/bin/env bash
# Dev flow's check for Fodr (.devflow/project.json): everything CI runs but the image build and the eval, inside a Dev
# flow worker (.devflow/Dockerfile), with the backing services started as processes (services.sh) instead of compose.
# The worker runs it from the root of a card's copy as its agent user, with only HOME, PATH, LANG and CI=true set, for at
# most 30 minutes; an agent on a card runs it too, to see what the worker will see. Outside a worker, use the commands
# in .claude/CLAUDE.md instead.
#   bash scripts/devflow/check.sh
# Exit code 0 when every step passed; otherwise the first failed step's.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/devflow/env.sh
source scripts/devflow/services.sh

run="$(mktemp -d)"
trap 'devflow_services_down; rm -rf "$run"' EXIT

step() {
  echo "== $*"
  "$@"
}

step npm ci
devflow_check_playwright
step npm run format:check
step npm run lint
step npm run typecheck
step npm test
step npm run test:scripts
devflow_services_up "$run"
step npm run test:integration
# Two Playwright workers, not the default of half the CPUs: a worker's container has 2 GB, and four Chromiums beside the
# services ran it out of memory (measured on the Mac mini: peak at the limit, one process killed, tests timing out).
step npm run test:e2e -- --workers=2
echo "devflow: the check passed"
