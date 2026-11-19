# Sourced by check.sh and start.sh: the settings a Dev flow worker's container needs (.devflow/Dockerfile). The worker
# runs both with only HOME, PATH, LANG and CI set, so nothing here may come from the container's own environment.

# Postgres' binaries are not on PATH in Debian's packaging.
export PATH="/usr/lib/postgresql/18/bin:$PATH"

# The Chromium the recipe installed for apps/web's Playwright, not the base image's, which fits another version.
export PLAYWRIGHT_BROWSERS_PATH=/opt/fodr-playwright

# Refuses to go on when apps/web's Playwright is not the one the recipe installed browsers for, which would fail every
# e2e test with a missing browser. Call after `npm ci`.
devflow_check_playwright() {
  local want have
  want="$(cat "$PLAYWRIGHT_BROWSERS_PATH/VERSION" 2>/dev/null || echo none)"
  have="$(node -p "require('./node_modules/playwright/package.json').version" 2>/dev/null || echo none)"
  if [ "$want" != "$have" ]; then
    echo "devflow: apps/web uses Playwright $have, but the worker has browsers for $want;" \
      "update the playwright@ version in .devflow/Dockerfile and rebuild the worker" >&2
    return 1
  fi
}
