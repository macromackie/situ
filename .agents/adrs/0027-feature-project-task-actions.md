---
status: active
category: feature
created: 2026-05-13
---

# 0027. Feature: Project and Task Actions

## Context

Primitive repositories preserve individual records. The app still needs
slightly higher-level actions for the most common collaboration loop:

```text
create a project
  -> create tasks
  -> assign or claim tasks
  -> move tasks through visible statuses
  -> archive projects when they are no longer active
```

These actions should feel like ordinary product actions, not workflow steps.
They compose repositories, own transaction boundaries for multi-record writes,
and leave events that make important state changes visible.

## Decision

`projects/app/src/actions/` owns project and task app actions.

Project and task actions use the `AppActionContext` from ADR 0025. They should
not open databases, parse CLI arguments, render HTTP responses, start agents,
or define new product records.

Expected files:

```text
projects/app/src/actions/context.ts
projects/app/src/actions/context.test.ts
projects/app/src/actions/projects.ts
projects/app/src/actions/tasks.ts
projects/app/src/actions/index.ts
projects/app/src/actions/projects.test.ts
projects/app/src/actions/tasks.test.ts
```

The action context API from ADR 0025 lives in
`projects/app/src/actions/context.ts` with the same public API.

`projects/app/src/actions/index.ts` is an export barrel. It must export the
action context API from `./context.js` and the project/task actions from this
ADR.

Expected imports:

- `ActorRef`, `IsoTimestamp`, and `SituId` from `@situ/common`
- `EventRecord` from `@situ/events`
- `ProjectRecord`, `ProjectStatus`, and `CreateProjectInput` from
  `@situ/projects`
- `NotificationRecord` from `@situ/notifications`
- `TaskRecord`, `TaskStatus`, `CreateTaskInput`, `ListTasksInput`,
  `MoveTaskInput`, and `AssignTaskInput` from `@situ/tasks`
- `AppActionContext` and `runAppTransaction` from `./context.js`

The minimal action context API needed by this ADR is:

```ts
export type AppActionContext = {
  readonly database: Database;
  readonly repositories: AppRepositories;
};

export function runAppTransaction<T>(input: {
  readonly context: AppActionContext;
  readonly run: (context: AppActionContext) => T;
}): T;
```

Write actions must use this shape:

```ts
return runAppTransaction({
  context: input.context,
  run: (context) => {
    const record = context.repositories.somePrimitive.write(...);
    const event = context.repositories.events.create(...);

    return { record, event };
  },
});
```

Inside the callback, use the transaction callback `context`, not
`input.context`, so primary writes and event writes share the same transaction
database handle.

## Project Action API

The project actions are:

```ts
export type CreateProjectActionInput = CreateProjectInput & {
  readonly context: AppActionContext;
  readonly eventId?: SituId<"event">;
};

export type CreateProjectActionResult = {
  readonly project: ProjectRecord;
  readonly event: EventRecord;
};

export function createProjectAction(input: CreateProjectActionInput): CreateProjectActionResult;

export type GetProjectActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"project">;
};

export function getProjectAction(input: GetProjectActionInput): ProjectRecord | undefined;

export type ListProjectsActionInput = {
  readonly context: AppActionContext;
  readonly status?: ProjectStatus;
};

export function listProjectsAction(input: ListProjectsActionInput): readonly ProjectRecord[];

export type ArchiveProjectActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"project">;
  readonly actor: ActorRef;
  readonly now?: IsoTimestamp;
  readonly eventId?: SituId<"event">;
};

export type ArchiveProjectActionResult = {
  readonly project: ProjectRecord;
  readonly event: EventRecord;
};

export function archiveProjectAction(input: ArchiveProjectActionInput): ArchiveProjectActionResult;
```

`createProjectAction` creates the project through
`context.repositories.projects.create`, then creates an event through
`context.repositories.events.create`.

`archiveProjectAction` archives the project through
`context.repositories.projects.archive`, then creates an event through
`context.repositories.events.create`.

Both write actions must call `runAppTransaction` so the project write and event
write commit or roll back together.

`createProjectAction` forwards these fields to `projects.create`:

- `id`
- `name`
- `repositoryPath`
- `goalMarkdown`
- `createdBy`
- `now`

