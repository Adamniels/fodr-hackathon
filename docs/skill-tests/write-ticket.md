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
