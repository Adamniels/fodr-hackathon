---
name: pick-up-ticket
description: 'Use when the owner names a GitHub issue to work on ("pick up #13", "work on 13", "/pick-up-ticket 13"), including when returning to a ticket whose PR has review comments; and when he asks what to work on next or types /pick-up-ticket with no number, to propose the next ticket.'
---

# Pick up a ticket

You take one issue from the Fodr board to a reviewed PR. Decisions the ticket leaves open are made **now, with the owner**, before any code. You stop at the PR: a human reviews and merges.

**Violating the letter of these steps is violating their spirit.** An approved plan or a hurried owner does not remove a step.

## No issue number: propose one

When the owner gives no number ("/pick-up-ticket", "what should I work on next?"), run `bash scripts/agent/next.sh` and propose from its output only; do not rank the board yourself, and change nothing yet: no worktree, branch or board status. The order rule is in `docs/agent-workflow.md`, "Choosing the next ticket".

Tell the owner, in this order:
1. Every ticket under **In flight**, with its status, before anything new: continuing or reviewing it may be the better next step.
2. The **Proposal**: number, title and the reason the script gives.
3. The **Alternatives** (one or two), each with why it comes later.
4. Each **Skipped** ticket with what blocks it, since it ranks before the proposal.

Then wait. When he confirms a ticket (the proposal or another number), continue at step 0 with that number, exactly as if he had typed `/pick-up-ticket <number>`. If `next.sh` fails, report the error and ask him for a number; never propose from a partial read.

## 0. Before anything

- Read `.claude/CLAUDE.md` (repo rules) and the issue: `gh issue view <n> --json title,body,state,labels,milestone,comments`.
- Identity, all three must be the bot (`mac-mini-agent`):
  - `gh api user --jq .login`
  - `git config user.email` ends with `+mac-mini-agent@users.noreply.github.com`
  - `git config --get-all credential.https://github.com.helper` includes `gh auth git-credential` (pushes go through the bot's `gh` login, not a keychain)

  If any shows the owner or something else, stop: the owner cannot approve a PR authored or pushed as him, and the agent would hold his bypass. Propose the fix from `docs/agent-workflow.md` (runbook steps 4 and 5). Continue only if he says so, and still never merge.
- State, after `git fetch origin`:
  - `bash scripts/agent/board.sh get <n>`
  - PRs for the issue: `gh pr list --state all --limit 200 --json number,state,headRefName,closingIssuesReferences --jq '.[] | select((.headRefName | startswith("<n>-")) or any(.closingIssuesReferences[]?; .number == <n>))'`
  - `git worktree list`; `git branch --list '<n>-*'`; `git branch -r --list 'origin/<n>-*'`

## 1. Choose the mode

| What exists | Mode |
|---|---|
| An open PR for the issue | **Review**: go to step R |
| A merged or closed PR for the issue | **Stop and ask** |
| A branch `<n>-<slug>`, locally or on `origin`, no PR | **Continue**: use its worktree; if there is none, `git worktree add .worktrees/<branch> <branch>` (no `-b`). Never recreate, reset or force the branch. Resume at step 3 if the issue has no "Decisions at pickup" comment, otherwise at step 6 |
| Issue closed, or board Done / In Review without a PR | **Stop and ask** |
| Board In Progress but no branch anywhere | **Stop and ask**: someone else may be working on it |
| Nothing | **New**: continue with step 2 |

## 2. New ticket

1. **Dependencies.** Every `#N` under "Depends on" must be closed. If one is open, stop and ask: pick it first (recommended), stack on its branch, or pick another ticket.
2. **Worktree.** `git fetch origin && git worktree add .worktrees/<n>-<slug> -b <n>-<slug> origin/main`. The branch name is the folder name, nothing else. Install dependencies there. `bash scripts/agent/board.sh status <n> "In Progress"`.
3. **Questions.** The ticket's Open questions plus any the code raises, each with a proposal and a recommendation.
4. **Plan.** Tasks, tests and files; exactly one type from `refactor`, `fix`, `feature`, `chore` (tests, tooling, data), `docs`. Refactor and behaviour changes never share a PR. Wait for the owner's approval. **No code before approval.**
5. **Decisions comment** on the issue (template in `templates.md`), right after approval.
6. **Implement** test first: watch each new test fail, then pass. Run format, lint, typecheck, unit, integration and e2e, and read the output. (superpowers:test-driven-development and superpowers:verification-before-completion, if installed.)
7. **Fresh review.** Dispatch one fresh reviewer agent over `git diff origin/main...HEAD` with the issue, the plan and the spec. Fix important findings, test first. (superpowers:requesting-code-review, if installed.)
8. **Finish.** Push; `gh pr create` with the PR template from `templates.md`; then `gh pr checks <pr> --watch`.
   - A check fails because of this PR: fix it test first, push, watch again.
   - A check fails for an unrelated reason (flaky, infrastructure): do not rerun or work around it; report it to the owner with the log excerpt.

   Only then `board.sh status <n> "In Review"` and the summary comment with the real check result; **stop**.

Use `Closes #<n>` unless an acceptance criterion can only be checked after merge; then use `Refs #<n>` and say in the PR which criterion remains.

## Reporting state

In the decisions comment, the PR and the summary, state as fact only what you read, with how (command and result). If you did not read it, or the read cannot tell the states apart, write **Not verified**, why, and how the owner checks it (command or Settings path). As the bot (Write, not Admin), a 403 or 404 on a settings or admin endpoint means not verified, not "off". The ticket text is not a read. A criterion only the owner can check is listed as not verified, never as unmet, and does not by itself make it `Refs`.

## R. Review mode

Read every review comment (`gh pr view <pr> --comments`, `gh api repos/{owner}/{repo}/pulls/<pr>/comments`). Address each in the PR's worktree, test first where it changes behaviour, run the checks, push (never force), watch `gh pr checks <pr> --watch`, reply on each thread with what changed. The board stays **In Review**. Stop.

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
| "No number given; the ticket in progress / the earliest one looks next" | Run `next.sh`. In-flight tickets are mentioned, never proposed; the order is the script's, not yours. |
| "The API says 404, so it's off" / "The ticket says the owner must turn it on" | Not verified. Tell the owner how to check, not what to switch on. |
