---
status: active
category: contract
created: 2026-05-13
---

# 0025. Contract: App Action Context

## Context

Primitive packages own their records. CLI commands, HTTP handlers, report
generation, evals, and maintenance commands still need one app-facing place to
compose those primitives.

That app-facing place should stay boring. It should create repositories from a
caller-provided SQLite database and expose an explicit transaction boundary. It
should not become a workflow engine, scheduler, hidden runtime, or second
product model.

## Decision

`projects/app/src/actions/` owns the app action context.

The action context is a small composition layer over the local database and
primitive repositories. It does not open databases, apply migrations, parse CLI
arguments, start HTTP servers, run agents, or make product decisions by itself.

Expected imports:

- `Database` from `bun:sqlite`
- `createProjectRepository` and `ProjectRepository` from `@situ/projects`
- `createTaskRepository` and `TaskRepository` from `@situ/tasks`
- `createCommentRepository` and `CommentRepository` from `@situ/comments`
- `createEventRepository` and `EventRepository` from `@situ/events`
- `createNotificationRepository` and `NotificationRepository` from
  `@situ/notifications`
- `createBaselineRepository` and `BaselineRepository` from `@situ/baselines`
- `createExperimentRepository` and `ExperimentRepository` from
  `@situ/experiments`
- `createMeasurementRepository` and `MeasurementRepository` from
  `@situ/measurements`
- `createArtifactRepository` and `ArtifactRepository` from `@situ/artifacts`
- `createReviewRepository` and `ReviewRepository` from `@situ/reviews`
- `createReportRepository` and `ReportRepository` from `@situ/reports`
- `createBriefingRepository` and `BriefingRepository` from `@situ/briefings`
- `createLiveRepository` and `LiveRepository` from `@situ/live`
- `withTransaction` from `../db/index.js`

The app database transaction helper has this signature:

```ts
export function withTransaction<T>(input: {
  readonly database: Database;
  readonly run: (database: Database) => T;
}): T;
```

## Public API

The action package exports:

```ts
export type AppRepositories = {
  readonly projects: ProjectRepository;
  readonly tasks: TaskRepository;
  readonly comments: CommentRepository;
  readonly events: EventRepository;
  readonly notifications: NotificationRepository;
  readonly baselines: BaselineRepository;
  readonly experiments: ExperimentRepository;
  readonly measurements: MeasurementRepository;
  readonly artifacts: ArtifactRepository;
  readonly reviews: ReviewRepository;
  readonly reports: ReportRepository;
  readonly briefings: BriefingRepository;
  readonly live: LiveRepository;
};

export type CreateAppRepositoriesInput = {
  readonly database: Database;
};

export function createAppRepositories(input: CreateAppRepositoriesInput): AppRepositories;

export type AppActionContext = {
  readonly database: Database;
  readonly repositories: AppRepositories;
};

export type CreateAppActionContextInput = {
  readonly database: Database;
};

export function createAppActionContext(input: CreateAppActionContextInput): AppActionContext;

export type RunAppTransactionInput<T> = {
  readonly context: AppActionContext;
  readonly run: (context: AppActionContext) => T;
};

export function runAppTransaction<T>(input: RunAppTransactionInput<T>): T;
```

`projects/app/src/actions/index.ts` must export these types and functions.
`projects/app/src/index.ts` already re-exports `./actions/index.js`, so no
additional app-root export is needed unless that re-export is removed.

## Repository Bundle

`createAppRepositories` creates one repository for each primitive package using
the exact same caller-provided database handle.

Repository bundle keys are lower-case plural primitive names:

- `projects`
- `tasks`
- `comments`
- `events`
- `notifications`
- `baselines`
- `experiments`
- `measurements`
- `artifacts`
- `reviews`
- `reports`
- `briefings`
- `live`

The bundle must not omit a primitive package that has a repository.

The repository keys listed above are the complete required set for this ADR. If
a later ADR adds another primitive repository, that later ADR should update or
extend the action context contract.

The action context should not wrap, subclass, memoize globally, or alter
repository methods. It returns the primitive repositories directly.

Each `createAppActionContext` call creates a new context object and a new
repository bundle from the provided database handle. The repository instances
may share the same database handle, but context and bundle object identity
should be fresh per call.

The repository factory call shape is:

```ts
createProjectRepository({ database: input.database });
```

The same object-argument shape applies to the other primitive repository
factories.

## Transaction Boundary

`runAppTransaction` delegates to the app database layer's `withTransaction`.

It passes `input.context.database` to `withTransaction`, creates a fresh action
context for the transaction callback using the transaction database handle, and
returns the callback result.

The implementation shape is:

```ts
return withTransaction({
  database: input.context.database,
  run: (database) =>
    input.run(
      createAppActionContext({
        database,
      }),
    ),
});
```

The transaction callback receives an `AppActionContext`, not raw repositories
alone, so later app actions can keep one consistent function shape.

The function is synchronous because the SQLite transaction helper is
synchronous. If the callback throws, the database transaction rolls back and the
original error is re-thrown by the database helper.

Async callbacks are outside the supported caller contract. `runAppTransaction`
does not need separate promise detection; the app database helper owns the
synchronous transaction validation.

Nested transactions are not supported. The app database helper owns that
validation. `runAppTransaction` must not implement separate nested-transaction
detection.

## Boundaries

Do not add task creation, experiment movement, comment creation/update actions,
notification behavior, report generation, command execution, CLI parsing, HTTP
routing, scheduler state, agent sessions, leases, polling, or provider runtime
behavior to this ADR's implementation.

Do not make `actions` a central model package. It composes package-owned
repositories; it does not redefine package record types, schema, or product
rules.

Do not open or close databases in `actions`. Callers own database lifecycle.

## Consequences

CLI commands, HTTP handlers, eval harnesses, maintenance commands, and future
feature actions get one obvious dependency shape:

```text
open database
  -> create app action context
  -> run thin app action
  -> primitive repositories preserve product state
```

Later feature ADRs can add concrete app actions that compose repositories,
events, notifications, and transactions without changing primitive packages.
