---
status: active
category: feature
created: 2026-05-15
---

# 0095. Feature: Baselines Primitive

## Context

Autoresearch needs a durable reference point before candidate experiments fan
out. The reference point cannot be hard-coded into an eval harness because each
research world may define "baseline" differently:

- a current test-suite pass rate
- a native benchmark score
- a loss or accuracy from an existing model
- a latency or throughput measurement
- an observed manual behavior that future candidates should preserve

Situ should provide the human-like primitive. Agents decide how to establish
the baseline, run the appropriate local commands or observations, then record a
baseline and its measurements through ordinary Situ records.

Classic Situ had a useful `baselines` record, but the new app should keep the
shape smaller and avoid a setup workflow gate. A baseline is a visible record,
not a hidden workflow run.

## Decision

The `@situ/baselines` primitive package owns baseline records, baseline schema,
baseline repository functions, and baseline-local mutation helpers.

Baselines belong to a project. A baseline may optionally belong to a task when
the reference is task-local.

Expected imports:

- `Database` from `bun:sqlite`
- `ActorRef`, `IsoTimestamp`, `SituId`, `SyncMetadata`, `createId`,
  `createSyncMetadata`, and `touchSyncMetadata` from `@situ/common`
- `ConflictError`, `NotFoundError`, and `ValidationError` from `@situ/errors`

## Record Shape

A baseline record is:

```ts
export type BaselineStatus = "active" | "superseded" | "abandoned";

export type BaselineRecord = {
  readonly id: SituId<"baseline">;
  readonly projectId: SituId<"project">;
  readonly taskId?: SituId<"task">;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly status: BaselineStatus;
  readonly createdBy: ActorRef;
  readonly metadata: SyncMetadata;
};
```

Field meaning:

- `id`: Situ-owned baseline id
- `projectId`: project this reference point belongs to
- `taskId`: optional task this reference point is scoped to
- `title`: short human-readable baseline label
- `summaryMarkdown`: Markdown explanation of what was measured, how it was
  measured, assumptions, and comparison notes
- `status`: whether this baseline is the active reference, has been replaced,
  or was abandoned
- `createdBy`: visible attribution for the actor that created the baseline
- `metadata`: shared creation/update timestamps

`title` and `summaryMarkdown` must be non-empty after trimming whitespace.
Stored values use the trimmed strings.

## Statuses

Baseline statuses are deliberately minimal:

- `active`: usable as a comparison reference
- `superseded`: replaced by a newer or more appropriate baseline
- `abandoned`: intentionally stopped or invalidated without replacement

The baseline package does not enforce a workflow graph. Actors may move a
baseline between statuses in whatever order is useful. Comments, events,
measurements, reviews, reports, and later tasks explain why.

Do not add a `confirmed`, `submitted`, `done`, or phase-specific status to
baselines. If a product flow needs user confirmation, represent that with a
task, comment, notification, or review around the baseline rather than adding a
baseline-specific workflow.

## Schema

The baseline schema fragment creates a `baselines` table:

