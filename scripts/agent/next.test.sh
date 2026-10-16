#!/usr/bin/env bash
# Offline tests for next.sh. A fake `gh` on PATH serves fixture JSON for the issue list and the
# board query, so no test touches GitHub. Run: bash scripts/agent/next.test.sh
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cat > "$tmp/gh" <<'FAKE'
#!/usr/bin/env bash
[ "${FAKE_FAIL:-0}" = 1 ] && { echo "HTTP 502" >&2; exit 1; }
case "$*" in
  "issue list"*) cat "$FAKE_ISSUES" ;;
  "api graphql"*) cat "$FAKE_BOARD" ;;
  *) echo "unexpected gh call: $*" >&2; exit 9 ;;
esac
FAKE
chmod +x "$tmp/gh"
export PATH="$tmp:$PATH" FAKE_ISSUES="$tmp/issues.json" FAKE_BOARD="$tmp/board.json"

# Fixture builders. issue <number> <OPEN|CLOSED> <milestone or ""> <label> <title> [<depends-on lines>]
# board <number>:<status> ...  (one page; "none" adds the item without a status)
# BOARD_REPO sets the repository of the items board adds (default: this repository).
reset() { echo '[]' > "$FAKE_ISSUES"; printf '%s' '{"data":{"user":{"projectV2":{"items":{"pageInfo":{"hasNextPage":false,"endCursor":null},"nodes":[]}}}}}' > "$FAKE_BOARD"; }
issue() {
  local body="### Goal

Something."
  [ -n "${6:-}" ] && body="$body

### Depends on

$6

### References

- docs/roadmap.md"
  jq --argjson n "$1" --arg s "$2" --arg m "$3" --arg l "$4" --arg t "$5" --arg b "$body" \
    '. + [{number: $n, state: $s, title: $t, body: $b, labels: [{name: $l}], milestone: (if $m == "" then null else {title: $m} end)}]' \
    "$FAKE_ISSUES" > "$tmp/i" && mv "$tmp/i" "$FAKE_ISSUES"
}
board() {
  local pair
  for pair in "$@"; do
    jq --argjson n "${pair%%:*}" --arg s "${pair#*:}" --arg r "${BOARD_REPO:-Adamniels/fodr-hackathon}" \
      '.data.user.projectV2.items.nodes += [{content: {number: $n, repository: {nameWithOwner: $r}}, fieldValueByName: (if $s == "none" then null else {name: $s} end)}]' \
      "$FAKE_BOARD" > "$tmp/b" && mv "$tmp/b" "$FAKE_BOARD"
  done
}

pass=0 fail=0
check() { # name, condition result
  if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "ok   $1"; else fail=$((fail + 1)); echo "FAIL $1"; echo "$out" | sed 's/^/     | /'; fi
}
run() { out="$(bash "$here/next.sh" 2>&1)"; code=$?; }
# Lines of one section ("In flight", "Proposal", "Alternatives", "Skipped"), without the heading.
section() { awk -v h="$1:" '$0 == h { on = 1; next } /^[^ ]/ { on = 0 } on' <<<"$out"; }

M1="M1 Domain hardening" M2="M2 Backend foundation"

reset
issue 6 OPEN "$M1" type:chore "[M1-01] chore: harden the e2e harness" "- #20 [M2-01]"
issue 8 OPEN "$M1" type:refactor "[M1-03] refactor: workspaces"
issue 20 OPEN "$M2" type:chore "[M2-01] chore: docker compose"
board 6:Todo 8:Todo 20:Todo
run
[ "$code" = 0 ] && section Proposal | grep -q '^  #8 ' && ! section Proposal | grep -q '#6 ' && ! section Alternatives | grep -q '#6 ' \
  && section Skipped | grep '#6 ' | grep -q 'waits for #20 (open)'
check "a blocked ticket is never proposed and its blocker is named" $?

