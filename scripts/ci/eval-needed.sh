#!/usr/bin/env bash
# Whether a change needs the extraction eval (#34): reads changed file paths, one per line, on stdin, and prints true
# when one of them is what the eval checks (the prompts and schemas, the provider interface, the scoring, the model
# default, the eval script, its command and tsx version in apps/api/package.json, or its test data) or the workflow that
# runs it; false otherwise. CI's ai-changes job
# feeds it `git diff --name-only` against the PR's base. Tested by eval-needed.test.sh.
set -euo pipefail

relevant='^(apps/api/src/ai/(anthropic|provider|eval)\.ts|apps/api/src/config\.ts|apps/api/scripts/evaluate-analysis-reading\.mjs|apps/api/package\.json|testdata/Testdata-from-other-dev/krubba-testdata-v2/.+|\.github/workflows/ci\.yml)$'
if grep -qE "$relevant"; then echo true; else echo false; fi
