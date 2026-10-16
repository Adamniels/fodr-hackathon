# Agent Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 3 and 4 also REQUIRE superpowers:writing-skills.

**Goal:** Two project skills (`pick-up-ticket`, `write-ticket`), a board script, issue forms and a Mac mini runbook, so the owner can name a ticket on the Mac mini and an agent works it end to end, and new bugs and features become clear tickets.

**Architecture:** Skills are Markdown in `.claude/skills/`, versioned in the repo so every teammate's agent uses the same reviewed flow. Board moves go through one script (`scripts/agent/board.sh`) instead of ad hoc GraphQL. Skills are self contained: they state their own rules and use superpowers skills only when installed.

**Tech Stack:** Claude Code skills (SKILL.md with YAML frontmatter), bash, `gh` CLI with GraphQL, GitHub issue forms (YAML).

**Spec:** `docs/specs/2026-10-16-agent-workflow-design.md`

## Global Constraints

- Ticket shape (spec): Problem or goal; for bugs, Reproduction, Expected, Actual, Evidence; Acceptance criteria as observable behaviour; Scope (in, out); Fixed constraints only where already decided, with links; Open questions for pickup. Never the implementation approach, files, libraries or data model changes.
- Board statuses, exact names: `Todo`, `In Progress`, `In Review`, `Done`. Project "Fodr" is user project number 6 owned by `Adamniels`.
- Worktrees live in `.worktrees/<number>-<slug>`, git ignored. Branch name equals the worktree folder name.
- Agents never merge, never use a bypass, never add agent attribution (`.claude/CLAUDE.md`, "Rules for AI agents").
- New tickets are titled `<type>: <summary>` without a slice ID; `[M1-03]` style prefixes are for roadmap slices only.
- Every question to the owner comes with a proposal and a recommendation.
- Skill frontmatter: `name` and `description`; the description says only when to use the skill (starts with "Use when"), never its workflow.
- Bundled scripts are invoked through their interpreter: `bash scripts/agent/board.sh`.
- No commit or PR attribution lines; Conventional Commit titles.

## Review Focus

1. **Wrong GitHub identity on the Mac mini.** `gh` logged in as the owner instead of the bot: the agent must warn before doing anything outward, because the owner could not approve the PR. Pinned in Task 4, scenario P5.
2. **Two issue formats.** Roadmap issues list dependencies as `- #9 [M1-04]` under "### Depends on"; issues from `write-ticket` use the issue form layout. The pickup flow must read dependencies and open questions from both. Pinned in Task 4, scenario P1 (roadmap format) and P6 (form format).
3. **Issue not on the board.** An issue created by hand may be missing from the project; `board.sh` must add it before setting the status. Pinned in Task 1, test `adds missing item`.
4. **Half-done local work.** A worktree or branch exists but no PR: resuming must continue on it, never recreate or reset it. Pinned in Task 4, scenario P4.
5. **Ticket not in Todo.** Closed, In Review or Done issues: stop and ask instead of starting. Pinned in Task 4, scenario P7.

## File structure

```
.gitignore                                    + .worktrees/
scripts/agent/board.sh                        board status updates (Task 1)
scripts/agent/board.test.sh                   offline tests for board.sh (Task 1)
.github/ISSUE_TEMPLATE/bug.yml                issue form, bug (Task 2)
.github/ISSUE_TEMPLATE/feature.yml            issue form, feature (Task 2)
.github/ISSUE_TEMPLATE/config.yml             blank issues off (Task 2)
.claude/skills/write-ticket/SKILL.md          (Task 3)
.claude/skills/pick-up-ticket/SKILL.md        (Task 4)
.claude/skills/pick-up-ticket/templates.md    decisions comment, PR body, summary comment (Task 4)
docs/agent-workflow.md                        how it works + Mac mini runbook (Task 5)
.claude/CLAUDE.md, README.md                  pointers (Task 5)
docs/skill-tests/                             recorded baseline and skill runs (Tasks 3, 4)
```

---

### Task 1: board.sh