reset
issue 6 OPEN "$M1" type:chore "[M1-01] chore: harden the e2e harness" "- #20 [M2-01]"
issue 8 OPEN "$M1" type:refactor "[M1-03] refactor: workspaces"
issue 20 CLOSED "$M2" type:chore "[M2-01] chore: docker compose"
board 6:Todo 8:Todo 20:Done
run
[ "$code" = 0 ] && section Proposal | grep -q '^  #6 ' && section Alternatives | grep -q '^  #8 ' && ! section Skipped | grep -q '#'
check "closing the dependency changes the proposal" $?

reset
issue 6 OPEN "$M1" type:chore "[M1-01] chore: harden the e2e harness"
issue 50 OPEN "$M1" type:fix "fix: decimal point corrupts the plan"
issue 51 OPEN "$M1" type:chore "chore: tidy something"
board 6:Todo 50:Todo 51:Todo
run
[ "$code" = 0 ] && section Proposal | grep -q '^  #50 ' && section Alternatives | sed -n 1p | grep -q '^  #6 ' \
  && section Alternatives | sed -n 2p | grep -q '^  #51 '
check "a fix without slice ID ranks before the next slice, other non-slice tickets after the slices" $?

reset
issue 3 OPEN "" type:feature "feature: tooling idea"
issue 4 OPEN "" type:chore "chore: another backlog item"
issue 9 OPEN "$M2" type:feature "[M2-02] feature: api skeleton"
issue 10 OPEN "$M1" type:refactor "[M1-05] refactor: i18n"
issue 11 OPEN "$M1" type:refactor "[M1-06] refactor: codes"
board 3:Todo 4:Todo 9:Todo 10:Todo 11:Todo
run
[ "$code" = 0 ] && section Proposal | grep -q '^  #10 ' && section Alternatives | sed -n 1p | grep -q '^  #11 ' \
  && section Alternatives | sed -n 2p | grep -q '^  #3 .*backlog' && [ "$(section Alternatives | wc -l | tr -d ' ')" = 2 ]
check "milestones in order; backlog is only an alternative, the top backlog ticket" $?

reset
issue 3 OPEN "" type:feature "feature: tooling idea"
issue 4 OPEN "" type:chore "chore: another backlog item"
issue 5 OPEN "" type:chore "chore: third backlog item"
board 3:Todo 4:Todo 5:Todo
run
[ "$code" = 0 ] && section Proposal | grep -q '^  #3 ' && section Alternatives | sed -n 1p | grep -q '^  #4 ' \
  && section Alternatives | sed -n 2p | grep -q '^  #5 '
check "with only backlog tickets, the first backlog ticket is proposed" $?

reset
issue 6 OPEN "$M1" type:chore "[M1-01] chore: harden the e2e harness"
issue 47 OPEN "$M1" type:chore "[M1-00] chore: launch" "- all of M5."
board 6:Todo 47:Todo
run
[ "$code" = 0 ] && section Proposal | grep -q '^  #6 ' && section Skipped | grep '#47 ' | grep -q 'all of M5'
check "a dependency written in words counts as blocked" $?

reset
issue 6 OPEN "$M1" type:chore "[M1-01] chore: harden the e2e harness" "- None"
issue 45 OPEN "$M1" type:docs "[M1-02] docs: hosting decision" "- #19 [M2-02]
- Note: none (can start any time after M2-02)."
issue 19 CLOSED "$M2" type:feature "[M2-02] feature: api skeleton"
board 6:Todo 45:Todo 19:Done
run
[ "$code" = 0 ] && section Proposal | grep -q '^  #6 ' && section Alternatives | grep -q '^  #45 ' && ! section Skipped | grep -q '#'
check "\"None\" and \"Note:\" lines under Depends on do not block" $?

