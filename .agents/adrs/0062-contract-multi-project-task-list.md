---
status: active
category: contract
created: 2026-05-14
---

# 0062. Contract: Multi-Project Task List

## Context

ADR 0016 makes tasks belong to projects, and ADR 0059 lets local actors recover
the projects for the current repository.

Some read views need tasks from more than one project without inventing a new
workflow concept. The task primitive should support that directly as an
ordinary repository/action filter instead of forcing callers to list all tasks
and filter them outside the task package.

This is a small contract change. It does not add a new task status, task owner,
project selection rule, or CLI command.

## Decision

Extend task listing to accept an explicit set of project ids.

Expected files:

```text
projects/app/packages/tasks/src/repository.ts
projects/app/packages/tasks/tests/tasks.test.ts
projects/app/src/actions/tasks.ts
projects/app/src/actions/tasks.test.ts
```

## Task Repository Contract

Extend `@situ/tasks`:

```ts
export type ListTasksInput = {
  readonly projectId?: SituId<"project">;
  readonly projectIds?: readonly SituId<"project">[];
  readonly status?: TaskStatus;
  readonly assignedTo?: {
    readonly actorKind: ActorRef["actorKind"];
    readonly actorId: string;
  };
};
```

`projectId` remains the single-project filter from ADR 0016.

`projectIds` is a multi-project filter. When present and non-empty, the
repository returns tasks whose `projectId` is in that exact set.

`projectIds: []` returns an empty array.

`projectId` and `projectIds` are mutually exclusive. Passing both throws
`ValidationError` from `@situ/errors` using the standard constructor object.
Any defined `projectIds` value, including `[]`, counts as passing
`projectIds`.

The error message is:

```text
Task list accepts either projectId or projectIds, not both.
```

and details:

```ts
{
  projectId: input.projectId,
  projectIds: input.projectIds,
}
```

The repository does not validate id prefixes. The values are already typed as
`SituId<"project">`.

Duplicate values inside `projectIds` do not duplicate returned tasks.

When `projectIds` is combined with `status` and `assignedTo`, all filters apply.

No batching or explicit size limit is required. A very large `projectIds` array
may fail with the existing database driver's parameter-limit behavior.

Ordering remains unchanged and global across the returned tasks:

```sql
ORDER BY created_at ASC, id ASC
```

## SQL Shape

When `projectIds` contains values, the repository uses an `IN` predicate with
one placeholder per value:

```sql
project_id IN (?, ?, ...)
```

Do not use string interpolation for ids.

For `projectIds: []`, short-circuit and return `[]` without querying.

## App Action Contract

`ListTasksActionInput` already extends `ListTasksInput`.

`listTasksAction` must forward both `projectId` and `projectIds` to the task
repository:

```ts
context.repositories.tasks.list({
  projectId: input.projectId,
  projectIds: input.projectIds,
  status: input.status,
  assignedTo: input.assignedTo,
});
```

The action does not add project lookups, repository-path filtering, status
defaults, events, notifications, transactions, or workflow behavior.

The action does not perform the mutual-exclusion validation itself. It relies
on the task repository and propagates that error unchanged.

## Tests

Add package tests covering:

- listing tasks by multiple project ids
- preserving global `created_at ASC, id ASC` task ordering across projects
- combining `projectIds` with `status`
- combining `projectIds` with `assignedTo`
- returning an empty list for `projectIds: []`
- rejecting an input that includes both `projectId` and `projectIds`
- preserving existing `projectId`, `status`, and `assignedTo` filters

Add action tests covering:

- forwarding `projectIds` through `listTasksAction`
- propagating the mutual-exclusion validation error

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not add or change CLI commands.

Do not add current-repository detection.

Do not add project repository joins, task search, task sorting flags, automatic
project selection, default actor filters, task claiming, scheduler behavior,
agent runtime behavior, or workflow enforcement.

Do not create events or notifications from read actions.

## Consequences

The task primitive can now answer a simple question:

```text
give me tasks for these visible project ids
```

Later ADRs can build repository-scoped or inbox-style views by first resolving
ordinary projects and then passing explicit project ids into the task list
contract.
