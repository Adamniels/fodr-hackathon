# Agent workflow: picking up and writing tickets

Status: draft for review. Date: 2026-10-16.

## Goal

Most development moves to an always-on Mac mini that runs Claude Code, reached over SSH and tmux from the laptop and through Claude Code Remote Control from the phone. The owner names a ticket and an agent works it end to end, asking when it needs a decision. A second flow turns a bug report or feature idea into a clear ticket that can wait on the board until someone picks it up.

**Core principle:** a ticket fixes *what* and *why*; *how* is decided at pickup, together with the owner, because nobody knows when the ticket will be picked up or what the code will look like then.

## Decisions

| Topic | Decision |
|---|---|
| Trigger | The owner names the issue in a session: `/pick-up-ticket <number>`, or `/pick-up-ticket` alone for a proposal he confirms (#59). No autonomous queue for now; the async layer comes later. |
| Gates | At pickup the agent asks the open questions, then shows a short plan and waits for approval before writing code. After that it stops only for genuine blockers. |
| Decision record | Questions, answers and the approved plan are posted as a "Decisions at pickup" comment on the issue and linked from the PR. Architecture-level decisions still become ADRs. |
| Identity | On the Mac mini, git and `gh` run as the owner's bot account, so PRs are authored by the bot and the owner approves them normally. The bypass is never needed. |
| Execution | Inline test-driven implementation, then one fresh reviewer agent over the whole branch before the PR; important findings are fixed first. (Since #110, every finding is fixed, proposed as a ticket, or listed as not done: `docs/agent-workflow.md`, "Review findings".) |
| Finish | Open the PR, move the board item to In Review, summarise on the issue, and stop. Never merge. Running the skill again on the same ticket handles PR review comments. |
| Workspace | One git worktree per ticket under `.worktrees/`, so two tickets can run in parallel tmux sessions. Docker services are shared. |
| Open dependencies | Stop and ask: proceed anyway (for example stacked on the dependency's branch) or pick another ticket. |
| Ticket shape | Problem or goal; for bugs, reproduction, expected vs actual and evidence; acceptance criteria as observable behaviour; scope in and out; fixed constraints only where already decided, with links; open questions for pickup. Never the implementation approach, files, libraries or data model changes. |
| Ticket intake | Draft first from a short description, ask only for what cannot be inferred, show the draft, create after approval. |
| Bug investigation | Reproduce read-only and record the evidence; no code changes and no root cause stated as fact. |
| Placement | Duplicate check, `type:*` label, suggested milestone (none means backlog), dependency links, added to the board as Todo. GitHub issue forms with the same sections for tickets written by hand. |

## Components

| File | Purpose |
|---|---|
| `.claude/skills/pick-up-ticket/SKILL.md` | The pickup flow |
| `.claude/skills/write-ticket/SKILL.md` | The ticket writing flow |
| `scripts/agent/board.sh` | Deterministic board updates: `board.sh status <issue> <Todo\|In Progress\|In Review\|Done>` |
| `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml`, `config.yml` | Issue forms with the ticket shape; blank issues disabled |
| `docs/agent-workflow.md` | How the workflow runs, and the Mac mini runbook |

The skills live in the repository so every teammate's agent uses the same, reviewed version.

## Pick-up flow

1. **Preconditions.** `gh` is authenticated as the bot (warn if it is the owner's account, since the owner then cannot approve the PR); `main` is current; Docker is running when the ticket needs it.
2. **Read.** The issue and all its comments, the spec and ADRs it links, and the state of every issue under "Depends on". Open dependencies: stop and ask.
3. **Resume detection.** If a branch or PR for the issue exists, switch to review mode: read the PR's review comments, address each one, reply on the thread, push, and stop.
4. **Set up.** Worktree `.worktrees/<number>-<slug>` on a new branch from `main`; install dependencies; board item to In Progress.
5. **Questions.** The ticket's open questions plus any raised by exploring the code, each paired with a proposal and a recommendation.
6. **Plan.** Tasks, tests and files, checked against the rule that refactoring and behaviour changes never share a PR. After the owner approves, post the "Decisions at pickup" comment.
7. **Implement.** Test first; run format, lint, typecheck, unit, integration and e2e.
8. **Review.** A fresh reviewer agent reviews the whole branch against the issue, the spec and the plan; important findings are fixed with a failing test first.
9. **Finish.** Push; open the PR with the repository template, `Closes #<number>` and a link to the decisions comment; board item to In Review; summary comment on the issue; stop.

**Stops mid-ticket for:** a conflict with the spec or an ADR; a new dependency; scope growing beyond the ticket (offer to write a follow-up ticket instead); anything destructive or irreversible. **Never:** merging, using a bypass, or adding agent attribution (repository rules in `.claude/CLAUDE.md`).

## Write-ticket flow

1. **Intake.** A sentence or two from the owner, plus anything pasted (error text, screenshot).
2. **Duplicates.** Search open and closed issues; if one matches, propose commenting on it instead.
3. **Investigate, read only.** Find the affected area in the code and docs. For a bug, try to reproduce it by running the app or tests and record exact evidence. No code changes, no causes stated as fact.
4. **Draft.** Fill the ticket shape. Anything undecided goes under Open questions, never into the solution.
5. **Gaps.** Ask only what cannot be inferred, such as expected behaviour or priority.
6. **Create.** After approval: create the issue with title `<type>: <summary>`, the type label, the suggested milestone, dependency links, and add it to the board as Todo. Report the link.

New tickets have no slice ID; the `[M1-03]` prefix is reserved for roadmap slices.

## Outside the repository (owner, on the Mac mini)

The runbook in `docs/agent-workflow.md` covers: the bot account with Write access to the repository; `gh auth login` as the bot; git user name and email set to the bot for this repository; the repository cloned; Docker, Node 24 and Claude Code installed; tmux session conventions; Remote Control.

## Acceptance

The skills are tested by using them on real work:

1. `write-ticket` turns one of the deferred M0 review minors into a ticket that meets the ticket shape, lands on the board as Todo and contains no implementation decisions.
2. `pick-up-ticket` completes issue #7 (Dependabot configuration file) on the Mac mini as the bot: questions asked, plan approved, decisions comment posted, worktree used, PR opened by the bot with `Closes #7`, board item in In Review, and the owner able to approve the PR.
3. Running `pick-up-ticket 7` again after a review comment addresses the comment and pushes.

## Out of scope

An autonomous queue or scheduled pickup, CI-triggered agents (GitHub Actions running Claude), notifications beyond what Remote Control provides, and multiple concurrent agents on the same ticket.
