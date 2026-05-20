---
status: active
category: feature
created: 2026-05-13
---

# 0020. Feature: Experiments Primitive

## Context

Experiments are Situ's candidate attempts at improving a repository for a task.
They make the autoresearch loop concrete: an actor can propose a candidate,
work on it in a branch or worktree, record measurements and artifacts against
it, ask for review, revise it, and eventually accept, reject, or abandon it.

An experiment should feel like a lightweight pull-request-shaped product
record, not a hidden workflow run. It holds enough structured state to filter,
resume, compare, and review candidate work while leaving detailed evidence in
comments, measurements, artifacts, reviews, reports, and events.

## Decision

The `@situ/experiments` primitive package owns experiment records, experiment
schema, experiment repository functions, and experiment-local mutation helpers.

Experiments belong to a project and a task. The package stores `projectId` as a
`SituId<"project">` and `taskId` as a `SituId<"task">` but does not import
`@situ/projects` or `@situ/tasks`.

Expected imports:

- `Database` from `bun:sqlite`
- `ActorRef`, `IsoTimestamp`, `SituId`, `SyncMetadata`, `createId`,
  `createSyncMetadata`, and `touchSyncMetadata` from `@situ/common`
- `ConflictError`, `NotFoundError`, and `ValidationError` from `@situ/errors`

## Record Shape

An experiment record is:

```ts
export type ExperimentStatus =
  | "planned"
  | "running"
  | "ready_for_review"
  | "accepted"
  | "rejected"
  | "abandoned";

export type ExperimentRecord = {
  readonly id: SituId<"experiment">;
  readonly projectId: SituId<"project">;
  readonly taskId: SituId<"task">;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly status: ExperimentStatus;
  readonly revisionNumber: number;
  readonly baseRef?: string;
  readonly branchName?: string;
  readonly worktreePath?: string;
  readonly assignedTo?: ActorRef;
  readonly createdBy: ActorRef;
  readonly metadata: SyncMetadata;
};
```

Field meaning:

- `id`: Situ-owned experiment id
- `projectId`: parent project id
- `taskId`: task this candidate work is trying to address
- `title`: short human-readable candidate label
- `summaryMarkdown`: Markdown explanation of the hypothesis, approach, or
  current state
- `status`: current position of the candidate work
- `revisionNumber`: visible candidate revision number, starting at `1`
- `baseRef`: optional git base reference used for the candidate
- `branchName`: optional git branch name for the candidate
- `worktreePath`: optional local worktree path for the candidate
- `assignedTo`: visible actor currently responsible for the experiment
- `createdBy`: visible attribution for the actor that created the experiment
- `metadata`: shared creation/update timestamps

`title` and `summaryMarkdown` must be non-empty after trimming whitespace.
`baseRef`, `branchName`, and `worktreePath`, when provided, must be non-empty
after trimming whitespace. Stored values use the trimmed strings.

## Statuses

Experiment statuses are deliberately simple:

- `planned`: proposed but not actively being worked
- `running`: actively being explored or changed
- `ready_for_review`: waiting for review or verification
- `accepted`: chosen as useful for the task or project
- `rejected`: reviewed or measured and not chosen
- `abandoned`: intentionally stopped without a reject decision

The experiments package does not enforce a workflow graph. Actors may move an
experiment between statuses in whatever order is useful. Comments, reviews,
measurements, artifacts, and events provide the surrounding explanation.

## Revisions

`revisionNumber` is the visible counter for meaningful changes to a candidate
experiment. It starts at `1`.

When an actor responds to feedback, fixes a bug on the same branch, changes the
approach, updates the candidate summary, or resubmits for review, the app can
record a new revision on the same experiment. This preserves the human-like
continuity of "the same person continues the same candidate" without requiring
a new hidden workflow run.

The experiment package stores only the latest experiment fields plus the latest
`revisionNumber`. Historical detail belongs in comments, events, measurements,
artifacts, reviews, and reports that reference the experiment and, when needed,
the revision number.

## Schema

The experiment schema fragment creates an `experiments` table:

