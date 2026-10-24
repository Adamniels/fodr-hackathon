# 0017. Optimistic concurrency for record edits

Status: Accepted. Date: 2026-10-24.

## Context

A horse profile and an analysis's corrections are saved as whole records (`PUT /api/v1/horses/:id`, `PUT /api/v1/horses/:id/analyses/:analysisId/values`), by an autosave that sends the latest edit once the typing pauses. With the same horse open on two devices, the later save replaced every field with that device's copy and undid the other device's changes, and neither user noticed (#140). Reading the list again on window focus, while nothing is unsaved (#25), narrows the window but does not close it. A journal entry that updates the profile (#28) is a second writer of the same record.

## Decision

- **Every record that is replaced as a whole carries a version.** `horses.version` and `analyses.version` are integers starting at 1, raised by every write of the record: a profile save, a journal entry's profile update, an analysis correction. The API returns the version as the record's `version` field, and as the `ETag` of the single record.
- **A replacing PUT names the version its copy was read at** in `If-Match: "<version>"` (one strong entity tag). The server checks it in the write itself (`WHERE version = $v` for a horse, under the row lock an analysis correction already takes), so of two saves of one copy only the first is written.
  - A save of an older copy is refused with **412** `horse.changed` or `analysis.changed`, and nothing is written.
  - A PUT without `If-Match` is refused with **428** `request.precondition_required`, so no client can overwrite blindly.
  - Any other `If-Match` (a weak tag, a list, `*`, an unquoted number) is a **400** `request.invalid_precondition`.
  - A record that is not the user's stays a 404 whatever the version (ADR 0010).
- **The web keeps the version beside the record and sends it with every save.** It moves only when the page takes the server's copy: a read, a create, a save's answer, a journal entry's update. It never moves back: a read that left before a save was answered keeps the page's copy. While an edit of the record is waiting or on its way, the page keeps its copy and its version, so a write in between (a journal entry's update) meets the edit as a conflict that lists it, rather than being undone unseen. A save whose refused copy turns out to be what the server already holds (the same edit on both devices) counts as saved.
- **A refused save is a conflict the user decides** (owner, #140). Saving stops for that record, and a notice lists each value where the server's copy and the page's differ, both shown, with "Använd de nya" (take the server's copy) and "Behåll mina" (save the page's copy on the server's version). Edits typed meanwhile wait with the conflict. The version is the record's, not part of what it says: a plan's inputs are the profile without it.

## Alternatives

- **`updated_at` as the version.** No migration, but a timestamp is a weaker identity (its precision, the clock) and would become the concurrency token clients depend on.
- **Merging per field (PATCH).** Different fields would never conflict, but the same field changed on two devices would still keep the last save silently, and nested objects and lists need a merge-patch contract.
- **Merging automatically, asking only on overlap.** Smoother, but needs the base copy per record and a three-way merge, and departs from telling the user whenever a save was based on an older copy (owner, #140).
- **409 Conflict.** ADR 0013 names it for conflicts in general; a failed `If-Match` is 412 by HTTP's own semantics (RFC 9110), and a missing one 428 (RFC 6585).

## Consequences

- Every new record that the web replaces as a whole takes the same version, `If-Match` and conflict handling.
- A tab left open across a deploy that introduces a version check has its saves refused (428) until it is reloaded.
- A product edit in the admin view is still last-write-wins; it has one admin and an explicit Save button. A report uploaded on one device while another corrects the old analysis is a different flow: the corrections land on the analysis that is no longer current.
