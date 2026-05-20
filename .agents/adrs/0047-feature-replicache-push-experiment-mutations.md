---
status: active
category: feature
created: 2026-05-14
---

# 0047. Feature: Replicache Push for Experiment Mutations

## Context

ADR 0043 adds `POST /replicache/push` for project and task mutations. ADR
0045 extends the same push route for comments and notifications.

Experiments are Situ's visible candidate-work primitive. They represent a
human-readable attempt to solve a task, including its current status, assignee,
branch/worktree references, and latest revision number.

Adding experiment mutators lets a sync client create and revise candidate work
through the same single write surface without adding workflow endpoints,
scheduler records, leases, hidden runtime state, or command execution.

## Decision

Extend the existing Replicache push route with experiment mutators.

Add these supported mutator names:

- `experiments.create`
- `experiments.move`
- `experiments.assign`
- `experiments.revise`

These mutators are processed by the existing sync module in
`projects/app/src/sync/`.

Do not add new HTTP routes. The route remains:

```text
POST /replicache/push
```

The push endpoint keeps the same request envelope and result shape as ADR 0043.

Request envelope:

```ts
type ReplicachePushRequest = {
  readonly pushVersion: 1;
  readonly clientGroupID: string;
  readonly mutations: readonly ReplicacheMutation[];
  readonly profileID: string;
  readonly schemaVersion: string;
};

type ReplicacheMutation = {
  readonly clientID: string;
  readonly id: number;
  readonly name: string;
  readonly args: unknown;
  readonly timestamp: number;
};
```

Result shape:

```ts
type ReplicachePushResult = {
  readonly ok: true;
  readonly processedMutationCount: number;
  readonly skippedMutationCount: number;
  readonly permanentErrorCount: number;
  readonly permanentErrors: readonly ReplicachePermanentMutationError[];
};

type ReplicachePermanentMutationError = {
  readonly clientID: string;
  readonly mutationID: number;
  readonly mutationName: string;
  readonly error: SerializedError;
};
```

Envelope validation, mutation ordering, permanent-error handling, and
`replicache_client_mutations` behavior remain unchanged:

- invalid request envelopes return `400` and do not open the database
- old mutation ids are skipped without advancing `last_mutation_id`
- future mutation ids are skipped without advancing `last_mutation_id`
- the next mutation id is processed
- product effects and `last_mutation_id` are committed atomically on success
- expected `BaseError` failures become permanent mutation errors and advance
  `last_mutation_id`
- unexpected JavaScript errors abort push processing and do not advance
  `last_mutation_id`

## Mutator Boundaries

The experiment mutators call the existing experiment app action behavior
through the `AppActionContext` provided by sync.

Experiment write actions own their own transactions when called directly by
the CLI or other app code. Sync already runs product effects and
`last_mutation_id` updates inside one transaction. To avoid nested
transactions, factor the body of each experiment write action into a shared
transaction-inner helper that accepts an `AppActionContext`.

The shared helpers are:

```ts
export type CreateExperimentInContextInput = Omit<CreateExperimentActionInput, "context"> & {
  readonly context: AppActionContext;
};

export function createExperimentInContext(
  input: CreateExperimentInContextInput,
): CreateExperimentActionResult;

export type MoveExperimentInContextInput = Omit<MoveExperimentActionInput, "context"> & {
  readonly context: AppActionContext;
};

export function moveExperimentInContext(
  input: MoveExperimentInContextInput,
): MoveExperimentActionResult;

export type AssignExperimentInContextInput = Omit<AssignExperimentActionInput, "context"> & {
  readonly context: AppActionContext;
};

export function assignExperimentInContext(
  input: AssignExperimentInContextInput,
): AssignExperimentActionResult;

export type ReviseExperimentInContextInput = Omit<ReviseExperimentActionInput, "context"> & {
  readonly context: AppActionContext;
};

export function reviseExperimentInContext(
  input: ReviseExperimentInContextInput,
): ReviseExperimentActionResult;
```

The existing public action functions keep their current API and call these
helpers inside `runAppTransaction`.

Sync mutators must call the `*ExperimentInContext` helpers. They must not call
the public `*ExperimentAction` functions from inside sync's existing
product-effect transaction.

Supported mutators should produce the same durable experiment records and
event summaries as the corresponding app actions:

- `createExperimentAction`
- `moveExperimentAction`
- `assignExperimentAction`
- `reviseExperimentAction`

Do not make experiment mutators create worktrees, run commands, execute tests,
spawn agents, schedule work, or emit notifications automatically. Those are
separate product behaviors layered around the visible experiment record.

## Supported Mutators

`experiments.create` args:

```ts
type CreateExperimentMutationArgs = {
  readonly id: SituId<"experiment">;
  readonly eventId?: SituId<"event">;
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
```

`experiments.move` args:

```ts
type MoveExperimentMutationArgs = {
  readonly id: SituId<"experiment">;
  readonly eventId?: SituId<"event">;
  readonly status: ExperimentStatus;
  readonly actor: ActorRef;
  readonly now?: IsoTimestamp;
};
```