```sql
CREATE TABLE IF NOT EXISTS baselines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary_markdown TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('active', 'superseded', 'abandoned')
  ),
  created_by_kind TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

It also creates indexes for project, task, status, and project/status listing.

The baseline schema may reference the `projects` and `tasks` tables by SQL
name. Applying schema fragments in the correct order is the app database layer's
responsibility.

Foreign-key checks rely on the caller-provided SQLite connection having
`PRAGMA foreign_keys = ON`.

## Repository

The package exports:

```ts
export type CreateBaselineInput = {
  readonly id?: SituId<"baseline">;
  readonly projectId: SituId<"project">;
  readonly taskId?: SituId<"task">;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly status?: BaselineStatus;
  readonly createdBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export type ListBaselinesInput = {
  readonly projectId?: SituId<"project">;
  readonly taskId?: SituId<"task">;
  readonly status?: BaselineStatus;
};

export type MoveBaselineInput = {
  readonly id: SituId<"baseline">;
  readonly status: BaselineStatus;
  readonly now?: IsoTimestamp;
};

export type BaselineRepository = {
  readonly create: (input: CreateBaselineInput) => BaselineRecord;
  readonly getById: (input: { readonly id: SituId<"baseline"> }) => BaselineRecord | undefined;
  readonly list: (input?: ListBaselinesInput) => readonly BaselineRecord[];
  readonly move: (input: MoveBaselineInput) => BaselineRecord;
};
```

`list` returns baselines ordered by `created_at ASC, id ASC`.

Duplicate ids and foreign-key failures during `create` throw `ConflictError`.
Missing baselines during `move` throw `NotFoundError`. Invalid caller inputs
throw `ValidationError`.

## App Actions And CLI

The app composes `@situ/baselines` into the normal repository context.

The CLI exposes:

```text
situ baselines create
situ baselines list
situ baselines get
situ baselines move
```

`baselines create` creates a baseline and a baseline-targeted event in one app
transaction. It requires:

- `--project-id`
- `--title`
- `--summary`
- `--actor-kind`
- `--actor-id`

It accepts:

- `--id`
- `--event-id`
- `--task-id`
- `--status`
- `--actor-display-name`
- `--now`

`baselines list` accepts optional `--project-id`, `--task-id`, and `--status`
filters.

`baselines move` updates the status and records a baseline-targeted event.

## Replicache Sync

Baselines are visible product records, so the local Replicache surface supports
them the same way it supports projects, tasks, experiments, and evidence.

Supported push mutators:

```text
baselines.create
baselines.move
```

`baselines.create` accepts the same required and optional fields as
`baselines create`, including caller-provided `id` and optional `eventId`.
`baselines.move` accepts `id`, `status`, `actor`, optional `eventId`, and
optional `now`.

Push validation uses the `BaselineStatus` set from this ADR and treats
malformed baseline args as permanent mutation errors under the existing
Replicache push contract.

Pull includes baseline records at stable keys:

```text
baselines/<baselineId>
```

The reset patch emits baselines after tasks and before experiments so agents
can see project/task context, then baseline references, then candidate
experiments and evidence.

## Measurement Relationship

Baseline metrics are ordinary measurements. ADR 0021 defines measurement target
semantics:

```text
Measurement
  -> exactly one of:
       baselineId
       experimentId + revisionNumber
```

This keeps baselines generic. Situ does not know whether a metric is accuracy,
loss, pass rate, latency, or any other research-world-specific value.

## Evals

Real autoresearch evals should score baseline behavior through Situ records:

- a baseline record exists before candidate experiment fan-out
- baseline measurements exist
- candidate experiment measurements use comparable metric names
- reports, reviews, or final artifacts explain candidate performance relative
  to the baseline

The eval harness may provide a workspace objective and useful commands, but it
must not hard-code a baseline parser as the product behavior being tested.
Agents establish baselines dynamically and record the results through Situ.

## Boundaries

Do not add baseline activities, baseline-specific comments, baseline-specific
reviews, or a setup confirmation workflow in this ADR. Existing comments,
events, notifications, reviews, reports, and tasks are the surrounding human
primitives.

Do not add evaluation/comparison records in this ADR. Reports and reviews can
compare baselines and experiments until a later ADR proves that a first-class
comparison primitive is necessary.

Do not put command execution, metric parsing, worktree management, agents,
leases, schedulers, or provider sessions in the baselines package.

## Required Checks

Implementation should run:

```text
bun scripts/check_adrs.ts
bun test projects/app/packages/baselines/tests/baselines.test.ts
bun test projects/app/packages/measurements/tests/measurements.test.ts
bun test projects/app/src/actions/baselines.test.ts
bun test projects/app/src/actions/measurements.test.ts
bun test projects/app/src/cli/situ.test.ts
bun x tsgo --noEmit -p tsconfig.json
mise run check
git diff --check
```

## Consequences

Situ gets a simple, human-like reference record:

```text
Baseline
  -> Measurements
  -> candidate Tasks and Experiments compare against it
  -> Reports and Reviews explain what changed
```

This preserves the Linear-like shape. Agents use visible records and Markdown
instead of hidden harness state or workflow-specific schemas.
