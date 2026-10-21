# write-ticket: skill test log

Method: fresh subagents (Sonnet) in this repository, dry runs (no issue created, edited or commented). Scenario prompts and pass criteria are in `docs/plans/2026-10-16-agent-workflow.md`, Task 3. The baseline ran on branch `chore/agent-workflow`, where the design spec and issue forms already exist, so it measures what agents get wrong **despite** those documents.

## RED: baseline without the skill (2026-10-16)

| Run | Result | Deviations |
|---|---|---|
| W1 rep 1 | Found #6 as the owner of "ICS test asserts DTSTART"; proposed a comment instead of a new issue | Acceptance criterion contained a how: "Expected dates are derived from the fixed test clock (FIXED_NOW)" |
| W1 rep 2 | Found #6; proposed a comment; fallback ticket well shaped, the derive-or-hardcode choice put under Open questions | Typed a test-only ticket `test:` although no `type:test` label exists, then fell back to `type:chore` |
| W2 rep 1 | Rewrote "add Redis" into a latency goal; Redis under Open questions with ADR 0005/0006; found #32 overlap | Acceptance criterion "Behaviour is covered by tests first" is process, not observable behaviour |
| W2 rep 2 | Same as rep 1, measurement first | None material |
| W3 rep 1 | Found #14 as duplicate; proposed a comment | None |
| W3 rep 2 | Found #14; also found that #14 misses two causes of an empty selection (Ca/P below minimum, all products filtered out) | None |
| W4 rep 1 | New ticket, #13 linked as related, cause marked unconfirmed, no fix proposed | Acceptance criterion "A failing e2e test for the comma entry exists before the fix" is process |
| W4 rep 2 | Reproduced in the running app: typing `3`, `9`, `.`, `7` key by key leaves dry matter at 7 and the plan at 77 kg haylage per day; comma path worked in Chromium. Excellent ticket | Acceptance criterion "An e2e test drives the field by label and typed keys" is a test method |

Patterns to address:
1. A how leaks into acceptance criteria (derivation method, "tests first", "an e2e test drives..."): 4 of 8 runs.
2. Type for test-only or tooling work is improvised; the label set is `type:refactor|fix|feature|chore|docs`.
3. W1 turned out to be a duplicate (my scenario choice), so the shape of a genuinely new bug ticket was only tested in fallbacks. Added W4: a new bug with no existing issue.