`experiments.assign` args:

```ts
type AssignExperimentMutationArgs = {
  readonly id: SituId<"experiment">;
  readonly eventId?: SituId<"event">;
  readonly actor: ActorRef;
  readonly assignedTo?: ActorRef;
  readonly now?: IsoTimestamp;
};
```

Omitting `assignedTo` clears the experiment assignee. This matches the
experiment app action behavior and avoids adding a second clear-specific
mutator.

`experiments.revise` args:

```ts
type ReviseExperimentMutationArgs = {
  readonly id: SituId<"experiment">;
  readonly eventId?: SituId<"event">;
  readonly summaryMarkdown?: string;
  readonly status?: ExperimentStatus;
  readonly baseRef?: string;
  readonly clearBaseRef?: boolean;
  readonly branchName?: string;
  readonly clearBranchName?: boolean;
  readonly worktreePath?: string;
  readonly clearWorktreePath?: boolean;
  readonly actor: ActorRef;
  readonly now?: IsoTimestamp;
};
```

The revise mutator preserves ADR 0020's revision rules:

- at least one revision property must be syntactically present:
  `summaryMarkdown`, `status`, a replacement value, or a clear flag set to
  `true`
- clear flags explicitly clear their matching optional field when set to
  `true`
- a clear flag and replacement value for the same field must not both be
  provided
- each successful revise increments `revisionNumber` by one

## Validation

Supported mutator args must be syntax-validated before product writes.

Validation rules:

- `args` must be an object
- required `id` fields must be non-empty strings
- optional `eventId` fields must be omitted or non-empty strings
- `projectId` and `taskId` must be non-empty strings
- `title` and `summaryMarkdown` must be non-empty strings when required or
  provided
- `baseRef`, `branchName`, and `worktreePath` must be omitted or non-empty
  strings
- clear flags must be omitted or boolean values
- clear flag values of `false` are accepted but do not count as a revision
  property for `experiments.revise`
- `status` must be one of `planned`, `running`, `ready_for_review`,
  `accepted`, `rejected`, or `abandoned`
- `ActorRef` fields must be objects with:
  - `actorKind`: one of `human`, `local_agent`, or `system`
  - `actorId`: non-empty string
  - `displayName`: omitted or non-empty string
- optional `now` fields must be valid ISO timestamps according to the existing
  sync metadata helper validation

`experiments.create` requires a caller-provided experiment id even though the
underlying primitive repository can generate ids. Replicache mutations need
stable client-known ids so later sync operations can refer to the same
experiment without waiting for server-generated ids.

The sync parser must require `args.id` for `experiments.create`. The
transaction-inner helper and public app action may keep their existing
optional-id API for non-sync callers.

Domain validation still belongs to the existing app action and primitive
repository behavior:

- missing parent project or task rows become permanent conflict errors
- duplicate experiment ids become permanent conflict errors
- moving, assigning, or revising a nonexistent experiment becomes a permanent
  not-found error
- invalid revision combinations become permanent validation errors

If validation or expected app behavior fails with a `BaseError`, the mutation
is a permanent mutation error under ADR 0043. Sync advances
`last_mutation_id` for that mutation and records the serialized error in the
push result.

## Push Result

The push result shape remains the ADR 0043 shape.

`processedMutationCount` counts these mutators the same way it counts earlier
mutators:

- applied product effects count as processed
- permanent validation, conflict, or not-found errors count as processed after
  advancing `last_mutation_id`

`skippedMutationCount` behavior is unchanged.

## Tests

Implementation should include focused tests for:

- `experiments.create`, `experiments.move`, `experiments.assign`, and
  `experiments.revise` create and update one experiment in order
- successful experiment mutators create the same event summaries as the
  corresponding app actions
- `experiments.create` requires a caller-provided experiment id
- malformed supported mutator args are permanent validation errors
- missing parent project or task rows are permanent conflict errors and do not
  leave partial experiment or event records
- nonexistent experiment records for move, assign, or revise are permanent
  not-found errors and do not create event records
- invalid revise combinations are permanent validation errors and do not change
  the experiment
- old and future mutation skipping still applies to experiment mutators through
  the existing ADR 0043 push processor

The HTTP route does not need separate endpoint tests for every new mutator
because ADR 0043 already covers route behavior. Add HTTP coverage only if the
implementation changes HTTP behavior, which this ADR should not do.

## Boundaries

Do not add a pull view for experiments in this ADR.

Do not add sync mutators for measurements, artifacts, reviews, reports, events,
comments, notifications, project archive, task assign, or task revise in this
ADR.

Do not add REST endpoints for experiment actions.

Do not add sync code to primitive packages.

Do not add provider sessions, agent sessions, workers, leases, scheduler
state, or model conversation state.

Do not create worktrees or execute commands.

## Consequences

Experiments can now participate in the same single write API as projects,
tasks, comments, and notifications.

The local app can model a candidate-work loop through visible product records:
a client creates an experiment, moves it to `running`, revises the same
experiment after feedback, assigns it to another actor, and moves it back to
`ready_for_review` without introducing hidden workflow machinery.
