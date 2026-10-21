#!/usr/bin/env bash
# Checks that the backing services from compose.yaml answer from the host (ADR 0006): Postgres accepts
# connections on its published port, the S3 endpoint answers with an S3 response, and Mailpit's API and SMTP
# port respond. Run after `docker compose up --wait`, from anywhere in the repository:
#   bash scripts/dev/check-services.sh
# Exit code 0 when all answer. Each probe gives up after 5 seconds.
set -uo pipefail
cd "$(dirname "$0")/../.."

# The ports and names compose.yaml uses: the root .env if present (read, not executed), else the defaults.
setting() { # key, default
  local v=""
  [ -f .env ] && v="$(grep -E "^$1=" .env | tail -n1 | cut -d= -f2-)"
  echo "${v:-$2}"
}
POSTGRES_USER="$(setting POSTGRES_USER fodr)" POSTGRES_DB="$(setting POSTGRES_DB fodr)"
POSTGRES_PORT="$(setting POSTGRES_PORT 5432)" S3_PORT="$(setting S3_PORT 8333)"
SMTP_PORT="$(setting SMTP_PORT 1025)" MAILPIT_UI_PORT="$(setting MAILPIT_UI_PORT 8025)"

fail=0
check() { # name, command...
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "ok   $name"; else echo "FAIL $name"; fail=1; fi
}
# Reads a TCP banner from the host with a timeout: port, expected start of the banner.
banner() { exec 3<>"/dev/tcp/127.0.0.1/$1" && IFS= read -r -t 5 line <&3 && [[ "$line" == "$2"* ]]; }

check "postgres accepts connections" docker compose exec -T postgres pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
check "postgres port reachable from the host" bash -c "exec 3<>/dev/tcp/127.0.0.1/$POSTGRES_PORT"
# An unsigned request gets an S3 error document back, which proves an S3 endpoint is listening.
check "s3 endpoint answers" bash -c "curl -s --max-time 5 http://127.0.0.1:$S3_PORT/ | grep -q '<Error>\|<ListAllMyBucketsResult'"
check "mailpit api answers" curl -sf --max-time 5 "http://127.0.0.1:$MAILPIT_UI_PORT/api/v1/info"
check "mailpit smtp answers" banner "$SMTP_PORT" "220"

exit "$fail"