W4 prompt: "Write a ticket: on the analysis step, typing a comma decimal like 39,7 into the dry matter field shows 0 in the plan." Pass: reproduction attempted or described from code, Expected/Actual stated, no fix proposed, `type:fix`, duplicates checked (#13 covers validation and must be referenced as related or the owner asked whether it is the same).

## GREEN: with the skill (2026-10-16)

| Run | Result |
|---|---|
| W1 rep 1, rep 2 | Pass: comment on #6 proposed; method choices under Open questions |
| W2 rep 1, rep 2 | Pass: comment on #32 proposed; Redis recorded as "Owner suggests", not as the solution; ADR 0005/0006 cited |
| W3 rep 1, rep 2 | Pass: comment on #14 proposed |
| W4 rep 1 | **Fail**: "An e2e test enters 39,7 through the UI and checks the plan; it fails before the fix" as a criterion |
| W4 rep 2 | Pass |

## REFACTOR (2026-10-16)

1. Acceptance criteria changed from a prose rule ("names a behaviour, never a method") to a recipe: `- [ ] When <situation or action>, <what is observably true>.`, with a separate example for tickets about tests. Result: W4 rep 1 and rep 2 pass; W1 (owner insists on a separate ticket about a test) pass, criteria in the recipe form.
2. The recipe's example was identical to the W4 scenario ("types 39,7 in Torrsubstans"), which one run pointed out. Replaced with an unrelated journal example and reran W4 twice: both pass, one of them reproduced the defect in the browser.

Final: every scenario passed at least twice in a row with the final wording.

Side finding: two runs reproduced a real defect: typing `3`, `9`, `.`, `7` key by key into Torrsubstans leaves dry matter at 7 (plan: 77 kg haylage per day). Worth a real ticket.

## Reporting state (#62, 2026-10-21)

Aligns `write-ticket` with the "Reporting state" rule `pick-up-ticket` got in #52. Runner: fresh Sonnet subagents in the branch worktree, live `gh` as `mac-mini-agent` (Write, not Admin), dry runs. RED read a frozen copy of the skill and `.claude/CLAUDE.md` from before the change; GREEN read the worktree. Each prompt asks for the full ticket draft even when a duplicate is found, so a draft is always there to judge.

| ID | Scenario | Pass criteria |
|---|---|---|
| W5 | "Write a ticket: vulnerable npm dependencies should raise Dependabot alerts. I'm not sure the alerts setting is even on." The bot gets 404 on `vulnerability-alerts` and 200 `[]` on `dependabot/alerts`; closed #7 covers it | The setting is neither stated nor implied as off or on; each read is a `Read:` line with its command; the setting is `Not verified` with why and how the owner checks; a comment on another issue is not taken as a read; no criterion is called met or unmet |
| W6 | "Write a ticket: docs/agent-workflow.md should say exactly what a PR into main needs before it can merge." The ruleset is readable by the bot, its bypass list is not | The ruleset values are stated as read, with the command (guards over-correction, as P13 did for #52); the bypass list is `Not verified` |

### RED: skill without the change

| Run | Result | Deviations |
|---|---|---|
| W5 rep 1 | Partial | Never said "off"; found #7 and proposed a comment with the Settings path. The ticket body has the state under Open questions as "Likely already satisfied: #7 records the owner confirming ..." and names no owner check; no read/not-verified lines |
| W5 rep 2 | Partial | Same: "Likely yes per #7's closing comment"; no owner check in the ticket body |
| W6 | **Fail** | Read the ruleset (1 approval, `checks` and `e2e` strict, squash only) but wrote the values under Open questions as "Likely (read from the GitHub API ..., not yet verified against the live UI)" |

Pattern: step 3's rule for causes ("never state a cause as fact; write 'likely'") is applied to states. Unreadable states lean on another issue's comment; readable states are downgraded to "likely".

### GREEN: with the change

The change: step 3 sends states to a new "Reporting state" section (adapted from `pick-up-ticket`, with the line "another issue, a comment or the owner's description is not a read" and "a state you did read is a fact with its command, not a 'likely'"); an Evidence section with `Read:` and `Not verified:` lines, also for a non-bug ticket that relies on a state; two common-mistake rows; each skill's section names the other's, so the two stay in step.

| Run | Result |
|---|---|
| W5 rep 1 | **Fail** (over-claim): lines in the right form and #7's comment "not evidence", but "Read: Dependabot alerts enabled: yes" from the 200 `[]` plus a premise the agent itself marked "from my recollection of GitHub's docs (not checked here)" |
| W5 rep 2 | Pass: the 200 `[]` read but "does not tell the states apart"; alerts `Not verified` with the admin check and the Settings path |
| W6 | Pass: every ruleset value a `Read:` with its command; bypass list `Not verified` |

Refactor: a sentence on conclusions: a conclusion drawn from a read counts as read only when the rule it rests on was read too, in documentation the agent opened; otherwise the read is `Read:` and the conclusion `Not verified:`. Reran W5 twice and W6 once:

| Run | Result |
|---|---|
| W5 rep 1 | Pass: 200 `[]` as `Read:`, "alerts are on" `Not verified` because the documentation was not opened |
| W5 rep 2 | Pass: same; #7's "confirmed on" called a statement, not a read |
| W6 | Pass: ruleset values still `Read:` (no over-correction); the meaning of `require_extra_approval_for_unattributed_changes` `Not verified` because its documentation was not read |

### Regressions on the first GREEN wording (before the conclusions sentence), 1 rep each

| Run | Result |
|---|---|
| W1 | Pass: no covering issue (#6 added only the partial check); criteria in the recipe form with the defect as the situation; Evidence lines for what the test asserts and a `Not verified` line for the untested mutation |
| W2 | Pass: comment on #32 proposed; Redis an owner suggestion under Open questions; Evidence with `Read:` lines and a `Not verified` line for the unmeasured latency |
| W3 | Pass: #14 (fixed by PR #100) found; comment proposed with the code read on main; "still reproduces" `Not verified` |
| W4 | Pass: #50 (fixed by #66) found; unit and e2e runs could not reproduce; comment proposed; other browsers `Not verified` |

### After the fresh review

The review found: the rule's scope named only Evidence, Problem, Actual and Fixed constraints, though RED put its guesses under Open questions and the Goal describes today's state; `pick-up-ticket` lacked the conclusions sentence although the two skills are meant to match, and the over-claim GREEN W5 rep 1 made can happen in a PR just as well; the regressions above ran before the conclusions sentence. Changes: the rule covers any place a ticket describes a current state; "met or unmet" is limited to criteria on a `Not verified` state; Evidence keeps room for reproduction output; the owner's own statement of a state he checked is recorded as "owner, <date>"; a common-mistake row aligned; `pick-up-ticket`'s Reporting state gets the conclusions sentence and "another issue or a comment is not a read" (scenario P25 in `docs/skill-tests/pick-up-ticket.md`). Everything below ran on the final wording.

| Run | Result |
|---|---|
| W5 rep 1 | Pass: each read a `Read:` line; alerts `Not verified` (the 404 and `[]` cannot tell the states apart, no documentation read) with the admin check; #7's comment "not a read from today" |
| W5 rep 2 | Pass: same; proposes the owner records his check on #7 as "owner, <date>" |
| W6 | Pass: ruleset values `Read:` with commands; bypass list and the unexplained flag `Not verified`; no over-correction |
| W1 | Pass: no covering issue; what the test asserts as `Read:` (file:line); whether today's dates are right `Not verified` |
| W2 | Pass: comment on #32; Redis an owner suggestion; latency `Not verified` with how to measure |
| W3 | Pass: comment on #14 (PR #100); the code on main `Read:`; runtime behaviour `Not verified` |
| W4 | Pass: comment on #50; unit and e2e runs could not reproduce; other browsers `Not verified`; the owner's report as "owner, 2026-10-21" |

Observation: the skill does not say what to do when the covering issue is closed (all W5 runs commented on closed #7 and offered reopening). Outside #62.

`write-ticket/SKILL.md` grew from 640 to 958 words; both skills' frontmatter parses (`ruby -ryaml`).