```sql
CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary_markdown TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'planned',
      'running',
      'ready_for_review',
      'accepted',
      'rejected',
      'abandoned'
    )
  ),
  revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
  base_ref TEXT,
  branch_name TEXT,
  worktree_path TEXT,
  assigned_to_kind TEXT,
  assigned_to_id TEXT,
  assigned_to_display_name TEXT,
  created_by_kind TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (assigned_to_kind IS NULL AND assigned_to_id IS NULL AND assigned_to_display_name IS NULL)
    OR (assigned_to_kind IS NOT NULL AND assigned_to_id IS NOT NULL)
  )
);
```

It also creates these indexes:

```sql
CREATE INDEX IF NOT EXISTS experiments_project_id_idx
  ON experiments (project_id);

CREATE INDEX IF NOT EXISTS experiments_task_id_idx
  ON experiments (task_id);

CREATE INDEX IF NOT EXISTS experiments_status_idx
  ON experiments (status);

CREATE INDEX IF NOT EXISTS experiments_assigned_to_id_idx
  ON experiments (assigned_to_id);

CREATE INDEX IF NOT EXISTS experiments_task_status_idx
  ON experiments (task_id, status);
```

The exact export name is:

```ts
export const experimentsSchemaFragment = {
  packageName: "experiments",
  statements: [
    createExperimentsTableStatement,
    createExperimentsProjectIdIndexStatement,
    createExperimentsTaskIdIndexStatement,
    createExperimentsStatusIndexStatement,
    createExperimentsAssignedToIdIndexStatement,
    createExperimentsTaskStatusIndexStatement,
  ],
} as const;
```

The individual schema statement constants shown above are exported.

The experiment schema may reference the `projects` and `tasks` tables by SQL
name. Applying schema fragments in the correct order is the app database layer's
responsibility. The schema does not enforce that `project_id` matches the
project of `task_id`; app actions own that cross-record invariant.

Foreign-key checks rely on the caller-provided SQLite connection having
`PRAGMA foreign_keys = ON`. The app database layer owns that setting. Tests that
exercise foreign-key behavior should enable it on the in-memory database before
creating records.

## Mutation Helpers

The package exports record helpers:

```ts
export type CreateExperimentRecordInput = {
  readonly id?: SituId<"experiment">;
  readonly projectId: SituId<"project">;
  readonly taskId: SituId<"task">;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly createdBy: ActorRef;
  readonly assignedTo?: ActorRef;
  readonly status?: ExperimentStatus;
  readonly baseRef?: string;
  readonly branchName?: string;
  readonly worktreePath?: string;
  readonly now?: IsoTimestamp;
};

export type MoveExperimentRecordInput = {
  readonly experiment: ExperimentRecord;
  readonly status: ExperimentStatus;
  readonly now?: IsoTimestamp;
};

export type AssignExperimentRecordInput = {
  readonly experiment: ExperimentRecord;
  readonly assignedTo?: ActorRef;
  readonly now?: IsoTimestamp;
};

export type ReviseExperimentRecordInput = {
  readonly experiment: ExperimentRecord;
  readonly summaryMarkdown?: string;
  readonly status?: ExperimentStatus;
  readonly baseRef?: string;
  readonly clearBaseRef?: boolean;
  readonly branchName?: string;
  readonly clearBranchName?: boolean;
  readonly worktreePath?: string;
  readonly clearWorktreePath?: boolean;
  readonly now?: IsoTimestamp;
};

export function createExperimentRecord(input: CreateExperimentRecordInput): ExperimentRecord;

export function moveExperimentRecord(input: MoveExperimentRecordInput): ExperimentRecord;

export function assignExperimentRecord(input: AssignExperimentRecordInput): ExperimentRecord;

export function reviseExperimentRecord(input: ReviseExperimentRecordInput): ExperimentRecord;
```

`createExperimentRecord` generates an id with `createId({ prefix: "experiment" })`
when one is not provided, validates fields, defaults `status` to `planned`,
sets `revisionNumber` to `1`, and sets `createdAt` and `updatedAt` to the same
timestamp.

Provided `id`, `projectId`, and `taskId` are compile-time typed values and do
not get runtime prefix validation in this package.

