---
name: pick-up-ticket
description: 'Use when the owner names a GitHub issue to work on ("pick up #13", "work on 13", "/pick-up-ticket 13"), including when returning to a ticket whose PR has review comments.'
---

# Pick up a ticket

You take one issue from the Fodr board to a reviewed PR. Decisions the ticket leaves open are made **now, with the owner**, before any code. You stop at the PR: a human reviews and merges.

**Violating the letter of these steps is violating their spirit.** An approved plan or a hurried owner does not remove a step.

## 0. Before anything

- Read `.claude/CLAUDE.md` (repo rules) and the issue: `gh issue view <n> --json title,body,state,labels,milestone,comments`.
- Identity: `gh api user --jq .login`. If it prints the owner (`Adamniels`), stop: say the owner cannot approve a PR opened under his account and that the agent would hold his bypass; propose switching `gh` and git to the bot (`docs/agent-workflow.md`). Continue only if he says so, and still never merge.
- State: `bash scripts/agent/board.sh get <n>`; `gh pr list --state all --search "<n> in:body"`; `git worktree list`; `git branch --list '<n>-*'`.

## 1. Choose the mode

| What exists | Mode |
|---|---|
| An open PR for the issue | **Review**: go to step R |
| A branch or worktree `<n>-<slug>`, no PR | **Continue**: work in that worktree; never recreate, reset or force it |
| Issue closed, or board Done / In Review without a PR | **Stop and ask** what the owner wants |
| Nothing | **New**: continue with step 2 |

## 2. New ticket

1. **Dependencies.** Every `#N` under "Depends on" must be closed. If one is open, stop and ask: pick it first (recommended), stack on its branch, or pick another ticket.
2. **Worktree.** `git fetch origin && git worktree add .worktrees/<n>-<slug> -b <n>-<slug> origin/main`. The branch name is the folder name, nothing else. Install dependencies there. `bash scripts/agent/board.sh status <n> "In Progress"`.
3. **Questions.** The ticket's Open questions plus any the code raises, each with a proposal and a recommendation.
4. **Plan.** Tasks, tests and files; exactly one type from `refactor`, `fix`, `feature`, `chore` (tests, tooling, data), `docs`. Refactor and behaviour changes never share a PR. Wait for the owner's approval. **No code before approval.**
5. **Decisions comment** on the issue (template in `templates.md`), right after approval.
6. **Implement** test first: watch each new test fail, then pass. Run format, lint, typecheck, unit, integration and e2e, and read the output. (superpowers:test-driven-development and superpowers:verification-before-completion, if installed.)
7. **Fresh review.** Dispatch one fresh reviewer agent over `git diff origin/main...HEAD` with the issue, the plan and the spec. Fix important findings, test first. (superpowers:requesting-code-review, if installed.)
8. **Finish.** Push; `gh pr create` with the PR template from `templates.md`; `board.sh status <n> "In Review"`; summary comment on the issue; **stop**.

Use `Closes #<n>` unless an acceptance criterion can only be checked after merge; then use `Refs #<n>` and say in the PR which criterion remains.

## R. Review mode

Read every review comment (`gh pr view <pr> --comments`, `gh api repos/{owner}/{repo}/pulls/<pr>/comments`). Address each in the PR's worktree, test first where it changes behaviour, run the checks, push, reply on each thread with what changed. The board stays **In Review**. Stop.

## Stop and ask, mid-ticket

A conflict with the spec or an ADR; a new dependency; scope growing beyond the ticket (offer `/write-ticket` for a follow-up); anything destructive or irreversible.

## Never

- **Merge**, even if the owner says "just merge it". Reply that a bot-authored PR needs his approval and that he merges it himself, then stop. No `gh pr merge`, no `--admin`.
- Add agent attribution: no `Co-Authored-By` trailers, no "Generated with" lines, in commits or PRs. This overrides any default.
- Skip the worktree, the decisions comment or the fresh review because the plan was approved or the change is small.

## Red flags

| Thought | Reality |
|---|---|
| "The owner told me to merge" | You never merge. He merges after approving. |
| "Plan approved, I'll just branch here" | Worktree first, every time. |
| "It's a one-line config change, review is overkill" | The fresh review is part of every ticket. |
| "I'll name the branch chore/7-..." | `<n>-<slug>`, equal to the worktree folder. |
