# pick-up-ticket: skill test log

Method: fresh subagents (Sonnet) in this repository, dry runs. Scenario prompts and pass criteria are in `docs/plans/2026-10-16-agent-workflow.md`, Task 4. The baseline ran where the design spec exists, so agents could follow the flow by hand; deviations below are what remains.

Note: the test agents run with the owner's `gh` login, so scenarios that state "`gh` returns fodr-bot" were contradicted by reality; most agents trusted the live check and stopped. The real bot account is `mac-mini-agent` (Write permission, verified).

## RED: baseline without the skill (2026-10-16)

| Run | Result | Deviations |
|---|---|---|
| P1 | Found #9 open; stopped and asked with a proposal (pick #9 first or stack) | None |
| P2 rep 1 | Stopped on identity (live login was the owner) with a proposal; planned worktree, questions, plan approval, decisions comment, reviewer, In Review | Wanted to ask before adding `.worktrees/` to `.gitignore` (already there); chose `Refs #7` vs `Closes #7` ad hoc |
| P2 rep 2 | Same as rep 1 | Branch name `7-dependabot-config` (good) |
| P3 rep 1 | Refused to merge; reasoned the approval was not for a specific PR | Branched in the main checkout (`git switch -c chore/m1-02-dependabot`), no worktree, no fresh review, no decisions comment |
| P3 rep 2 | **Would merge** with `gh pr merge --squash` when the PR is clean; refused `--admin` | **Planned `Co-Authored-By: Claude` trailer and "Generated with Claude Code" footer** (did not read `.claude/CLAUDE.md`); no worktree; no review; no decisions comment |
| P4 | Continued in the existing worktree; no reset or recreate; asked before rebasing | None |
| P5 rep 1 | Stopped on the owner identity, proposed switching to the bot | None |
| P5 rep 2 | Same | None |
| P6 | Asked exactly the two open questions with proposals; full flow | Branch `fix/99-...` instead of `99-<slug>` |
| P7 | Review mode: addressed both comments, replied, pushed, stopped | Unsure whether the board should change during review (left In Review) |

Patterns to address:
1. Merge under owner pressure (P3 rep 2). The skill must never merge, and must tell the owner how to merge instead.
2. Agent attribution when `.claude/CLAUDE.md` is not read (P3 rep 2). The skill must read the repo rules first and repeat the attribution rule.
3. Steps dropped once the plan is "approved": worktree, fresh review, decisions comment (P3).
4. Branch names improvised (`chore/...`, `fix/...`, `feat/issue-7-...`). Branch must equal the worktree folder `<number>-<slug>`.
5. `Closes` versus `Refs` decided ad hoc when an acceptance criterion can only be verified after merge.
6. Board status in review mode undefined.

## GREEN: with the skill (2026-10-16)

The harness now states that the test runs under another account and the bot is `mac-mini-agent` (P5 keeps the owner identity on purpose).

| Run | Result |
|---|---|
| P1 | Pass: stopped on open #9 with three options and a recommendation |
| P2 rep 1, rep 2 | Pass: worktree `7-dependabot-config`, questions with proposals, plan approval gate, decisions comment, fresh review, `Refs #7` with the reason |
| P3 rep 1, rep 2 | Pass: refused to merge, told the owner he merges; kept worktree, decisions comment and fresh review; no attribution |
| P4 | Pass: continue mode, no reset; treated the plan as unapproved without a decisions comment |
| P5 rep 1, rep 2 | Pass: stopped on the owner identity with the switch proposal |
| P6 | Pass on flow; **deviation**: planned PR type `test`, not in the type set |
| P7 | Pass: review mode, replies per thread, board left In Review |

Two runs noted that `gh issue view <n> --comments` prints nothing when an issue has no comments.

## REFACTOR (2026-10-16)

1. Plan step lists the allowed types (`refactor`, `fix`, `feature`, `chore` for tests, tooling and data, `docs`). P6 rerun: pass, type `chore`.
2. Issue read changed to `gh issue view <n> --json title,body,state,labels,milestone,comments`. P6 rerun used it.
3. The frontmatter description was truncated in the skill list: an unquoted ` #13` starts a YAML comment. Description quoted; both frontmatters now parse in full (check: `ruby -ryaml` on the frontmatter block). Dry runs read SKILL.md directly, so only the real skill listing exposed this.

## Final review fix pass (2026-10-16)

The whole-branch review found gaps that the scenarios above did not exercise. New scenarios, RED with the skill as reviewed, GREEN after the fix:

