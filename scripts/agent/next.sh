#!/usr/bin/env bash
# Proposes the next ticket from the "Fodr" board, for `/pick-up-ticket` without a number.
#
#   bash scripts/agent/next.sh
#
# Prints four sections: "In flight" (In Progress or In Review), "Proposal" (one ticket),
# "Alternatives" (up to two) and "Skipped" (tickets ranked before the proposal that wait for an
# open dependency, with the blocker). The order rule is in docs/agent-workflow.md, "Choosing the
# next ticket"; change it there and here together. Nothing is written; the order comes only from
# the issues (milestone, slice ID in the title, type label, "Depends on") and the board status.
# Exit codes: 0 ok, 1 GitHub API error.
set -euo pipefail

OWNER="Adamniels"
REPO_NAME="fodr-hackathon"
PROJECT_NUMBER=6

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

gh issue list --repo "$OWNER/$REPO_NAME" --state all --limit 1000 \
  --json number,state,title,body,labels,milestone > "$tmp/issues.json"
# With --paginate, gh prints one JSON document per page; jq --slurpfile reads them all.
gh api graphql --paginate \
  -f query="query(\$endCursor:String){user(login:\"$OWNER\"){projectV2(number:$PROJECT_NUMBER){items(first:100,after:\$endCursor){pageInfo{hasNextPage endCursor} nodes{content{... on Issue{number}} fieldValueByName(name:\"Status\"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}" \
  > "$tmp/board.json"

jq -r -n --slurpfile issues "$tmp/issues.json" --slurpfile pages "$tmp/board.json" '
  ($issues[0]) as $all
  | ([$pages[] | .data.user.projectV2.items.nodes[] | select(.content.number != null)
      | {key: (.content.number | tostring), value: (.fieldValueByName.name // "none")}] | from_entries) as $status
  | ([$all[] | {key: (.number | tostring), value: .state}] | from_entries) as $state

  # Lines under "### Depends on", up to the next heading. "None" and "Note" lines are ignored; a line
  # with #N references depends on those issues; any other text is a dependency written in words.
  | def deps:
      (.body // "" | gsub("\r"; "") | split("\n")) as $l
      | ([$l | to_entries[] | select(.value | test("^#+\\s*depends on"; "i")) | .key] | first) as $k
      | if $k == null then [] else
          ($l[$k + 1:]) as $r
          | ([range(0; $r | length) | select($r[.] | test("^#"))] | first // ($r | length)) as $e
          | [$r[:$e][] | select(test("\\S")) | sub("^\\s*[-*]\\s*"; "") | select(test("^(none|note)\\b"; "i") | not)]
        end;
    def blockers:
      [deps[] | if test("#[0-9]+") then
          ([scan("#([0-9]+)")[0]][] | select($state[.] != "CLOSED")
            | "#\(.) (\(if $state[.] == null then "not found" else "open" end))")
        else "\"\(.)\" (dependency in words)" end];
    def slice: (.title | capture("^\\[M(?<m>[0-9]+)-(?<s>[0-9]+)\\]")? // null);
    def mrank: if .milestone == null then 9999 else ((.milestone.title | capture("^M(?<k>[0-9]+)").k | tonumber)? // 998) end;
    def fix: any(.labels[]; .name == "type:fix");
    def group: if slice != null then 1 elif fix then 0 else 2 end;
    def reason:
      if .milestone == null then "backlog, no milestone; never proposed first"
      elif group == 0 then "\(.milestone.title); fix without slice ID, ranks before the milestone'"'"'s next slice"
      elif group == 1 then "\(.milestone.title); slice M\(slice.m)-\(slice.s), next in slice order"
      else "\(.milestone.title); no slice ID, after the milestone'"'"'s slices" end;
    def line: "  #\(.number) \(.title) (\(reason))";
    def lines: if length == 0 then "  none" else .[] end;

  [$all[] | select(.state == "OPEN") | . + {status: ($status[.number | tostring] // "none")}
    | select(.status != "Done")] as $open
  | [$open[] | select(.status == "In Progress" or .status == "In Review")] as $inflight
  | [$open[] | select(.status != "In Progress" and .status != "In Review")
      | . + {key: [mrank, group, ((slice.s // "0") | tonumber), .number], blockers: blockers}]
    | sort_by(.key) as $ranked
  | [$ranked[] | select(.blockers == [])] as $free
  | [$free[] | select(.milestone != null)] as $planned
  | [$free[] | select(.milestone == null)] as $backlog
  | ($planned[0] // $backlog[0]) as $proposal
  | (if $proposal == null then []
     elif $proposal.milestone == null then $backlog[1:3]
     else [$planned[1], ($backlog[0] // $planned[2])] | map(select(. != null)) end) as $alternatives
  | [$ranked[] | select(.blockers != [] and ($proposal == null or .key < $proposal.key))] as $skipped

  | "In flight:", ($inflight | sort_by(.number) | map("  #\(.number) \(.status): \(.title)") | lines),
    "Proposal:", ([$proposal | select(. != null) | line] | lines),
    "Alternatives:", ($alternatives | map(line) | lines),
    "Skipped:", ($skipped | map("  #\(.number) \(.title): waits for \(.blockers | join(", "))") | lines),
    "Blocked further down the order: \([$ranked[] | select(.blockers != [])] | length - ($skipped | length))"
'
