---
status: active
category: policy
created: 2026-05-14
---

# 0083. Policy: Target-State ADR Prose

## Context

Situ's active ADRs are meant to guide a fresh rebuild. An implementer should be
able to read them in order without knowing the current branch, old code shape,
or off-thread planning history.

ADR 0000 already says ADRs describe target state instead of migration steps.
This ADR makes that prose standard more concrete for future edits.

## Decision

Active ADRs must describe the intended target state and allowed behavior. They
should not read like instructions for moving from one branch shape to another.

Prefer:

```text
The action context API lives in `projects/app/src/actions/context.ts`.
```

Avoid:

```text
If the current implementation lives in another file, move it.
```

Prefer:

```text
The app structure includes `src/sync/` as the sync protocol adapter layer.
```

Avoid:

```text
Update an earlier ADR so the app structure includes `src/sync/`.
```

Active ADRs should not rely on phrases such as:

- `current implementation`
- `currently describes`
- `before this ADR`
- `Update ADR`
- `move it`
- `already satisfied`
- `implementation progress`

Some time-relative words are still fine when they describe product semantics or
permanent contracts. For example, "already processed mutation id", "already
read notification", "currently responsible actor", and "existing local
repository" are domain concepts rather than branch-local migration notes.

Scope phrases such as "in this ADR" are allowed when they make a decision
boundary clear. Prefer target-state wording when the sentence can be made just
as clear without referencing implementation sequencing.

## Verification

ADR review should include a prose scan for branch-local migration wording.
When such wording appears, either:

- rewrite it into target-state language, or
- keep it only if it clearly describes product semantics, protocol semantics,
  or a permanent decision boundary.

Documentation-only ADR changes should still run ADR validation,
markdownlint, typos, and whitespace checks.

## Consequences

The active ADR set remains readable as a rebuild specification instead of a
diary of how the current branch reached its state.

Later agents can make code changes from the ADRs without needing hidden context
about earlier implementation layouts.
