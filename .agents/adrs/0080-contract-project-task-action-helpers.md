---
status: active
category: contract
created: 2026-05-14
---

# 0080. Contract: Project and Task Action Helpers

## Context

Project and task app actions own multi-record product behavior such as creating
timeline events and assignment notifications.

Replicache push must apply product effects and client mutation state in one
transaction. It therefore cannot call public app actions that start their own
transactions from inside sync's existing transaction.

Experiment actions already define explicit transaction-inner helper contracts.
Project and task actions need the same clarity because later sync ADRs refer to
helpers such as `archiveProjectInContext` and `assignTaskInContext`.

## Decision

Project and task write actions expose transaction-inner helpers that accept an
`AppActionContext` and do not call `runAppTransaction` themselves.

Public action functions own their transactions by calling the matching helper
inside `runAppTransaction`.

Sync mutators call the transaction-inner helpers from sync's product-effect
transaction. Sync must not call the public transaction-owning action functions
for these writes.

## Project Helpers

`projects/app/src/actions/projects.ts` exports:

```ts
export type CreateProjectInContextInput = Omit<CreateProjectActionInput, "context"> & {
  readonly context: AppActionContext;
};

export function createProjectInContext(
  input: CreateProjectInContextInput,
): CreateProjectActionResult;

export type ArchiveProjectInContextInput = Omit<ArchiveProjectActionInput, "context"> & {
  readonly context: AppActionContext;
};

export function archiveProjectInContext(
  input: ArchiveProjectInContextInput,
): ArchiveProjectActionResult;
```

`createProjectAction` must call `createProjectInContext` inside
`runAppTransaction`.

`archiveProjectAction` must call `archiveProjectInContext` inside
`runAppTransaction`.

## Task Helpers

`projects/app/src/actions/tasks.ts` exports:

```ts
export type CreateTaskInContextInput = Omit<CreateTaskActionInput, "context"> & {
  readonly context: AppActionContext;
};

export function createTaskInContext(input: CreateTaskInContextInput): CreateTaskActionResult;

export type MoveTaskInContextInput = Omit<MoveTaskActionInput, "context"> & {
  readonly context: AppActionContext;
};

export function moveTaskInContext(input: MoveTaskInContextInput): MoveTaskActionResult;

export type AssignTaskInContextInput = Omit<AssignTaskActionInput, "context"> & {
  readonly context: AppActionContext;
};

export function assignTaskInContext(input: AssignTaskInContextInput): AssignTaskActionResult;
```

`createTaskAction` must call `createTaskInContext` inside `runAppTransaction`.

`moveTaskAction` must call `moveTaskInContext` inside `runAppTransaction`.

`assignTaskAction` must call `assignTaskInContext` inside
`runAppTransaction`.

`CreateTaskActionResult` and `AssignTaskActionResult` include the optional
assignment notification field from ADR 0065:

```ts
export type CreateTaskActionResult = {
  readonly task: TaskRecord;
  readonly event: EventRecord;
  readonly notification?: NotificationRecord;
};

export type AssignTaskActionResult = {
  readonly task: TaskRecord;
  readonly event: EventRecord;
  readonly notification?: NotificationRecord;
};
```

## Export Surface

The actions barrel exports all public action functions, input/result types, and
transaction-inner helper functions/types listed in this ADR.

The app root re-exports the actions barrel, so callers can import these helper
types from `@situ/app` when they need to compose action behavior inside an
existing app transaction.

Add a public-surface test that imports the helper functions and types from
`@situ/app`.

## Boundaries

This ADR does not add new project or task behavior.

This ADR does not change event summaries.

This ADR does not change notification behavior.

This ADR does not expose primitive repositories as public app-level helpers.

This ADR does not make passive record actions use transaction-inner helpers
unless a separate ADR requires that.

## Required Checks

Implementation should run:

```text
bun test projects/app/src/actions/projects.test.ts projects/app/src/actions/tasks.test.ts
bun test projects/app/src/actions/index.test.ts
bun test projects/app/src/sync/push.test.ts
mise run typecheck
mise run check
git diff --check
```

If the public-surface test lives in a different file, replace
`projects/app/src/actions/index.test.ts` with that file path.

## Consequences

The app action layer has one clear composition pattern:

```text
public action
  -> opens transaction
  -> calls in-context helper

sync mutation
  -> already inside sync transaction
  -> calls in-context helper
```

Future reimplementations can preserve transaction boundaries without inferring
helper contracts from current code.
