# Agent workflow

How tickets are written and worked by AI agents, mainly on the Mac mini. Design: `docs/specs/2026-10-16-agent-workflow-design.md`. The two skills live in `.claude/skills/`.

## The life of a ticket

| Stage | Who | How |
|---|---|---|
| A bug or idea appears | Anyone | `/write-ticket <description>` in a Claude Code session, or the Bug or Feature form on GitHub |
| Ticket on the board | `write-ticket` | Issue with the ticket shape, `type:*` label, suggested milestone, board status **Todo** |
| Picked up | Owner names it | `/pick-up-ticket <number>` on the Mac mini; board **In Progress**; own worktree `.worktrees/<number>-<slug>` |
| Decisions | Agent and owner | Agent asks the ticket's open questions and shows a plan; after approval it posts a "Decisions at pickup" comment on the issue |
| Implementation | Agent | Test first, all checks, then a fresh reviewer agent over the branch |
| Pull request | Agent (as the bot) | PR with `Closes #<n>` and a link to the decisions comment; board **In Review**; summary comment on the issue |
| Review round | Owner, then agent | Owner comments on the PR; `/pick-up-ticket <number>` again addresses each comment and pushes |
| Merge | A human | Owner or teammate approves and merges; the issue closes; board **Done** |

A ticket fixes **what** and **why**. **How** is decided at pickup, so tickets stay valid however long they wait. Agents never merge, never use the branch protection bypass and never add agent attribution (`.claude/CLAUDE.md`).

## Mac mini runbook

The Mac mini works as the bot account **`mac-mini-agent`**, so the PRs it opens are authored by the bot and a human can approve them.

1. **GitHub (owner, once).**
   - Keep `mac-mini-agent` as a repository collaborator with **Write** permission. Never give it Admin: the ruleset lets admins bypass review, and the bot would inherit that.
   - Give it access to the project board: open the "Fodr" project, **Settings → Manage access**, add `mac-mini-agent` with **Write**. Repository access does not include the board, which is a private user project.
2. **Tools.** Install Node 24 (see `.nvmrc`), Docker (Desktop or OrbStack), `gh`, tmux and Claude Code.
3. **Clone.** `git clone https://github.com/Adamniels/fodr-hackathon.git ~/Projects/fodr-hackathon`
4. **Log in as the bot.** `gh auth login` with the bot account; scopes `repo`, `workflow`, `project`, `read:org` (`gh auth refresh -s project` if the project scope is missing). Then `gh auth setup-git`, so git pushes use the bot's login instead of a keychain entry that may belong to the owner.
5. **Git identity, this clone only.** In the clone:
   ```
   git config user.name "mac-mini-agent"
   git config user.email "<id>+mac-mini-agent@users.noreply.github.com"
   ```
   The id comes from `gh api users/mac-mini-agent --jq .id`.
6. **Install.** `cd app && npm ci && npx playwright install chromium`, then `cp .env.example .env` and add the Anthropic key if AI features are needed.
7. **Check**, in the clone:
   - `gh api user --jq .login` prints `mac-mini-agent`
   - `git config user.email` ends with `+mac-mini-agent@users.noreply.github.com`
   - `git config --get-all credential.https://github.com.helper` includes `gh auth git-credential` (written by `gh auth setup-git`; the plain `credential.helper` may still show `osxkeychain`, which is fine)
   - `bash scripts/agent/board.sh get 7` prints a status

   If any of the first three is wrong, `pick-up-ticket` stops and says so.

## Working sessions

- **Start:** `ssh` to the Mac mini, then `tmux new -s fodr-<number>`, `cd ~/Projects/fodr-hackathon`, `git pull`, `claude`, and `/pick-up-ticket <number>`.
- **Leave and come back:** detach with `Ctrl-b d`; reattach with `tmux attach -t fodr-<number>`. From the phone, use Claude Code Remote Control to answer the agent's questions.
- **Two tickets at once:** one tmux session per ticket; each has its own worktree, Docker services are shared.
- **After merge:** `git worktree remove .worktrees/<number>-<slug>`, `git branch -d <number>-<slug>`, `git worktree prune`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| The agent warns that `gh` is the owner's account | Redo runbook steps 4 and 5 in this clone |
| `board.sh` fails with a scope error | `gh auth refresh -s project` |
| `board.sh` fails with "Could not resolve to a ProjectV2" | The bot has no access to the board: runbook step 1, Manage access |
| `board.sh` says a status does not exist | The board's Status options were renamed; the script reads names at runtime, so use the new name |
| A worktree is left over from an abandoned ticket | `git worktree list`, then `git worktree remove --force .worktrees/<folder>` only after checking nothing in it is needed |
| The PR cannot be approved by the owner | It was opened under the owner's account; check runbook step 4 |