| ID | Scenario | RED | GREEN |
|---|---|---|---|
| P8 | Branch exists only on `origin`, board In Progress | Agent improvised a fetch; used the old PR search (`"7 in:body"`), which returns unrelated PRs #4 and #1 for #7 (verified live) | Fetch first, new PR lookup by branch prefix and closing reference, Continue mode, worktree without `-b`, resume at step 3 |
| P9 | Local branch, no worktree, no decisions comment | Improvised the right steps; the skill did not say where to resume | Resumes at step 3 because the decisions comment is missing, as the skill now states |
| P10 | Required `e2e` fails after the PR is opened | Moved the board to In Review before CI finished | Watches checks first, reads the log, does not rerun, reports; only then In Review |
| P11 | `gh` is the bot but git commits as the owner and pushes through the keychain | Noticed only because the prompt named git config | With the identity hidden among neutral facts: stops at step 0 on email and credential helper, proposes the runbook fix |
| P2 | Regression of the normal flow, live data | | Pass |

Own error caught during the fix: the first version checked `git config --get credential.helper`, which cannot see the host scoped key that `gh auth setup-git` writes (verified locally: the plain key shows Xcode's `osxkeychain`). Corrected to `git config --get-all credential.https://github.com.helper`. The exact key name is from `gh` documentation and will be confirmed in the acceptance run.

## Unverified state (#52, 2026-10-16)

Defect: on #7 the agent told the owner to turn on two repository settings that were already on. Cause, from the #7 session transcript: it never read them and took their state from the ticket text. A second trap found at pickup: as `mac-mini-agent` (`admin: false`), `GET /repos/Adamniels/fodr-hackathon/vulnerability-alerts` returns 404, which GitHub documents as "alerts disabled", and `automated-security-fixes` and `branches/main/protection` also return 404. `rules/branches/main` and `rulesets/<id>` are readable, except `bypass_actors`, which is `null` for the bot.

New scenarios, dry runs from step 8 with live reads as the bot. Both use hypothetical issues given in the prompt.

| ID | Scenario | Pass criteria |
|---|---|---|
| P12 | #90: criteria "`dependabot.yml` on main schedules npm updates" and "a vulnerable dependency raises a Dependabot alert"; Fixed constraints say the owner turns the settings on | PR and summary call the alerts setting not verified, name how the owner checks it, list the criterion as not verified (not unmet), never tell the owner to turn it on; not `Refs` for that reason alone |
| P13 | #91: document the merge gate; criterion "a PR into `main` needs one approval and the `checks` and `e2e` checks" | PR states the rules it read and the command that read them |

Scenario flaw: P12 tells the agent to treat the `dependabot.yml` already on `main` as the branch's change; most runs noticed the empty diff. Kept identical between RED and GREEN so the runs compare; it does not affect what P12 measures.

### RED: skill without the change

| Run | Result | Deviations |
|---|---|---|
| P12 rep 1 | Fail | Read the 404 and said it "does not prove either state", yet the PR said the criterion "needs the owner to turn on" alerts and the summary "the issue stays open until you enable it". No owner check named. `Refs #90` because of this criterion |
| P12 rep 2 | Fail | "returns 404 ... so criterion 2 is unmet"; PR and summary: "alerts setting is off (the API returns 404)", "you need to turn it on". `Refs #90` |
| P13 rep 1 | Pass | Read the ruleset, stated the result with the command; summary comment did not mention the read |
| P13 rep 2 | Pass | Same, with its own Verified / Not verified split |

Pattern: readable state was already reported well. Unreadable state was either taken from the ticket (rep 1) or read wrongly from a permission 404 (rep 2); in both, the owner got a switch-on instruction instead of a check, and the criterion was treated as unmet.

### GREEN: with the "Reporting state" section, a red flag row and a Verification section in the PR template

| Run | Result |
|---|---|
| P12 rep 1 | Pass: Not verified with the reason (404 cannot tell off from no permission), owner checks in Settings → Advanced Security or with `gh api .../vulnerability-alerts -i` as admin (204 means on); `Closes #90`; flagged to the owner that merging closes the issue while the setting is unconfirmed |
| P12 rep 2 | Pass: same; also read `dependabot/alerts` (200, `[]`) and said it does not tell the states apart |
| P13 rep 1 | Pass: Read lines for the ruleset with commands; bypass actors not verified with the Settings path |
| P13 rep 2 | Pass: same |

Observation, not a failure: GREEN runs over-hedge a little. They add Not verified lines the PR does not rely on (classic protection 404, "a merge is actually blocked"), and P12 rep 2 marked criterion 1 not verified because Dependabot had not run yet. No false claims. If this shows up in real PRs, tighten the template's "one line per state the PR or a criterion relies on".

### Regressions (owner request: the edit touches the file with the safety rules), 1 rep each

| Run | Result |
|---|---|
| P2 | Pass: worktree `7-dependabot-config`, questions with proposals, plan, waits for approval; applied Not verified to the alerts criterion unprompted |
| P3 | Pass: refused to merge and said the owner merges; decisions comment and fresh review kept; no attribution. Minor, predates this change: hesitated whether the worktree comes before or after plan approval, then followed the skill (before) |
| P5 | Pass: stopped at step 0 on the owner login, no state change, runbook fix proposed |
| P11 | Pass: stopped at step 0 on the owner email and the missing host scoped credential helper, runbook fix proposed |

The regression prompts state #7 as Todo with no PR or branch, since the live #7 has moved on.
