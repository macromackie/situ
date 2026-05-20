---
status: active
category: feature
created: 2026-05-13
---

# 0041. Feature: Maintenance Inspection

## Context

Situ runs as a local stateful app that external agent CLIs can use as a shared
work surface.

The app needs a reusable way to inspect local state and notice stale work
without turning maintenance into a hidden workflow engine. Product-facing
surfaces such as `situ status` can use this behavior while still leaving the
local agent to decide what to do by creating comments, moving tasks, assigning
records, or recording evidence through normal primitives.

## Decision

Add read-only maintenance inspection under `projects/app/src/maintenance/`.

Maintenance inspection answers:

- how many durable records exist by primitive
- how task and experiment records are distributed by status
- how many notifications are unread, read, and dismissed
- which assigned tasks or experiments appear stale

Inspection must not:

- create maintenance records
- claim, reassign, dismiss, or move work
- execute git commands or local agent CLIs
- implement a scheduler, worker, lease, heartbeat, or hidden retry loop

Maintenance is a visible query surface over existing records. Follow-up action
uses the same project, task, comment, event, notification, experiment, review,
and report primitives agents already use.

Read-only means maintenance inspection must not mutate domain records.

## Stale Work

A stale assignment is an assigned task or assigned experiment whose status still
means active human-like attention is expected and whose `updatedAt` timestamp is
older than the configured threshold.

Task statuses considered active for staleness are:

- `in_progress`
- `in_review`

Experiment statuses considered active for staleness are:

- `running`
- `ready_for_review`

The default stale threshold is 24 hours.
The comparison is strictly older than the threshold; work exactly at the
threshold is not stale.

Callers may pass:

- `now`: ISO timestamp used for deterministic inspection
- `staleAfterHours`: positive number of hours before active assigned work is
  considered stale

## Inspection Result

The maintenance module should expose an inspection function that returns plain
structured data:

```ts
type PrimitiveRecordCounts = {
  readonly projects: number;
  readonly tasks: number;
  readonly comments: number;
  readonly events: number;
  readonly notifications: number;
  readonly experiments: number;
  readonly measurements: number;
  readonly artifacts: number;
  readonly reviews: number;
  readonly reports: number;
};

type TaskStatusCounts = {
  readonly triage: number;
  readonly backlog: number;
  readonly in_progress: number;
  readonly in_review: number;
  readonly done: number;
  readonly canceled: number;
};

type ExperimentStatusCounts = {
  readonly planned: number;
  readonly running: number;
  readonly ready_for_review: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly abandoned: number;
};

type MaintenanceInspection = {
  readonly generatedAt: IsoTimestamp;
  readonly staleAfterHours: number;
  readonly records: PrimitiveRecordCounts;
  readonly tasks: TaskStatusCounts;
  readonly experiments: ExperimentStatusCounts;
  readonly notifications: {
    readonly unread: number;
    readonly read: number;
    readonly dismissed: number;
  };
  readonly staleAssignments: readonly StaleAssignment[];
};

type StaleTaskAssignment = {
  readonly target: {
    readonly targetKind: "task";
    readonly targetId: SituId<"task">;
  };
  readonly projectId: SituId<"project">;
  readonly title: string;
  readonly status: "in_progress" | "in_review";
  readonly assignedTo: ActorRef;
  readonly updatedAt: IsoTimestamp;
  readonly ageHours: number;
};

type StaleExperimentAssignment = {
  readonly target: {
    readonly targetKind: "experiment";
    readonly targetId: SituId<"experiment">;
  };
  readonly projectId: SituId<"project">;
  readonly taskId: SituId<"task">;
  readonly title: string;
  readonly status: "running" | "ready_for_review";
  readonly assignedTo: ActorRef;
  readonly updatedAt: IsoTimestamp;
  readonly ageHours: number;
};

type StaleAssignment = StaleTaskAssignment | StaleExperimentAssignment;
```

Counts include every listed key even when the count is zero.

Notification state counts are mutually exclusive. `dismissedAt` wins over
`readAt`; a dismissed notification is counted as dismissed whether or not it was
also read. A notification with `readAt` and no `dismissedAt` is read. A
notification with neither timestamp is unread.

The result should be deterministic for a fixed database state and fixed `now`.
Status count objects use the key order shown above. Stale assignments sort by
oldest `updatedAt` first, then `target.targetKind`, then `target.targetId`.
`ageHours` is rounded down to two decimal places.

The maintenance module may use direct SQL against package-owned tables for
aggregate counts and stale assignment scans. It must not redefine product
schemas or bypass repositories for writes.

## Consequences

Maintenance remains another way to read the same primitives, not a separate
workflow system.

Agents use simpler CLI surfaces such as `situ status` for auto-research loops.
Maintenance inspection remains a reusable app API for stale-work semantics, but
the app does not decide who should do the work or how it should be fixed.
