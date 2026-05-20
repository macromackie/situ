---
status: active
category: policy
created: 2026-05-13
---

# 0000. Policy: ADRs

## Context

Situ is intentionally rebuildable from architecture decisions. The active ADR
set must be enough for an agent to recreate the target backend without reading
old implementation code or derived architecture snapshots.

Historical ADRs may be preserved in `.agents/adrs_reference/` for reference.
Active decisions live only in `.agents/adrs/`.

## Decision

Active ADRs use this filename shape:

```text
NNNN-<category>-<short-title>.md
```

Filenames are part of the contract:

- `NNNN` is a four digit, unique, monotonically increasing number.
- New ADRs use the next available number.
- Do not renumber committed ADRs just to fill gaps.
- `<category>` must match the frontmatter category.
- `<short-title>` is lowercase ASCII words joined by hyphens.

Allowed categories:

- `heuristic`: decision rules for future choices
- `context`: product facts, constraints, and strategic bets
- `structure`: codebase layout and ownership boundaries
- `tooling`: developer, CI, release, debug, and command tooling
- `policy`: enforced rules and quality bars
- `contract`: exact interfaces, schemas, protocols, and command surfaces
- `feature`: product behavior and user-visible primitives

`contract` exists because rebuildability needs a place for concrete shapes that
are too detailed for broad structure ADRs and too cross-cutting for feature
ADRs.

Every ADR must have YAML frontmatter:

```yaml
---
status: active
category: contract
created: 2026-05-13
---
```

## Frontmatter

Frontmatter is required because agents and tooling should be able to classify
ADRs without parsing prose.

Allowed fields:

- `status`: `active` or `deprecated`
- `category`: one of the allowed ADR categories
- `created`: the original creation date in `YYYY-MM-DD` format

These are the only frontmatter fields for now. Add new fields only by updating
this ADR first.

`active` means the ADR describes the current target state.

`deprecated` means the ADR remains in `.agents/adrs/` only to explain a
previous active decision that should no longer guide new implementation work.
Deprecated ADRs are still part of the active ADR folder because they explain the
decision history of the current target.

`.agents/adrs_reference/` is different: it is a historical archive outside the
active decision set. Agents should not consult it unless an active ADR
explicitly says to do so.

Do not use frontmatter to track implementation state. ADRs describe the
desired end state. Current branch gaps belong in implementation plans, issues,
or task records, not in ADR metadata.

ADRs describe the target state, not a migration plan from the current branch.
If a decision needs implementation detail, include the target contract directly.
Do not write "first do X, then migrate Y" unless sequencing is itself part of
the target behavior.

ADR validation should be mechanical once tooling exists. The check should
validate filenames, duplicate numbers, category consistency, allowed
frontmatter fields, allowed statuses, valid dates, and references to missing
active ADRs.

## Consequences

An implementer should read ADRs in number order. The sequence should narrow the
space progressively:

```text
ADR policy
  -> heuristics
  -> context
  -> structure
  -> tooling and quality policy
  -> shared contracts
  -> product features
  -> eval and operational contracts
```

ADRs may include examples, tables, and pseudocode when that improves
rebuildability. Avoid turning ADRs into prose-only aspirations.

Package READMEs and tests may exist later, but the active ADRs must still
contain the core decisions needed to reconstruct those package contracts.
