---
status: active
category: feature
created: 2026-05-13
---

# 0016. Feature: Tasks Primitive

## Context

Tasks are the main human-like handoff primitive in Situ. A task says what needs
attention, where the context lives, who is currently responsible, and what state
the work is in.

Agents should use tasks the way humans use Linear issues: read Markdown, assign
themselves or another visible actor, move status, and leave the deeper evidence
in comments, artifacts, reviews, experiments, measurements, reports, and events.

## Decision

The `@situ/tasks` primitive package owns task records, task schema, task
repository functions, and task-local mutation helpers.

Tasks belong to projects. The package stores `projectId` as a
`SituId<"project">` but does not import `@situ/projects`.

Expected imports:

- `Database` from `bun:sqlite`
- `ActorRef`, `IsoTimestamp`, `SituId`, `SyncMetadata`, `createId`,
  `createSyncMetadata`, and `touchSyncMetadata` from `@situ/common`
- `ConflictError`, `NotFoundError`, and `ValidationError` from `@situ/errors`

## Record Shape

A task record is:

```ts
export type TaskStatus = "triage" | "backlog" | "in_progress" | "in_review" | "done" | "canceled";

export type TaskRecord = {
  readonly id: SituId<"task">;
  readonly projectId: SituId<"project">;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly status: TaskStatus;
  readonly assignedTo?: ActorRef;
  readonly createdBy: ActorRef;
  readonly metadata: SyncMetadata;
};
```

Field meaning:

- `id`: Situ-owned task id
- `projectId`: parent project id
- `title`: short human-readable task label
- `bodyMarkdown`: Markdown handoff context
- `status`: current position in the task flow
- `assignedTo`: visible actor currently responsible for the task
- `createdBy`: visible attribution for the actor that created the task
- `metadata`: shared creation/update timestamps

`title` and `bodyMarkdown` must be non-empty after trimming whitespace. Stored
values use the trimmed strings.

`assignedTo` is optional. An unassigned task can still be worked by an actor
that decides to assign it first.

## Statuses

Task statuses are deliberately simple:

- `triage`: needs clarification or routing
- `backlog`: ready for someone to pick up
- `in_progress`: an actor is actively working
- `in_review`: waiting for review or verification
- `done`: accepted as complete
- `canceled`: intentionally stopped

The tasks package does not enforce a workflow graph. Actors may move a task
between statuses in whatever order is useful. App actions, comments, reviews,
and events provide the surrounding explanation.

## Schema

The task schema fragment creates a `tasks` table:

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('triage', 'backlog', 'in_progress', 'in_review', 'done', 'canceled')
  ),
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
CREATE INDEX IF NOT EXISTS tasks_project_id_idx
  ON tasks (project_id);

CREATE INDEX IF NOT EXISTS tasks_status_idx
  ON tasks (status);

CREATE INDEX IF NOT EXISTS tasks_assigned_to_id_idx
  ON tasks (assigned_to_id);

CREATE INDEX IF NOT EXISTS tasks_project_status_idx
  ON tasks (project_id, status);
```

The exact export name is:

```ts
export const tasksSchemaFragment = {
  packageName: "tasks",
  statements: [
    createTasksTableStatement,
    createTasksProjectIdIndexStatement,
    createTasksStatusIndexStatement,
    createTasksAssignedToIdIndexStatement,
    createTasksProjectStatusIndexStatement,
  ],
} as const;
```

The task schema may reference the `projects` table by SQL name. Applying schema
fragments in the correct order is the app database layer's responsibility.

## Mutation Helpers

The package exports pure record helpers:

```ts
export type CreateTaskRecordInput = {
  readonly id?: SituId<"task">;
  readonly projectId: SituId<"project">;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly createdBy: ActorRef;
  readonly assignedTo?: ActorRef;
  readonly status?: TaskStatus;
  readonly now?: IsoTimestamp;
};

export type MoveTaskRecordInput = {
  readonly task: TaskRecord;
  readonly status: TaskStatus;
  readonly now?: IsoTimestamp;
};

export type AssignTaskRecordInput = {
  readonly task: TaskRecord;
  readonly assignedTo?: ActorRef;
  readonly now?: IsoTimestamp;
};

export function createTaskRecord(input: CreateTaskRecordInput): TaskRecord;

export function moveTaskRecord(input: MoveTaskRecordInput): TaskRecord;

