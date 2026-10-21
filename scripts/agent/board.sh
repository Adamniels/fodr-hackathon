#!/usr/bin/env bash
# Moves an issue on the "Fodr" project board, or reads its status.
#
#   bash scripts/agent/board.sh status <issue-number> <Todo|In Progress|In Review|Done>
#   bash scripts/agent/board.sh get <issue-number>        # the status, "no status", "archived" or "none"
#
# Project, field and option IDs are looked up by name on every run, so renamed or added
# statuses work without editing this file. An issue missing from the board is added first.
# An archived item is never changed: unarchive it on the board first.
# Exit codes: 0 ok, 1 GitHub API error or archived item, 2 usage error.
set -euo pipefail

OWNER="Adamniels"
REPO_NAME="fodr-hackathon"
PROJECT_NUMBER=6
STATUSES=("Todo" "In Progress" "In Review" "Done")

usage() {
  echo "usage: board.sh status <issue-number> <status> | board.sh get <issue-number>" >&2
  printf 'valid statuses: %s\n' "$(IFS=,; echo "${STATUSES[*]}" | sed 's/,/, /g')" >&2
  exit 2
}

[ $# -ge 2 ] || usage
cmd="$1" issue="$2"
[[ "$issue" =~ ^[1-9][0-9]*$ ]] || { echo "issue must be a number without leading zeros: $issue" >&2; usage; }
case "$cmd" in
  get) [ $# -eq 2 ] || usage ;;
  status)
    [ $# -eq 3 ] || usage
    wanted="$3" valid=0
    for s in "${STATUSES[@]}"; do [ "$s" = "$wanted" ] && valid=1; done
    [ "$valid" = 1 ] || { echo "unknown status: $wanted" >&2; usage; } ;;
  *) usage ;;
esac

# Line 1: project ID <tab> Status field ID; following lines: option ID <tab> option name.
project_info="$(gh api graphql \
  -f query="query{user(login:\"$OWNER\"){projectV2(number:$PROJECT_NUMBER){id field(name:\"Status\"){... on ProjectV2SingleSelectField{id options{id name}}}}}}" \
  --jq '.data.user.projectV2 as $p | ([$p.id, $p.field.id] | @tsv), ($p.field.options[] | [.id, .name] | @tsv)')"
project_id="$(head -n1 <<<"$project_info" | cut -f1)"
field_id="$(head -n1 <<<"$project_info" | cut -f2)"

# Line 1: issue node ID; then one line per item on this board: item ID <tab> status <tab> archived (true/false).
issue_info="$(gh api graphql \
  -f query="query{repository(owner:\"$OWNER\",name:\"$REPO_NAME\"){issue(number:$issue){id projectItems(first:20,includeArchived:true){nodes{id isArchived project{id} fieldValueByName(name:\"Status\"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}" \
  --jq ".data.repository.issue as \$i | (\$i.id), (\$i.projectItems.nodes[] | select(.project.id == \"$project_id\") | [.id, (.fieldValueByName.name // \"\"), .isArchived] | @tsv)")"
issue_id="$(head -n1 <<<"$issue_info")"
items="$(tail -n +2 <<<"$issue_info")"
item_line="$(awk -F'\t' '$3 != "true"' <<<"$items" | head -n1)"
archived_line="$(awk -F'\t' '$3 == "true"' <<<"$items" | head -n1)"

if [ "$cmd" = get ]; then
  if [ -n "$item_line" ]; then
    status="$(cut -f2 <<<"$item_line")"
    echo "${status:-no status}"
  elif [ -n "$archived_line" ]; then
    echo archived
  else
    echo none
  fi
  exit 0
fi

# What GitHub does when an issue whose only item is archived is added again is not verified; it may hand back the
# archived item. So an archived item is never touched (#65).
if [ -z "$item_line" ] && [ -n "$archived_line" ]; then
  echo "#$issue: the board item is archived; unarchive it on the board first" >&2
  exit 1
fi

option_id="$(tail -n +2 <<<"$project_info" | awk -F'\t' -v s="$wanted" '$2 == s { print $1 }')"
[ -n "$option_id" ] || { echo "status \"$wanted\" does not exist on the board" >&2; exit 1; }

item_id="$(cut -f1 <<<"$item_line")"
if [ -z "$item_id" ]; then
  # The project's auto-add workflow may add the issue at the same moment; then look the item up again. If it is
  # still missing, the add failed for a real reason (a missing scope, no project access): show GitHub's error.
  add_error="$(mktemp)"
  trap 'rm -f "$add_error"' EXIT
  if ! item_id="$(gh api graphql \
    -f query="mutation{addProjectV2ItemById(input:{projectId:\"$project_id\",contentId:\"$issue_id\"}){item{id}}}" \
    --jq '.data.addProjectV2ItemById.item.id' 2>"$add_error")"; then
    item_id="$(gh api graphql \
      -f query="query{repository(owner:\"$OWNER\",name:\"$REPO_NAME\"){issue(number:$issue){id projectItems(first:20){nodes{id isArchived project{id}}}}}}" \
      --jq ".data.repository.issue.projectItems.nodes[] | select(.project.id == \"$project_id\" and (.isArchived | not)) | .id")"
    if [ -z "$item_id" ]; then
      echo "#$issue: could not add the issue to the board:" >&2
      cat "$add_error" >&2
      exit 1
    fi
  fi
fi

gh api graphql \
  -f query="mutation{updateProjectV2ItemFieldValue(input:{projectId:\"$project_id\",itemId:\"$item_id\",fieldId:\"$field_id\",value:{singleSelectOptionId:\"$option_id\"}}){projectV2Item{id}}}" \
  --jq '.data.updateProjectV2ItemFieldValue.projectV2Item.id' > /dev/null
echo "#$issue: $wanted"