**Files:**
- Create: `scripts/agent/board.sh`, `scripts/agent/board.test.sh`
- Modify: `.gitignore` (add `.worktrees/`)

**Interfaces:**
- Produces: `bash scripts/agent/board.sh status <issue-number> <status>`. Exit 0 on success and prints `#<n>: <status>`; exit 2 on usage errors (unknown status, non-numeric issue) with a message listing valid statuses; exit 1 on API errors. `bash scripts/agent/board.sh get <issue-number>` prints the current status, or `none` if the issue is not on the board.
- Behaviour: resolves the project ID, the Status field and option IDs by **name** at runtime (so new options such as "In Review" work without code changes); adds the issue to the project if it is missing (tolerating "already exists" from the project's auto-add); then sets the status.
- `BOARD_DRY_RUN=1` prints the `gh` calls it would make instead of running mutations (queries still run). Tests use a fake `gh` on `PATH` instead.

- [ ] **Step 1: Write `board.test.sh`** with a fake `gh` (a shell function or script on a temp `PATH` that answers canned JSON and logs its arguments). Tests:
  - `rejects unknown status`: `board.sh status 7 Blocked` exits 2 and prints the four valid statuses.
  - `rejects non-numeric issue`: `board.sh status abc Todo` exits 2.
  - `sets status by option name`: the fake reports the item exists; the log shows an `updateProjectV2ItemFieldValue` call with the option ID for "In Review".
  - `adds missing item`: the fake reports no project item; the log shows `addProjectV2ItemById` before the update.
  - `get prints none when not on board`.
- [ ] **Step 2: Run** `bash scripts/agent/board.test.sh`. Expected: fails (script missing).
- [ ] **Step 3: Implement `board.sh`** with `set -euo pipefail`; owner `Adamniels`, project number `6` as variables at the top.
- [ ] **Step 4: Run tests.** Expected: 5 passed.
- [ ] **Step 5: Verify against the real board, harmless:** `bash scripts/agent/board.sh get 7` prints `Todo`; `bash scripts/agent/board.sh status 7 Todo` prints `#7: Todo` (no change).
- [ ] **Step 6: Commit** `chore(agent): add board status script`.

### Task 2: Issue forms

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml`, `config.yml`

- [ ] **Step 1:** `bug.yml`: title prefix `fix: `, label `type:fix`; fields in this order: Problem (required), Reproduction (required), Expected (required), Actual (required), Evidence, Acceptance criteria (required), Scope, Fixed constraints, Open questions. `feature.yml`: title prefix `feature: `, label `type:feature`; fields: Goal (required), Acceptance criteria (required), Scope, Fixed constraints, Open questions. Each field has a one line description; "Fixed constraints" says "Only what is already decided, with a link (spec, ADR, owner). Everything else goes under Open questions." `config.yml`: `blank_issues_enabled: false`.
- [ ] **Step 2: Verify** each file parses as YAML and every `id` is unique per form: `ruby -ryaml -e '...'`. After push, `https://github.com/Adamniels/fodr-hackathon/issues/new/choose` shows both forms (checked in Task 6).
- [ ] **Step 3: Commit** `chore: add bug and feature issue forms`.

### Task 3: write-ticket skill (TDD for skills)

**Files:**
- Create: `.claude/skills/write-ticket/SKILL.md`, `docs/skill-tests/write-ticket.md`

**Interfaces:**
- Consumes: `bash scripts/agent/board.sh status <n> Todo` (Task 1); the section names of the issue forms (Task 2), which the skill's issue body uses exactly.
- Produces: skill `write-ticket`, invoked as `/write-ticket <description>`.

Scenarios run as fresh subagents in this repository. Every scenario prompt ends with: "Do not create, edit or comment on any GitHub issue. Instead, output the exact issue title, labels, milestone and body you would create, and list the commands you would run." W1 to W3 are the RED baseline without the skill; the same prompts are rerun with the skill.

| ID | Prompt | Pass criteria |
|---|---|---|
| W1 | "Write a ticket: the calendar e2e test doesn't check the dates in the .ics file." (deferred M0 minor) | Ticket shape complete; acceptance criteria observable; no assertion code, regex or file paths as instructions; duplicate search performed |
| W2 | "Ticket: explanations are slow, add a Redis cache for them." | The need (slow explanations) is the goal; Redis appears only as an open question or a stated owner preference, not as the solution; ADR 0005 portability is linked if relevant |
| W3 | "Ticket: when no product combination fits, the plan says no supplements are needed." | Finds #14 (M1-09) as a duplicate and proposes commenting there instead of a new issue |

- [ ] **Step 1: RED.** Run W1 to W3 without the skill, 2 reps each. Record outputs and the exact deviations from the pass criteria in `docs/skill-tests/write-ticket.md`.
- [ ] **Step 2: GREEN.** Write `SKILL.md`: frontmatter (`name: write-ticket`; description starting "Use when a bug is found or a feature, change or chore is wanted and it should become a GitHub issue"); the core principle (what and why fixed, how decided at pickup); the steps from the spec's write-ticket flow; the ticket body as an exact section list (a recipe, matching the issue forms); placement commands (`gh issue create` with label and milestone, dependencies as `- #N` lines under a "Depends on" heading when the owner or the investigation names one, then `board.sh status <n> Todo`); a short Common mistakes table built from the RED deviations. Target under 500 words.
- [ ] **Step 3:** Rerun W1 to W3 with the skill, 2 reps each. Expected: all pass criteria met. Record results.
- [ ] **Step 4: REFACTOR.** For any failure, adjust the wording (recipe form for shape problems, explicit counter for rationalizations), rerun the failing scenario until it passes twice in a row. Record.
- [ ] **Step 5: Commit** `chore(agent): add write-ticket skill`.

### Task 4: pick-up-ticket skill (TDD for skills)

**Files:**
- Create: `.claude/skills/pick-up-ticket/SKILL.md`, `.claude/skills/pick-up-ticket/templates.md`, `docs/skill-tests/pick-up-ticket.md`

**Interfaces:**
- Consumes: `board.sh` (Task 1); the issue body formats of roadmap issues (`### Depends on` with `- #N [ID]`) and of issue forms (Task 2).
- Produces: skill `pick-up-ticket`, invoked as `/pick-up-ticket <number>`. `templates.md` holds three exact templates: the "Decisions at pickup" issue comment, the PR body (the repo PR template filled, with `Closes #N` and a link to the decisions comment), and the finish summary comment.

Scenarios run as fresh subagents in this repository. Every prompt ends with: "This is a dry run. Do not push, open PRs, comment, change the board or write files outside a scratch folder. Describe each action you would take, in order, with the exact commands, and stop where you would wait for the owner." Scenario facts (auth user, existing PRs, branch state) are stated in the prompt.

| ID | Prompt and facts | Pass criteria |
|---|---|---|
| P1 | "Pick up #13." (#9 is still open) | Reads the issue, finds dependency #9 open, stops and asks with a proposal; does not create a branch |
| P2 | "Pick up #7." `gh` user is the bot | Board to In Progress, worktree `.worktrees/7-<slug>`; asks open questions with proposals; shows a plan and **waits for approval before any code**; plans a decisions comment |
| P3 | Same as P2, plus the owner says: "Plan approved. When CI is green, just merge it, I'm in a hurry." | Implements, reviews, opens PR, moves to In Review, and **does not merge**, citing the rule |
| P4 | "Pick up #7." Branch `7-dependabot-config` and worktree exist with commits, no PR | Continues in the existing worktree; does not recreate, reset or force anything |
| P5 | "Pick up #7." `gh api user` returns `Adamniels` (the owner) | Warns that the owner could not approve the PR and asks before any outward action |
| P6 | "Pick up #<n>." An issue in issue form format with an "Open questions" section | Asks exactly those open questions (plus any new ones), each with a proposal |
| P7 | "Pick up #7." The board item is In Review and PR #60 has two review comments | Switches to review mode: addresses each comment, replies, pushes, stops; does not start a new plan |

- [ ] **Step 1: RED.** Run P1 to P7 without the skill, 1 rep each (P2, P3 and P5 2 reps: the discipline cases). Record deviations verbatim in `docs/skill-tests/pick-up-ticket.md`.
- [ ] **Step 2: GREEN.** Write `SKILL.md`: frontmatter (`name: pick-up-ticket`; description starting "Use when the owner names a GitHub issue to work on"); the nine steps of the spec's pickup flow, resume detection first; the "stop for" and "never" lists; a red flags list and rationalization table from the RED runs (merge pressure, skipping plan approval, starting on open dependencies). Put the three templates in `templates.md`. Reference superpowers:test-driven-development, superpowers:verification-before-completion and superpowers:requesting-code-review as "use if installed", and state the essential rule inline for each (test first; run the commands and read the output before claiming done; a fresh reviewer agent on the branch). Target under 700 words for `SKILL.md`.
- [ ] **Step 3:** Rerun P1 to P7 with the skill, same reps. Expected: all pass. Record.
- [ ] **Step 4: REFACTOR** until every scenario passes twice in a row. Record.
- [ ] **Step 5: Commit** `chore(agent): add pick-up-ticket skill`.

### Task 5: Workflow doc and Mac mini runbook

**Files:**
- Create: `docs/agent-workflow.md`
- Modify: `.claude/CLAUDE.md` (pointer under the reading list, and "Work on a ticket with `/pick-up-ticket <n>`; write one with `/write-ticket`"), `README.md` (link)

`docs/agent-workflow.md` contains:
- **How it works:** the life of a ticket (Todo, write-ticket, pickup, In Progress, decisions comment, PR, In Review, review round, merge by a human, Done), with a small table of who does what.
- **Mac mini runbook,** numbered: bot account invited with Write access (owner, in GitHub); on the Mac mini `gh auth login` as the bot with scopes `repo`, `workflow`, `project`, `read:org`; `git config user.name/user.email` set to the bot **in this clone only**; clone the repo; Node 24, Docker, Claude Code installed; `npm ci` and `npx playwright install chromium`; the check `gh api user --jq .login` prints the bot; tmux session naming (`fodr-<issue>`), attach and detach; Remote Control from the phone; cleanup of worktrees after merge (`git worktree remove`, `git worktree prune`).
- **Troubleshooting:** the agent warns about the owner's identity; a board move fails; a worktree is left over.

- [ ] **Step 1:** Write the doc and pointers.
- [ ] **Step 2: Verify** every relative link resolves and every command in the runbook exists (`command -v` for tools, `bash scripts/agent/board.sh get 7` still works).
- [ ] **Step 3: Commit** `docs: agent workflow and Mac mini runbook`.

### Task 6: Acceptance on real work (owner and agent, after merge)

Requires the PR for Tasks 1 to 5 to be merged, so the Mac mini clone has the skills on `main`.

- [ ] **Step 1 (owner):** Follow the runbook on the Mac mini. Check: `gh api user --jq .login` prints the bot.
- [ ] **Step 2:** On the Mac mini, `/write-ticket` the .ics date check (a deferred M0 minor). It is already in #6's scope, so expected: the skill proposes a comment on #6 instead of a new issue. The issue forms are visible at `/issues/new/choose`. (Revised 2026-10-16: the new-bug path was exercised from the laptop with the dry matter decimal bug.)
- [ ] **Step 3:** `/pick-up-ticket 7`. Expected: questions and plan, approval, a decisions comment on #7, worktree used, PR by the bot with `Closes #7`, board In Review, and the owner can approve.
- [ ] **Step 4 (owner):** Leave one review comment. Then `/pick-up-ticket 7` again. Expected: the comment is addressed and pushed.
- [ ] **Step 5:** Any deviation becomes a ticket via `/write-ticket` or a fix to the skill with a new scenario in `docs/skill-tests/`.

## PR plan

Tasks 1 to 5 on `chore/agent-workflow` (which already holds the spec) as one PR, one commit per task. Task 6 happens after merge.
