# Agent workflow

How tickets are written and worked by AI agents, mainly on the Mac mini. Design: `docs/specs/2026-10-16-agent-workflow-design.md`. The two skills live in `.claude/skills/`.

## The life of a ticket

| Stage | Who | How |
|---|---|---|
| A bug or idea appears | Anyone | `/write-ticket <description>` in a Claude Code session, or the Bug or Feature form on GitHub |
| Ticket on the board | `write-ticket` | Issue with the ticket shape, `type:*` label, suggested milestone, board status **Todo** |
| Picked up | Owner names it | `/pick-up-ticket <number>` on the Mac mini, or `/pick-up-ticket` alone to get a proposal (below) and confirm it; board **In Progress**; own worktree `.worktrees/<number>-<slug>` |
| Decisions | Agent and owner | Agent asks the ticket's open questions, proposes small open tickets to fold in, and shows a plan; after approval it posts a "Decisions at pickup" comment on the issue, and moves each folded-in ticket to **In Progress** with a note |
| Implementation | Agent | Test first, all checks, then a fresh reviewer agent over the branch; each finding is fixed, proposed as a ticket, or listed as not done (below) |
| Pull request | Agent (as the bot) | PR with `Closes #<n>` (one line per folded-in ticket too) and a link to the decisions comment; once the checks are green, board **In Review** and a summary comment on the issue (a check that fails for an unrelated reason waits for the owner's rerun, board **In Progress**) |
| Review round | Owner, then agent | Owner comments on the PR; `/pick-up-ticket <number>` again addresses each comment and pushes |
| Merge | A human | Owner or teammate approves and merges; the issue closes; board **Done** |

A ticket fixes **what** and **why**. **How** is decided at pickup, so tickets stay valid however long they wait. Agents never merge, never use the branch protection bypass and never add agent attribution (`.claude/CLAUDE.md`).

## Review findings

The backlog must not grow from review nits (owner, 2026-10-21, #110). Every finding of the fresh review gets exactly one outcome, the first that applies:

1. **Fixed**, when it stops the ticket's criteria from holding; if that needs the owner's decision, the agent stops and asks before opening the PR.
2. **Fixed**, test first, when it is the ticket's own bug elsewhere: the same mistake causing the same wrong behaviour, in any file (the transition calendar kept its state across a horse switch like the journal did, #112). A bug that only looks similar, with another cause or symptom, is sorted by the outcomes below (owner, 2026-10-21, #113). The PR says its scope grew; if the fix needs the owner's decision, the agent stops and asks before opening the PR.
3. **Fixed**, test first where behaviour changes, when it is in a file the diff changes, is of the PR's own type (a fix in a fix PR, a cleanup in a refactor PR; tests and comments for the changed code count as its own) and needs no decision from the owner (a deletion, a new dependency or an architecture change always needs one).
4. **Ticket proposed**, when it is important, or needs an answer from the owner that is more than a yes to a small change, and cannot be fixed in the branch. The draft goes in the summary comment; the issue is created after the owner approves.
5. **Not done**, anything else: one line in the PR, and no ticket. That includes small findings outside the diff, and a small change that only needs the owner's yes (deleting a dead file), which he decides on that line.

The PR's "Review" section lists every finding with its outcome. The rule is step 7 of `.claude/skills/pick-up-ticket/SKILL.md`.

**Folding in.** So the backlog shrinks, the agent also proposes at pickup to fold in open tickets of the same type, about code the change touches, and small: no open question that needs more than a yes, and a fix of a few lines with its test (step 3). Roadmap slices, tickets already in flight and tickets with an open dependency are left out. With the owner's yes, the folded-in ticket moves to In Progress, the branch fixes it, the review checks its criteria, and the PR closes it too, one `Closes #N` line each.

## Choosing the next ticket

`/pick-up-ticket` without a number runs `bash scripts/agent/next.sh`, which anyone can run to see the same answer. The order comes only from the issues and the board, so there is no list to keep up to date:

1. **In flight first.** Tickets In Progress or In Review are mentioned before anything new, and never proposed as new work.
2. **Candidates** are open issues with board status Todo, no status, or not on the board, whose dependencies are all closed. Under "Depends on", a line with `#N` waits for those issues in this repository; otherwise a line starting with "None" or "Note", and the "_No response_" an issue form writes for an empty field, is ignored, and any other text (for example "all of M5." or `other-repo#3`) counts as an open dependency, so a person decides.
3. **Order:** milestone M1 to M5 (by the number in the milestone title; a milestone without that prefix comes after M5); within a milestone, a `type:fix` without slice ID first, then the slices in slice order (`[M1-01]`, `[M1-02]`, ...), then other tickets without slice ID by issue number. Backlog tickets (no milestone) come last.
4. **Proposal and alternatives:** the first candidate with a milestone is proposed. The alternatives are the next one and the top backlog ticket (or the one after that, if the backlog is empty). Only when no milestone ticket is free is a backlog ticket proposed.
5. **Skipped:** tickets that rank before the proposal but wait for a dependency are shown with what blocks them.

Nothing starts until the owner confirms; he can also name any other number.

`next.sh` and `board.sh` each have an offline test suite beside them (`scripts/agent/*.test.sh`, with a fake `gh`, so no test calls GitHub). `npm run test:scripts` runs every suite, and CI runs it in the `checks` job, so a change that breaks a script fails the PR. A new `*.test.sh` file there is picked up without changing the workflow, as long as it exits non-zero when any of its tests fails.

## Mac mini runbook

The Mac mini works as the bot account **`mac-mini-agent`**, so the PRs it opens are authored by the bot and a human can approve them.

1. **GitHub (owner, once).**
   - Keep `mac-mini-agent` as a repository collaborator with **Write** permission. Never give it Admin: the ruleset lets admins bypass review, and the bot would inherit that.
   - Give it access to the project board: open the "Fodr" project, **Settings → Manage access**, add `mac-mini-agent` with **Write**. Repository access does not include the board, which is a private user project.
2. **Tools.** Install Node 24 (see `.nvmrc`), Docker Desktop (in the `agent` user's session, set to start at sign-in), `gh`, `jq`, tmux and Claude Code. Docker Desktop's keychain credential helper (`credsStore: desktop`) cannot unlock the login keychain from an SSH session, so the agent cannot pull images: pull a new image once from the Mac's own Terminal (`docker pull <image>`); the agent's `docker compose up` then uses it. `scripts/agent/next.sh` calls the `jq` binary; macOS ships it (`/usr/bin/jq`), other systems must install it.
3. **Clone.** `git clone https://github.com/Adamniels/fodr-hackathon.git ~/dev/fodr-hackathon`
4. **Log in as the bot.** `gh auth login` with the bot account; scopes `repo`, `workflow`, `project`, `read:org` (`gh auth refresh -s project` if the project scope is missing). Then `gh auth setup-git`, so git pushes use the bot's login instead of a keychain entry that may belong to the owner.
5. **Git identity, this clone only.** In the clone:
   ```
   git config user.name "mac-mini-agent"
   git config user.email "<id>+mac-mini-agent@users.noreply.github.com"
   ```
   The id comes from `gh api users/mac-mini-agent --jq .id`.
6. **Install.** At the repository root, `npm ci && npx playwright install chromium`, then `cp .env.example .env` and add the Anthropic key (`ANTHROPIC_API_KEY`) if AI features are needed.
7. **Check**, in the clone:
   - `gh api user --jq .login` prints `mac-mini-agent`
   - `git config user.email` ends with `+mac-mini-agent@users.noreply.github.com`
   - `git config --get-all credential.https://github.com.helper` includes `gh auth git-credential` (written by `gh auth setup-git`; the plain `credential.helper` may still show `osxkeychain`, which is fine)
   - `bash scripts/agent/board.sh get 7` prints a status

   If any of the first three is wrong, `pick-up-ticket` stops and says so.

## Working sessions

- **Start:** `ssh` to the Mac mini, then `tmux new -s fodr-<number>`, `cd ~/dev/fodr-hackathon`, `git pull`, `claude`, and `/pick-up-ticket <number>` (or `/pick-up-ticket` alone for a proposal).
- **Leave and come back:** detach with `Ctrl-b d`; reattach with `tmux attach -t fodr-<number>`. From the phone, use Claude Code Remote Control to answer the agent's questions.
- **Two tickets at once:** one tmux session per ticket; each has its own worktree, Docker services are shared.
- **After merge:** `git worktree remove .worktrees/<number>-<slug>`, `git branch -D <number>-<slug>`, `git fetch --prune`, `git worktree prune`. `-D`, because a squash-merged branch never counts as merged in git, so `-d` refuses it; look at the PR first to be sure it was merged.

## Troubleshooting

| Symptom | Fix |
|---|---|
| The agent warns that `gh` is the owner's account | Redo runbook steps 4 and 5 in this clone |
| `board.sh` fails with a scope error | `gh auth refresh -s project` |
| `board.sh` fails with "Could not resolve to a ProjectV2" | The bot has no access to the board: runbook step 1, Manage access |
| `board.sh` says a status does not exist | The board's Status options were renamed; the script reads names at runtime, so use the new name |
| A worktree is left over from an abandoned ticket | `git worktree list`, then `git worktree remove --force .worktrees/<folder>` only after checking nothing in it is needed |
| The PR cannot be approved by the owner | It was opened under the owner's account; check runbook step 4 |