export function assignTaskRecord(input: AssignTaskRecordInput): TaskRecord;
```

`createTaskRecord` generates an id with `createId({ prefix: "task" })` when one
is not provided, validates the fields, defaults `status` to `triage`, and sets
`createdAt` and `updatedAt` to the same timestamp.

Provided `id` and `projectId` are compile-time typed values and do not get
runtime prefix validation in this package.

`moveTaskRecord` preserves all fields except `status` and `updatedAt`.

`assignTaskRecord` preserves all fields except `assignedTo` and `updatedAt`.
Passing `assignedTo: undefined` unassigns the task.

Provided `now` values are passed to `createSyncMetadata({ now })` or
`touchSyncMetadata({ metadata, now })` so they are validated and normalized.
When `now` is absent, those helpers choose the current timestamp.

Actor refs are normalized by trimming `actorKind`, `actorId`, and `displayName`.
`actorKind` and `actorId` must be non-empty. `displayName` is optional but must
be non-empty when provided. Stored actor refs use trimmed values.

`assignedTo` filters are normalized the same way: `actorKind` and `actorId` are
trimmed and must be non-empty.

Validation failures throw `ValidationError`.

## Repository

The package exports a SQLite repository:

```ts
export type CreateTaskRepositoryInput = {
  readonly database: Database;
};

export type ListTasksInput = {
  readonly projectId?: SituId<"project">;
  readonly status?: TaskStatus;
  readonly assignedTo?: {
    readonly actorKind: ActorRef["actorKind"];
    readonly actorId: string;
  };
};

export type CreateTaskInput = Omit<CreateTaskRecordInput, "id"> & {
  readonly id?: SituId<"task">;
};

export type MoveTaskInput = {
  readonly id: SituId<"task">;
  readonly status: TaskStatus;
  readonly now?: IsoTimestamp;
};

export type AssignTaskInput = {
  readonly id: SituId<"task">;
  readonly assignedTo?: ActorRef;
  readonly now?: IsoTimestamp;
};

export type TaskRepository = {
  readonly create: (input: CreateTaskInput) => TaskRecord;
  readonly getById: (input: { readonly id: SituId<"task"> }) => TaskRecord | undefined;
  readonly list: (input?: ListTasksInput) => readonly TaskRecord[];
  readonly move: (input: MoveTaskInput) => TaskRecord;
  readonly assign: (input: AssignTaskInput) => TaskRecord;
};

export function createTaskRepository(input: CreateTaskRepositoryInput): TaskRepository;
```

The repository accepts a `Database` from the caller. It must not open its own
database connection.

`create` inserts the task and returns the stored record. Duplicate ids throw
`ConflictError`. Foreign-key failures for missing parent projects also throw
`ConflictError`. Invalid caller inputs throw `ValidationError`. Unexpected
SQLite failures may surface as ordinary database errors.

`getById` returns `undefined` when a task does not exist.

`list` returns tasks ordered by `created_at ASC, id ASC`. Filters are optional
and combine with `AND` when more than one is provided. When `assignedTo` is
provided, both actor kind and actor id are used in the filter.

`move` and `assign` throw `NotFoundError` when the task does not exist.
Otherwise they update the row and return the mapped persisted record.

Repository methods do not create transactions themselves. App actions own outer
transactions when a write spans multiple primitives. Repository methods return
the mapped persisted row shape after writes.

Repository row mapping is:

- `id` maps to `TaskRecord.id`
- `project_id` maps to `TaskRecord.projectId`
- `title` maps to `TaskRecord.title`
- `body_markdown` maps to `TaskRecord.bodyMarkdown`
- `status` maps to `TaskRecord.status`
- `assigned_to_kind` maps to `TaskRecord.assignedTo.actorKind`
- `assigned_to_id` maps to `TaskRecord.assignedTo.actorId`
- `assigned_to_display_name` maps to `TaskRecord.assignedTo.displayName`
- `created_by_kind` maps to `TaskRecord.createdBy.actorKind`
- `created_by_id` maps to `TaskRecord.createdBy.actorId`
- `created_by_display_name` maps to `TaskRecord.createdBy.displayName`
- `created_at` maps to `TaskRecord.metadata.createdAt`
- `updated_at` maps to `TaskRecord.metadata.updatedAt`

When an actor ref is `undefined`, the repository stores SQL `NULL` for its
columns. When reading SQL `NULL`, the repository returns `undefined`.

## Boundaries

Do not add comments, notifications, events, reviews, experiments, measurements,
or artifact behavior to the tasks package. Cross-primitive behavior belongs in
app actions.

Do not add provider sessions, workers, leases, scheduler state, or hidden
runtime handles to tasks.

Do not enforce a rigid status-transition graph in the tasks package.

## Consequences

Tasks become the main visible handoff surface. A later app action can create a
task, assign it, move the task, emit events, and create notifications while the
tasks package remains a small primitive.
