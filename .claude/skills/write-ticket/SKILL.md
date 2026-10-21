---
name: write-ticket
description: Use when a bug is found or a feature, change, chore or follow-up is wanted and it should become a GitHub issue on the Fodr board, including when the owner describes a solution they have in mind.
---

# Write a ticket

A ticket fixes **what** and **why**. **How** is decided when someone picks it up, together with the owner, because nobody knows when that happens or what the code will look like then. Your job is to make the problem unmistakable, not to solve it.

## Steps

1. **Intake.** Take the owner's description and anything pasted. Read `.claude/CLAUDE.md` for the repo rules.
2. **Duplicates.** Search open and closed issues (`gh issue list --state all --search "<keywords>"`, then `gh issue view` on hits). If an issue already covers it, stop and propose a comment on that issue instead, with the comment text. A line inside a larger issue's scope counts as covered.
3. **Investigate, read only.** Find the affected area in the code and docs. For a bug, try to reproduce it (run the app or tests, or trace the code path) and record exact evidence. Change no files. Never state a cause as fact; write "likely" and put it under Open questions. A state (a setting, a permission, whether something is on) follows "Reporting state" below instead: read it if you can.
4. **Draft** the body below.
5. **Ask** only what you cannot infer, each question with a proposal and a recommendation. Show the full draft.
6. **Create after the owner approves**, then report the link:
   ```
   gh issue create --title "<type>: <summary>" --label "type:<type>" [--milestone "<M# Name>"] --body-file <file>
   bash scripts/agent/board.sh status <number> Todo
   ```

## The body, exactly these sections in this order

For a bug: `### Problem`, `### Reproduction`, `### Expected`, `### Actual`, `### Evidence`, then the common sections. For anything else: `### Goal`, then `### Evidence` when the ticket relies on the current state of something, then the common sections. Common sections: `### Acceptance criteria`, `### Scope`, `### Fixed constraints`, `### Open questions`, and `### Depends on` only when a dependency is known (`- #N`).

- **Acceptance criteria** have exactly this form, one per checkbox:
  `- [ ] When <situation or action>, <what is observably true>.`
  Example: `- [ ] When a user saves a journal entry with weight 545, the horse profile shows 545 kg.` How it is verified (which tests, test first) is decided at pickup and goes nowhere in the ticket. For a ticket about a test, the situation is the defect: `- [ ] When the .ics dates are shifted by a day, the calendar e2e test fails.`
- **Evidence**: besides any reproduction output, each state the ticket relies on gets one line: `Read: <state>: <result> (<command, or file:line>)` or `Not verified: <state>: <why>. The owner checks with <command or Settings path>.`
- **Fixed constraints** contain only what is already decided, each with its source (spec section, ADR, or "owner, <date>").
- **Open questions** hold every undecided choice, including the owner's suggested solution when they said "add X" (record it as "Owner suggests X"), unless the owner states that X is required; then it is a fixed constraint with "owner, <date>" as the source.

## Reporting state

Anywhere the ticket describes a current state (Goal, Problem, Actual, Evidence, Fixed constraints, Open questions), state as fact only what you read, with how (command and result, or file and line). If you did not read it, or the read cannot tell the states apart, write **Not verified**, why, and how the owner checks it (command or Settings path). As the bot (Write, not Admin), a 403 or 404 on a settings or admin endpoint means not verified, not "off". Another issue or a comment is not a read; the owner's statement of a state he checked is recorded as his, with "owner, <date>" as the source. A state you did read is a fact with its command, not a "likely": "likely" is for causes. A conclusion drawn from a read (a 200 here means the setting is on) counts as read only when the rule it rests on was read too, in documentation you opened; otherwise write the read as `Read:` and the conclusion as `Not verified:`. A criterion that depends on a `Not verified` state is never called met or unmet in the ticket. Keep this in step with "Reporting state" in `pick-up-ticket`.

## Placement

| Field | Rule |
|---|---|
| Title | `<type>: <summary>`, no `[M1-03]` prefix (reserved for roadmap slices) |
| Type label | `type:fix` bug, `type:feature` new or changed behaviour, `type:refactor` behaviour unchanged, `type:chore` tests, tooling, data, infrastructure, `type:docs` docs only |
| Milestone | Suggest the M1 to M5 milestone whose goal it serves; none means backlog |
| Board | Always `board.sh status <n> Todo` after creating |

No agent attribution anywhere in the issue.

## Common mistakes

| Mistake | Instead |
|---|---|
| "An e2e test checks the field", "tests first", "derive dates from FIXED_NOW", "add a Redis cache" as criteria | Rewrite as `When <situation>, <observable result>`; methods go in Open questions |
| A new issue for something already in another issue's scope | A proposed comment on that issue |
| Inventing a label such as `type:test` | The table above; test-only work is `type:chore` |
| "The cause is X" | "Likely X", and the question under Open questions |
| "The setting is off (the API returns 404)" / "likely on, as #N says" | The 404 as `Read:`, the setting as `Not verified:` with why and how the owner checks |
| A state you read, written as "likely" or "not yet verified" | `Read:` with the command, in Evidence |
