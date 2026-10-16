# 0001. Record architecture decisions

Status: Accepted. Date: 2026-10-16.

## Context

The project moves from a hackathon proof of concept to a beta built by two people, with most code written by AI agents from issues. Decisions made in chat are lost between sessions, and agents cannot see them.

## Decision

Every significant architecture decision is recorded as a short ADR in `docs/adr/NNNN-title.md`, numbered in order, with the sections Status, Context, Decision, Alternatives and Consequences. ADRs are immutable once accepted: a changed decision gets a new ADR that supersedes the old one, and the old one's status is updated to point to it. `docs/architecture.md` gives the current overview and links to the ADRs.

## Alternatives

- Decisions only in the spec: mixes what we build with how, and the spec should change rarely.
- Decisions in issues or chat: not versioned with the code, not visible to agents.

## Consequences

- Reviewers and agents can find why something is the way it is.
- A PR that contradicts an accepted ADR must either change course or add a superseding ADR.