`moveExperimentRecord` preserves all fields except `status` and `updatedAt`.

`assignExperimentRecord` preserves all fields except `assignedTo` and
`updatedAt`. Passing `assignedTo: undefined` unassigns the experiment.

`reviseExperimentRecord` increments `revisionNumber` by `1` and touches
`updatedAt`. Optional `summaryMarkdown`, `status`, `baseRef`, `branchName`, and
`worktreePath` replace the existing values only when provided. Undefined
optional revision inputs leave the existing value unchanged.

`clearBaseRef`, `clearBranchName`, and `clearWorktreePath` explicitly clear
their matching optional field when set to `true`. A clear flag and a replacement
value for the same field must not both be provided in the same revision input.

`reviseExperimentRecord` must receive at least one meaningful revision change:
`summaryMarkdown`, `status`, `baseRef`, `branchName`, `worktreePath`, or one of
the clear flags set to `true`. Calling revise with no meaningful change throws
`ValidationError`.

Provided `now` values are passed to `createSyncMetadata({ now })` or
`touchSyncMetadata({ metadata, now })` so they are validated and normalized.
When `now` is absent, those helpers choose the current timestamp.

Actor refs are normalized by trimming `actorKind`, `actorId`, and `displayName`.
`actorKind` and `actorId` must be non-empty. `displayName` is optional but must
be non-empty when provided. Stored actor refs use trimmed values.

`assignedTo` filters are normalized the same way: `actorKind` and `actorId` are
trimmed and must be non-empty.

Runtime validation scope:

- `title`: trimmed and required to be non-empty
- `summaryMarkdown`: trimmed and required to be non-empty when created or
  provided to `reviseExperimentRecord`
- `status`: required to be one of the experiment statuses when created, moved,
  listed, or provided to `reviseExperimentRecord`
- `baseRef`: trimmed and required to be non-empty when provided
- `branchName`: trimmed and required to be non-empty when provided
- `worktreePath`: trimmed and required to be non-empty when provided
- clear flags: optional booleans; only `true` has semantic effect
- actor refs: trimmed and required as described above
- `projectId`, `taskId`, and `id`: not runtime-validated beyond TypeScript

The TypeScript types describe the supported caller contract. Runtime validation
is intentionally focused on the fields listed above. The package is not a
general-purpose runtime schema parser for arbitrary JavaScript values. Invalid
values caught by the field validation above throw `ValidationError`; other
wrong primitive types may surface as ordinary JavaScript or database errors.

## Repository

The package exports a SQLite repository:

```ts
export type CreateExperimentRepositoryInput = {
  readonly database: Database;
};

export type ListExperimentsInput = {
  readonly projectId?: SituId<"project">;
  readonly taskId?: SituId<"task">;
  readonly status?: ExperimentStatus;
  readonly assignedTo?: {
    readonly actorKind: ActorRef["actorKind"];
    readonly actorId: string;
  };
};

export type CreateExperimentInput = Omit<CreateExperimentRecordInput, "id"> & {
  readonly id?: SituId<"experiment">;
};

export type MoveExperimentInput = {
  readonly id: SituId<"experiment">;
  readonly status: ExperimentStatus;
  readonly now?: IsoTimestamp;
};

export type AssignExperimentInput = {
  readonly id: SituId<"experiment">;
  readonly assignedTo?: ActorRef;
  readonly now?: IsoTimestamp;
};

export type ReviseExperimentInput = {
  readonly id: SituId<"experiment">;
  readonly summaryMarkdown?: string;
  readonly status?: ExperimentStatus;
  readonly baseRef?: string;
  readonly clearBaseRef?: boolean;
  readonly branchName?: string;
  readonly clearBranchName?: boolean;
  readonly worktreePath?: string;
  readonly clearWorktreePath?: boolean;
  readonly now?: IsoTimestamp;
};

export type ExperimentRepository = {
  readonly create: (input: CreateExperimentInput) => ExperimentRecord;
  readonly getById: (input: { readonly id: SituId<"experiment"> }) => ExperimentRecord | undefined;
  readonly list: (input?: ListExperimentsInput) => readonly ExperimentRecord[];
  readonly move: (input: MoveExperimentInput) => ExperimentRecord;
  readonly assign: (input: AssignExperimentInput) => ExperimentRecord;
  readonly revise: (input: ReviseExperimentInput) => ExperimentRecord;
};

export function createExperimentRepository(
  input: CreateExperimentRepositoryInput,
): ExperimentRepository;
```