It does not forward `context` or `eventId`.

`archiveProjectAction` forwards these fields to `projects.archive`:

- `id`
- `now`

It does not forward `context`, `actor`, or `eventId`.

`getProjectAction` and `listProjectsAction` are read actions. They do not need
transactions and should return repository results directly.

## Task Action API

The task actions are:

```ts
export type CreateTaskActionInput = CreateTaskInput & {
  readonly context: AppActionContext;
  readonly eventId?: SituId<"event">;
};

export type CreateTaskActionResult = {
  readonly task: TaskRecord;
  readonly event: EventRecord;
  readonly notification?: NotificationRecord;
};

export function createTaskAction(input: CreateTaskActionInput): CreateTaskActionResult;

export type GetTaskActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"task">;
};

export function getTaskAction(input: GetTaskActionInput): TaskRecord | undefined;

export type ListTasksActionInput = ListTasksInput & {
  readonly context: AppActionContext;
};

export function listTasksAction(input: ListTasksActionInput): readonly TaskRecord[];

export type MoveTaskActionInput = MoveTaskInput & {
  readonly context: AppActionContext;
  readonly actor: ActorRef;
  readonly eventId?: SituId<"event">;
};

export type MoveTaskActionResult = {
  readonly task: TaskRecord;
  readonly event: EventRecord;
};

export function moveTaskAction(input: MoveTaskActionInput): MoveTaskActionResult;

export type AssignTaskActionInput = AssignTaskInput & {
  readonly context: AppActionContext;
  readonly actor: ActorRef;
  readonly eventId?: SituId<"event">;
};

export type AssignTaskActionResult = {
  readonly task: TaskRecord;
  readonly event: EventRecord;
  readonly notification?: NotificationRecord;
};

export function assignTaskAction(input: AssignTaskActionInput): AssignTaskActionResult;
```

`createTaskAction`, `moveTaskAction`, and `assignTaskAction` create exactly one
event after the task write succeeds.

When `assignedTo` is present, `createTaskAction` and `assignTaskAction` also
create exactly one notification and return it as `notification`. When
`assignedTo` is omitted, including assignment clearing, the result omits the
`notification` key. `moveTaskAction` does not create or return notifications.

Each write action must call `runAppTransaction` so the task write, event write,
and any notification write commit or roll back together.

`createTaskAction` forwards these fields to `tasks.create`:

- `id`
- `projectId`
- `title`
- `bodyMarkdown`
- `createdBy`
- `assignedTo`
- `status`
- `now`

It does not forward `context` or `eventId`.

`moveTaskAction` forwards these fields to `tasks.move`:

- `id`
- `status`
- `now`

It does not forward `context`, `actor`, or `eventId`.

`assignTaskAction` forwards these fields to `tasks.assign`:

- `id`
- `assignedTo`
- `now`

It does not forward `context`, `actor`, or `eventId`.

`CreateProjectInput`, `CreateTaskInput`, `MoveTaskInput`, and
`AssignTaskInput` include `now?: IsoTimestamp`; `ArchiveProjectActionInput`
declares `now` directly.

`getTaskAction` and `listTasksAction` are read actions. They do not need
transactions and should return repository results directly.

## Event Rules

Events are append-only timeline records. The action-created event target is the
record that changed.

Project event targets:

```ts
{ targetKind: "project", targetId: project.id }
```

Task event targets:

```ts
{ targetKind: "task", targetId: task.id }
```

Event actor rules:

- `createProjectAction`: actor is the created project's `createdBy`
- `archiveProjectAction`: actor is `input.actor`
- `createTaskAction`: actor is the created task's `createdBy`
- `moveTaskAction`: actor is `input.actor`
- `assignTaskAction`: actor is `input.actor`

Event timestamp rules:

- Pass `input.now` to both the primary repository write and event creation when
  `now` exists on the action input.
- When `now` is absent, let each repository choose its own current timestamp.

Event ids:

- When `eventId` is provided, pass it to event creation.
- When `eventId` is absent, let the event repository generate one.

Event summaries are exact:

