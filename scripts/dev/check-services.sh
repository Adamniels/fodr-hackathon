#!/usr/bin/env bash
# Checks that the backing services from compose.yaml answer from the host (ADR 0006): Postgres accepts
# connections, the S3 endpoint answers with an S3 response, and Mailpit's API and SMTP port respond.
# Run after `docker compose up --wait`: bash scripts/dev/check-services.sh. Exit code 0 when all three answer.
set -uo pipefail

# Ports as in compose.yaml, overridable from the root .env.
[ -f .env ] && set -a && . ./.env && set +a
POSTGRES_USER="${POSTGRES_USER:-fodr}" POSTGRES_DB="${POSTGRES_DB:-fodr}"
S3_PORT="${S3_PORT:-8333}" SMTP_PORT="${SMTP_PORT:-1025}" MAILPIT_UI_PORT="${MAILPIT_UI_PORT:-8025}"

fail=0
check() { # name, command...
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "ok   $name"; else echo "FAIL $name"; fail=1; fi
}

check "postgres accepts connections" docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
# An unsigned request gets an S3 error document back, which proves an S3 endpoint is listening.
check "s3 endpoint answers" bash -c "curl -s http://localhost:$S3_PORT/ | grep -q '<Error>\|<ListAllMyBucketsResult'"
check "mailpit api answers" curl -sf "http://localhost:$MAILPIT_UI_PORT/api/v1/info"
check "mailpit smtp port open" bash -c "exec 3<>/dev/tcp/localhost/$SMTP_PORT && head -c 3 <&3 | grep -q 220"

exit "$fail"