reset
issue 5 OPEN "$M1" type:chore "[M1-00] chore: bare reference" "#52"
issue 6 OPEN "$M1" type:chore "[M1-01] chore: note with a reference" "- Note: also waits for #52"
issue 8 OPEN "$M1" type:refactor "[M1-03] refactor: workspaces"
issue 52 OPEN "" type:fix "fix: still open"
board 5:Todo 6:Todo 8:Todo 52:Todo
run
[ "$code" = 0 ] && section Proposal | grep -q '^  #8 ' && section Skipped | grep '#5 ' | grep -q 'waits for #52 (open)' \
  && section Skipped | grep '#6 ' | grep -q 'waits for #52 (open)'
check "a #N line without a bullet, and a Note line with #N, still block" $?

reset
issue 6 OPEN "$M1" type:chore "[M1-01] chore: harden the e2e harness" "- Adamniels/other-repo#52"
issue 52 CLOSED "$M1" type:fix "fix: local 52, closed"
board 6:Todo 52:Done
run
[ "$code" = 0 ] && section Proposal | grep -qx '  none' && section Skipped | grep '#6 ' | grep -q 'other-repo#52'
check "a reference to another repository is not read as a local issue" $?

reset
issue 6 OPEN "$M1" type:chore "[M1-01] chore: harden the e2e harness"
issue 8 OPEN "$M1" type:refactor "[M1-03] refactor: workspaces"
issue 10 OPEN "$M1" type:refactor "[M1-05] refactor: i18n"
board 8:Todo 10:Blocked
BOARD_REPO=Adamniels/other-repo board 6:"In Progress"
run
[ "$code" = 0 ] && section Proposal | grep -q '^  #6 ' && section Alternatives | grep -q '^  #8 ' && ! grep -q '#10 ' <<<"$out" \
  && section "In flight" | grep -qx '  none'
check "board items from another repository are ignored, and a status other than Todo is not a candidate" $?

reset
issue 6 OPEN "$M1" type:chore "[M1-01] chore: harden the e2e harness"
issue 7 OPEN "$M1" type:chore "[M1-00] chore: dependabot"
issue 8 OPEN "$M1" type:refactor "[M1-03] refactor: workspaces"
issue 59 OPEN "" type:feature "feature: next ticket"
issue 60 CLOSED "$M1" type:fix "fix: done already"
issue 61 OPEN "$M1" type:fix "fix: already finished on the board"
board 6:Todo 7:"In Review" 59:"In Progress" 60:Done 61:Done
run
[ "$code" = 0 ] && section "In flight" | grep -q '^  #7 In Review: ' && section "In flight" | grep -q '^  #59 In Progress: ' \
  && section Proposal | grep -q '^  #6 ' && section Alternatives | grep -q '^  #8 ' \
  && ! grep -q '#60 \|#61 ' <<<"$out" && ! section Proposal | grep -q '#7 \|#59 '
check "in-flight tickets are listed first and never proposed; closed and Done tickets are left out" $?

reset
issue 6 OPEN "$M1" type:chore "[M1-01] chore: harden the e2e harness"
issue 8 OPEN "$M1" type:refactor "[M1-03] refactor: workspaces"
board 6:none
run
[ "$code" = 0 ] && section Proposal | grep -q '^  #6 ' && section Alternatives | grep -q '^  #8 ' && section "In flight" | grep -qx '  none'
check "an issue missing from the board or without status counts as Todo" $?

reset
issue 6 OPEN "$M1" type:chore "[M1-01] chore: harden the e2e harness" "- #20 [M2-01]"
board 6:Todo
run
[ "$code" = 0 ] && section Proposal | grep -qx '  none' && section Skipped | grep '#6 ' | grep -q 'waits for #20 (not found)'
check "a dependency on an unknown issue blocks, and an empty proposal says none" $?

reset
FAKE_FAIL=1 run
[ "$code" = 1 ] && grep -q 'HTTP 502' <<<"$out"
check "a GitHub error fails the run instead of proposing from partial data" $?

echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
