---
status: active
category: structure
created: 2026-05-14
---

# 0073. Structure: Task Package Scope

## Context

ADR 0005 defines package boundaries so agents can implement one primitive at a
time without guessing about ownership.

The `tasks` package is a product primitive for task records. It is not also a
label system. Earlier wording that describes `tasks` as owning "task and label
records" creates a misleading extra primitive that is not defined by the task
feature ADRs.

Situ may use the word "label" in ordinary prose, such as "human-readable task
label" or "actor label". Those are display strings. They are not durable label
records unless a later ADR explicitly adds a label primitive.

## Decision

The `tasks` package owns task records only.

Package scope descriptions must not imply a durable label model unless the
model has its own feature or contract ADR.

Acceptable wording:

- "task records"
- "task titles"
- "human-readable task label" when referring to display text

Avoid wording:

- "task and label records"
- "label records"
- "labels package" unless a later ADR introduces that primitive

If Situ later needs labels as a first-class model, add a new ADR that defines:

- the label record schema
- ownership package
- relationship to projects, tasks, and experiments
- sync and CLI behavior

## Boundaries

This ADR does not add labels, tags, issue fields, or filters.

This ADR does not rename task titles or actor display labels.

This ADR does not require replacing ordinary prose uses of "label" when they
mean display text rather than a record.

## Required Checks

Implementation should run:

```text
bun scripts/check_adrs.ts
mise run check
git diff --check
```

## Consequences

Agents implementing the task primitive do not need to account for an implicit
label subsystem. A future label feature can still be added deliberately with
its own ADR instead of appearing as accidental package scope.
