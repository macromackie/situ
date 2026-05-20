---
status: active
category: policy
created: 2026-05-14
---

# 0079. Policy: Event Emission

## Context

Events are Situ's append-only timeline primitive. Early context ADRs describe
events as audit records for meaningful product changes. Later feature ADRs
intentionally make some actions emit events while other visible record actions
do not.

Without a single policy, a reimplementation can over-emit timeline records for
every write or under-emit events for state transitions that need visible
history.

## Decision

Events are explicit product records.

Automatic event emission is reserved for product actions where the event is the
human-readable history of a state transition or ownership transition that would
otherwise be hard to understand from the final record alone.

Actions that automatically emit one event:

- project creation
- project archive
- task creation
- task status movement
- task assignment changes
- experiment creation
- experiment status movement
- experiment assignment changes
- experiment revision

Actions that do not automatically emit events:

- comment creation
- notification creation, read, or dismissal
- measurement creation
- artifact reference creation
- local artifact file capture
- review creation
- report record creation
- event creation itself
- read/list/get actions
- report generation that only returns Markdown
- Replicache pull

Passive record creation is already visible through its own primitive. For
example, creating a review creates a review record; creating a report creates a
report record; capturing a file creates an artifact record. If a caller wants a
separate timeline note, it should create an `events.create` record explicitly.

Sync mutators follow the same rule:

- mutators that delegate to project, task, or experiment transition helpers
  preserve those helpers' automatic events
- passive record mutators do not add automatic events
- `events.create` creates exactly the caller-supplied event and no extra event

## Boundaries

This ADR does not add event kinds, workflow statuses, or event schemas.

This ADR does not require automatic events for every durable record write.

This ADR does not remove explicit timeline notes. Actors may create ordinary
event records whenever a visible timeline note is useful.

This ADR does not make events a job queue, scheduler state, lease, or hidden
workflow edge.

## Required Checks

Implementation should run:

```text
bun scripts/check_adrs.ts
mise run check
git diff --check
```

## Consequences

Reimplementers get a concrete emission rule. Situ keeps important status and
ownership transitions visible without duplicating every passive record write in
the timeline.
