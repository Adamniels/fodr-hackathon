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

Patterns to address:
1. A how leaks into acceptance criteria (derivation method, "tests first").
2. Type for test-only or tooling work is improvised; the label set is `type:refactor|fix|feature|chore|docs`.
3. W1 turned out to be a duplicate (my scenario choice), so the shape of a genuinely new bug ticket was only tested in fallbacks. Added W4: a new bug with no existing issue.

W4 prompt: "Write a ticket: on the analysis step, typing a comma decimal like 39,7 into the dry matter field shows 0 in the plan." Pass: reproduction attempted or described from code, Expected/Actual stated, no fix proposed, `type:fix`, duplicates checked (#13 covers validation and must be referenced as related or the owner asked whether it is the same).