| Action                 | Summary                          |
| ---------------------- | -------------------------------- |
| `createProjectAction`  | `Created project`                |
| `archiveProjectAction` | `Archived project`               |
| `createTaskAction`     | `Created task`                   |
| `moveTaskAction`       | `Moved task to <status>`         |
| `assignTaskAction`     | `Assigned task to <actor label>` |
| `assignTaskAction`     | `Cleared task assignee`          |

The assign summary uses `Assigned task to <actor label>` when
`input.assignedTo` is present. The actor label is `displayName` when present,
otherwise `actorId`.

The assign summary uses `Cleared task assignee` when `input.assignedTo` is
absent.

Action-created events do not need `bodyMarkdown` in this ADR. The changed
project or task record holds the durable Markdown body.

Concrete event creation examples:

```ts
const event = context.repositories.events.create({
  id: input.eventId,
  target: {
    targetKind: "project",
    targetId: project.id,
  },
  actor: project.createdBy,
  summaryMarkdown: "Created project",
  now: input.now,
});
```

```ts
const event = context.repositories.events.create({
  id: input.eventId,
  target: {
    targetKind: "task",
    targetId: task.id,
  },
  actor: input.actor,
  summaryMarkdown: `Moved task to ${input.status}`,
  now: input.now,
});
```

For create actions, the event actor must come from the repository result
(`project.createdBy` or `task.createdBy`) after the primary create succeeds,
not from the original action input.

For move summaries, `<status>` is exactly the raw `input.status` value, such as
`Moved task to done` or `Moved task to in_review`.

For assign summaries, derive `<actor label>` from
`input.assignedTo.displayName ?? input.assignedTo.actorId`, not from
`input.actor`.

`assignedTo: undefined` or omitted clears the assignee. `null` is outside the
supported TypeScript caller shape.

## Return Values

Project write actions return both the changed project record and the event
record:

```ts
{
  project,
  event,
}
```

Task move actions return both the changed task record and the event record:

```ts
{
  task,
  event,
}
```

Task create and assign actions return the changed task record, the event record,
and an optional notification:

```ts
{
  task,
  event,
  notification,
}
```

The `notification` key is present only when the action creates a task assignment
notification.

The returned product record is the repository result from the primary write.
The returned event is the repository result from event creation.
The returned notification is the repository result from notification creation.

Read actions return repository results directly.

## Error And Transaction Behavior

Actions do not catch and translate primitive repository errors. Validation,
not-found, conflict, and unexpected errors should propagate from repositories
and transaction helpers.

If event creation fails after the primary write inside a write action, the
transaction must roll back the primary write.

Actions must not create events before the primary write succeeds.

If the primary write throws, event creation is not attempted.

Actions should not implement their own nested transaction detection. ADR 0025's
`runAppTransaction` and the database helper own that behavior.

## Required Tests

Tests should use an in-memory app database through the app database helpers and
inspect persisted records rather than mocking repositories.

Required coverage:

- context API still exports from `index.ts` after moving to `context.ts`
- write actions create the primary record/change and exactly one event
- write action events use the exact summary, target, actor, event id, and
  timestamp rules from this ADR
- event creation failure rolls back the primary write
- primary write failure creates no event
- read actions return repository results without creating events
- moving a task uses the raw status string in the event summary
- assigning a task uses `assignedTo.displayName ?? assignedTo.actorId` in the
  event summary
- clearing assignment uses `Cleared task assignee`
- assigned task creation and task assignment each return one event and one
  notification
- unassigned task creation and assignment clearing each return one event and
  omit `notification`
- notification creation failure rolls back the task write and event write

## Boundaries

Do not add CLI commands, HTTP handlers, report generation, notification
behavior beyond task assignment notifications, comments, reviews, measurements,
artifacts, experiments, command execution, or agent runtime behavior in this
ADR's implementation.

Do not add workflow enforcement such as "a task must go to review before done"
or "assigned tasks automatically move to in progress." Actors choose the next
visible state through ordinary actions.

Do not add hidden job state, leases, workers, scheduler polling, or provider
session records.

## Consequences

The app has a small action layer for the first visible collaboration loop.
Later CLI and HTTP ADRs can expose these actions without duplicating
transaction/event behavior, and future feature actions can follow the same
pattern.
