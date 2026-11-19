# Sourced by check.sh and start.sh: starts compose.yaml's backing services as plain processes inside a Dev flow worker
# (.devflow/Dockerfile), which has no Docker. Same ports, users and passwords as compose.yaml's defaults, so the tests'
# own settings (playwright.config.ts, apps/api/test/) work unchanged; bound to 127.0.0.1. Every run starts empty in a
# run folder of its own and is stopped by devflow_services_down.

DEVFLOW_SERVICE_PIDS=()
DEVFLOW_POSTGRES_PID=""

# Waits up to 60 seconds for a command to succeed: name, command...
devflow_wait_for() {
  local name="$1" i
  shift
  for i in $(seq 60); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "devflow: $name did not come up within 60 seconds" >&2
  return 1
}

devflow_s3_answers() { curl -s --max-time 2 http://127.0.0.1:8333/ | grep -q '<Error>\|<ListAllMyBucketsResult'; }

# Starts Postgres, SeaweedFS and Mailpit with their data and logs in the given folder, and waits until each answers.
# On a failure, prints the failed service's log.
devflow_services_up() {
  local run="$1"
  mkdir -p "$run/s3"

  printf 'fodr\n' >"$run/pwfile"
  if ! initdb -D "$run/pg" -U fodr --pwfile="$run/pwfile" --auth=scram-sha-256 \
    --locale=C.UTF-8 --locale-provider=icu --icu-locale=sv-SE >"$run/initdb.log" 2>&1; then
    cat "$run/initdb.log" >&2
    return 1
  fi
  postgres -D "$run/pg" -c listen_addresses=127.0.0.1 -p 5432 -k "$run" >"$run/postgres.log" 2>&1 &
  DEVFLOW_POSTGRES_PID=$!

  printf '{"identities":[{"name":"fodr","credentials":[{"accessKey":"fodr","secretKey":"fodr-dev-secret"}],"actions":["Admin","Read","Write","List","Tagging"]}]}' \
    >"$run/s3.json"
  weed server -dir="$run/s3" -ip=127.0.0.1 -ip.bind=127.0.0.1 -s3 -s3.port=8333 -s3.config="$run/s3.json" \
    -volume.max=64 -master.volumeSizeLimitMB=256 >"$run/s3.log" 2>&1 &
  DEVFLOW_SERVICE_PIDS+=($!)

  mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 >"$run/mailpit.log" 2>&1 &
  DEVFLOW_SERVICE_PIDS+=($!)

  devflow_wait_for postgres pg_isready -h 127.0.0.1 -p 5432 -U fodr || { cat "$run/postgres.log" >&2; return 1; }
  PGPASSWORD=fodr createdb -h 127.0.0.1 -p 5432 -U fodr fodr || { cat "$run/postgres.log" >&2; return 1; }
  devflow_wait_for seaweedfs devflow_s3_answers || { tail -n 50 "$run/s3.log" >&2; return 1; }
  devflow_wait_for mailpit curl -sf --max-time 2 http://127.0.0.1:8025/api/v1/info || { cat "$run/mailpit.log" >&2; return 1; }
  echo "devflow: postgres, seaweedfs and mailpit are up"
}

# Stops what devflow_services_up started: Postgres with a fast shutdown, the others with SIGTERM.
devflow_services_down() {
  [ -n "$DEVFLOW_POSTGRES_PID" ] && kill -INT "$DEVFLOW_POSTGRES_PID" 2>/dev/null
  [ "${#DEVFLOW_SERVICE_PIDS[@]}" -gt 0 ] && kill -TERM "${DEVFLOW_SERVICE_PIDS[@]}" 2>/dev/null
  wait 2>/dev/null
  return 0
}
