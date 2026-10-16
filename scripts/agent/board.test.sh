#!/usr/bin/env bash
# Offline tests for board.sh. A fake `gh` on PATH answers canned output (as if --jq had been applied)
# and logs every call, so no test touches GitHub. Run: bash scripts/agent/board.test.sh
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cat > "$tmp/gh" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_GH_LOG"
case "$*" in
  *"projectV2(number"*)
    printf 'PVT_project\tPVTSSF_status\n'
    printf 'opt_todo\tTodo\nopt_prog\tIn Progress\nopt_review\tIn Review\nopt_done\tDone\n' ;;
  *"issue(number"*)
    echo "I_issue"
    if [ "${FAKE_ON_BOARD:-1}" = 1 ]; then printf 'PVTI_item\tTodo\n'; fi ;;
  *addProjectV2ItemById*) echo "PVTI_new" ;;
  *updateProjectV2ItemFieldValue*) echo "PVTI_item" ;;
  *) echo "unexpected gh call: $*" >&2; exit 9 ;;
esac
FAKE
chmod +x "$tmp/gh"
export PATH="$tmp:$PATH" FAKE_GH_LOG="$tmp/log"

pass=0 fail=0
check() { # name, condition result
  if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "ok   $1"; else fail=$((fail + 1)); echo "FAIL $1"; fi
}
run() { : > "$FAKE_GH_LOG"; out="$(bash "$here/board.sh" "$@" 2>&1)"; code=$?; }

run status 7 Blocked
[ "$code" = 2 ] && grep -q 'Todo' <<<"$out" && grep -q 'In Progress' <<<"$out" && grep -q 'In Review' <<<"$out" && grep -q 'Done' <<<"$out" && [ ! -s "$FAKE_GH_LOG" ]
check "rejects unknown status" $?

run status abc Todo
[ "$code" = 2 ] && [ ! -s "$FAKE_GH_LOG" ]
check "rejects non-numeric issue" $?

FAKE_ON_BOARD=1 run status 7 "In Review"
[ "$code" = 0 ] && [ "$out" = "#7: In Review" ] && grep -q 'updateProjectV2ItemFieldValue' "$FAKE_GH_LOG" && grep 'updateProjectV2ItemFieldValue' "$FAKE_GH_LOG" | grep -q 'opt_review' && ! grep -q addProjectV2ItemById "$FAKE_GH_LOG"
check "sets status by option name" $?

FAKE_ON_BOARD=0 run status 7 Todo
add_line=$(grep -n addProjectV2ItemById "$FAKE_GH_LOG" | cut -d: -f1)
upd_line=$(grep -n updateProjectV2ItemFieldValue "$FAKE_GH_LOG" | cut -d: -f1)
[ "$code" = 0 ] && [ -n "$add_line" ] && [ -n "$upd_line" ] && [ "$add_line" -lt "$upd_line" ] && grep 'updateProjectV2ItemFieldValue' "$FAKE_GH_LOG" | grep -q 'PVTI_new'
check "adds missing item" $?

FAKE_ON_BOARD=0 run get 7
[ "$code" = 0 ] && [ "$out" = "none" ]
check "get prints none when not on board" $?

echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