The repository accepts a `Database` from the caller. It must not open its own
database connection.

`create` inserts the experiment and returns the stored record. Duplicate ids
throw `ConflictError`. Foreign-key failures for missing parent projects or
tasks also throw `ConflictError`. Invalid caller inputs throw `ValidationError`.
Unexpected SQLite failures may surface as ordinary database errors.

`getById` returns `undefined` when an experiment does not exist.

`list` returns experiments ordered by `created_at ASC, id ASC`. Filters are
optional and combine with `AND` when more than one is provided. When
`assignedTo` is provided, both actor kind and actor id are used in the filter.

`move`, `assign`, and `revise` throw `NotFoundError` when the experiment does
not exist. Otherwise they update the row and return the mapped persisted
record.

`revise` increments the persisted `revision_number` by one. Optional
`summaryMarkdown`, `status`, `baseRef`, `branchName`, and `worktreePath` update
the persisted row only when provided. Undefined optional revision inputs leave
the persisted values unchanged. Clear flags explicitly set their matching
persisted field to SQL `NULL`. Calling `revise` with no meaningful revision
change throws `ValidationError`.

Repository methods do not create transactions themselves. App actions own outer
transactions when a write spans multiple primitives. Repository methods return
the mapped persisted row shape after writes.

Repository row mapping is:

- `id` maps to `ExperimentRecord.id`
- `project_id` maps to `ExperimentRecord.projectId`
- `task_id` maps to `ExperimentRecord.taskId`
- `title` maps to `ExperimentRecord.title`
- `summary_markdown` maps to `ExperimentRecord.summaryMarkdown`
- `status` maps to `ExperimentRecord.status`
- `revision_number` maps to `ExperimentRecord.revisionNumber`
- `base_ref` maps to `ExperimentRecord.baseRef`
- `branch_name` maps to `ExperimentRecord.branchName`
- `worktree_path` maps to `ExperimentRecord.worktreePath`
- `assigned_to_kind` maps to `ExperimentRecord.assignedTo.actorKind`
- `assigned_to_id` maps to `ExperimentRecord.assignedTo.actorId`
- `assigned_to_display_name` maps to `ExperimentRecord.assignedTo.displayName`
- `created_by_kind` maps to `ExperimentRecord.createdBy.actorKind`
- `created_by_id` maps to `ExperimentRecord.createdBy.actorId`
- `created_by_display_name` maps to `ExperimentRecord.createdBy.displayName`
- `created_at` maps to `ExperimentRecord.metadata.createdAt`
- `updated_at` maps to `ExperimentRecord.metadata.updatedAt`

When an actor ref or optional string field is `undefined`, the repository stores
SQL `NULL` for its columns. When reading SQL `NULL`, the repository returns
`undefined`.

Only duplicate primary-key failures for `experiments.id` and foreign-key
failures for missing parent project or task rows during `create` are translated
to `ConflictError`; other unexpected SQLite constraint failures may surface as
ordinary database errors.

## Boundaries

Do not add measurements, artifacts, reviews, comments, notifications, events,
report generation, git command execution, or target existence checks beyond
database foreign keys to the experiments package. Cross-primitive behavior
belongs in app actions.

Do not add provider sessions, workers, leases, scheduler state, hidden runtime
handles, or model conversation state to experiments.

Do not enforce a rigid status-transition graph in the experiments package.

Do not store historical revision bodies in the experiments table. Use comments,
events, measurements, artifacts, reviews, and reports for historical evidence.

## Consequences

Experiments become the visible candidate-work primitive. A later app action can
create an experiment, create a worktree, emit events, attach measurements and
artifacts, request review, and create notifications while the experiments
package remains a small primitive.
