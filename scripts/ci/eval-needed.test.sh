#!/usr/bin/env bash
# Offline tests for eval-needed.sh: which changed files make CI run the extraction eval (#34).
# Run: bash scripts/ci/eval-needed.test.sh
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
pass=0 fail=0
check() { # name, expected (true|false), changed files...
  local name="$1" want="$2"
  shift 2
  out="$(printf '%s\n' "$@" | bash "$here/eval-needed.sh" 2>&1)"
  if [ "$out" = "$want" ]; then pass=$((pass + 1)); echo "ok   $name"; else fail=$((fail + 1)); echo "FAIL $name: got '$out', want '$want'"; fi
}

check "a prompt or schema change runs it" true apps/api/src/ai/anthropic.ts
check "a provider interface change runs it" true apps/api/src/ai/provider.ts
check "a change to the scoring runs it" true apps/api/src/ai/eval.ts
check "a change to the model default runs it" true apps/api/src/config.ts
check "a change to the eval script runs it" true apps/api/scripts/evaluate-analysis-reading.mjs
check "a change to its command or tsx runs it" true apps/api/package.json
check "a change to its test data runs it" true testdata/Testdata-from-other-dev/krubba-testdata-v2/data/facit.json
check "a change to the workflow runs it" true .github/workflows/ci.yml
check "one relevant file among others runs it" true README.md apps/api/src/ai/anthropic.ts apps/web/src/api.ts
check "an unrelated change skips it" false README.md apps/web/src/components/PlanStep.tsx apps/api/src/plans-routes.ts
check "the AI routes and their tests skip it" false apps/api/src/ai/routes.ts apps/api/src/ai/eval.test.ts apps/api/src/ai/anthropic.test.ts
check "other test data skips it" false testdata/Testdata-from-other-dev/hooks-produkter.json
check "a similar name elsewhere skips it" false docs/apps/api/src/ai/anthropic.ts apps/api/src/config.test.ts
check "a longer name skips it" false apps/api/src/config.tsx
check "no changed files skips it" false ""

echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
