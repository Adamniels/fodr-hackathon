# Templates for pick-up-ticket

Fill the angle brackets. No agent attribution in any of them.

## Decisions at pickup (issue comment, after plan approval)

```markdown
## Decisions at pickup

Picked up on <YYYY-MM-DD>. Branch `<n>-<slug>`.

### Questions and answers
1. **<question>** Proposed: <proposal>. Decided: <owner's answer>.

### Plan
- <task>: <test that proves it>
- Type: `<refactor|fix|feature|chore|docs>`. Files: <main files>.

### Out of scope
- <anything explicitly left out, or "Nothing beyond the ticket">
```

## Pull request body

Use `.github/pull_request_template.md` and fill it:

```markdown
## Summary

<What changed and why, two to four sentences.>

Closes #<n>   (or: Refs #<n>. Remaining after merge: <criterion>)

Decisions: <link to the "Decisions at pickup" comment>

## Type

- [x] <the one type from the plan>

## Checklist

- [x] New or changed behaviour has a test that failed first
- [x] `npm run format:check`, `lint`, `typecheck`, `test` and `test:e2e` pass locally
- [x] Refactoring and behaviour changes are not mixed in this PR
- [x] Docs updated if behaviour or conventions changed

## Verification

<one line per state the PR or a criterion relies on>
- Read: <state>: <result> (`<command>`).
- Not verified: <state>: <why>. The owner checks with <command or Settings path>. (Or: "Not verified: nothing.")

## Review

Fresh reviewer findings: <none, or each finding and how it was fixed>.
```

## Summary comment (issue, after the PR is open)

```markdown
PR <link> is ready for review. <one sentence on what it does>. Checks: <all green, or what failed and why>. Read: <each state the summary relies on and how it was read, or "nothing">. Not verified: <each state and how the owner checks it, or "nothing">. Waiting for approval and merge by a human.
```
