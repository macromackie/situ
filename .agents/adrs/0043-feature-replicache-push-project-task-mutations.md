---
status: active
category: feature
created: 2026-05-14
---

# 0043. Feature: Replicache Push for Project and Task Mutations

## Context

Situ's local HTTP API should not grow one POST endpoint per product action.
Write APIs should flow through a Replicache-shaped push endpoint where clients
send named mutations.

Replicache's push protocol applies batches of client mutations. Its official
push reference says the endpoint is called with HTTP `POST`, the request body
contains `pushVersion`, `clientGroupID`, `mutations`, `profileID`, and
`schemaVersion`, and mutation effects must be committed atomically with the
client's `lastMutationID`.

Reference: <https://doc.replicache.dev/reference/server-push>

## Decision

Add a local Replicache-shaped push route:

```text
POST /replicache/push
```

The route lives in the HTTP handler from ADR 0042 and delegates mutation
processing to `projects/app/src/sync/`.

This ADR intentionally supports a small first product mutation set:

- `projects.create`
- `tasks.create`
- `tasks.move`

Later ADRs may add more mutators for assignment, comments, notifications,
experiments, measurements, artifacts, reviews, reports, or pull behavior.

## Sync Module

Add `projects/app/src/sync/` for sync protocol code.

The sync module owns:

- Replicache push request and mutation types
- push request validation
- client mutation state reads and writes
- mutation dispatch for supported mutators

The sync module does not own product schemas. Product records still belong to
primitive packages, and cross-primitive product behavior still belongs to app
actions or shared transaction-inner helpers used by both actions and sync.

Existing app actions own their own transactions. Sync must not call those
transaction-owning action functions from inside another transaction. If sync
needs the same product behavior, factor the transaction body into a shared
helper that accepts an `AppActionContext`, then have both the app action and
sync call that helper. This keeps sync mutation state and product effects
atomic without nested transactions.

The app structure includes `src/sync/` as the sync protocol adapter layer.

## Client Mutation State

Add a new app-owned migration with id:

```text
0002-replicache-client-mutations
```

The migration creates Replicache client mutation state:

```sql
CREATE TABLE IF NOT EXISTS replicache_client_mutations (
  client_group_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  last_mutation_id INTEGER NOT NULL CHECK (last_mutation_id >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (client_group_id, client_id)
);
```

`last_mutation_id` defaults conceptually to `0` for unseen clients.

The table is app sync state, not a product primitive. It should not be counted
by maintenance inspection as a product record.

Do not add this table to a primitive schema fragment.

## Push Request Shape

The accepted push request shape is:

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

Validation rules:

- `pushVersion` must be `1`
- `clientGroupID`, `profileID`, `schemaVersion`, `clientID`, and `name` must be
  non-empty strings
- `mutations` must be an array
- mutation `id` must be a positive safe integer
- `timestamp` must be a finite number
- `args` must be an object for supported mutators
- supported mutator args must be validated before product writes so malformed
  JSON becomes a permanent validation error rather than an internal error

Invalid request envelopes return `400` and do not open the database.

Unsupported `pushVersion` values are treated as invalid request envelopes in
this local API. This keeps early behavior obvious; a later ADR may switch to
Replicache's ignore behavior if compatibility requires it.

## Mutation Ordering

For each mutation, read the current `last_mutation_id` for
`clientGroupID + clientID`.

Mutation handling rules:

- if `mutation.id <= lastMutationID`, skip it as already processed
- if `mutation.id > lastMutationID + 1`, skip it as a future mutation
- if `mutation.id === lastMutationID + 1`, process it

Processing one mutation means committing its product effects and the updated
`last_mutation_id` in the same SQLite transaction.

Skipping an old mutation does not update `last_mutation_id`.

Skipping a future mutation does not update `last_mutation_id`; the client can
retry when the missing earlier mutation arrives.

## Permanent Errors

Expected application errors from supported mutators are treated as permanent
mutation errors.

For these errors:

- roll back any partial product effects for that mutation
- commit `last_mutation_id` to the mutation id
- include the serialized error in the push result
- continue processing later mutations from that client only if their ids are
  now in order

This avoids deadlocking a local Replicache client on a mutation that will never
apply.

Implementation may accomplish this by validating each supported mutator's args
before opening a product-effect transaction. If validation fails, no product
effects have started, and sync can commit only `last_mutation_id` plus the
permanent error result.

If product-effect execution throws a `BaseError`, the transaction containing
the product effects must roll back, then sync commits only `last_mutation_id`
for that mutation. Do not try to keep product writes and a permanent-error
`last_mutation_id` update in the same failed transaction.

All `BaseError` subclasses from `@situ/errors` are expected application errors
for this ADR, including validation, conflict, not found, external, and internal
application errors. Ordinary JavaScript `Error` values and unknown thrown values
are unexpected errors.

Unexpected errors abort push processing, roll back the current mutation, do not
advance `last_mutation_id`, and return the HTTP error response from ADR 0042.

## Supported Mutators

`projects.create` args:

```ts
type CreateProjectMutationArgs = {
  readonly id?: SituId<"project">;
  readonly eventId?: SituId<"event">;
  readonly name: string;
  readonly repositoryPath: string;
  readonly goalMarkdown: string;
  readonly createdBy: ActorRef;
  readonly now?: IsoTimestamp;
};
```

`tasks.create` args:

```ts
type CreateTaskMutationArgs = {
  readonly id?: SituId<"task">;
  readonly eventId?: SituId<"event">;
  readonly projectId: SituId<"project">;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly status?: TaskStatus;
  readonly createdBy: ActorRef;
  readonly assignedTo?: ActorRef;
  readonly now?: IsoTimestamp;
};
```

`tasks.move` args:

```ts
type MoveTaskMutationArgs = {
  readonly id: SituId<"task">;
  readonly eventId?: SituId<"event">;
  readonly status: TaskStatus;
  readonly actor: ActorRef;
  readonly now?: IsoTimestamp;
};
```

Supported mutators should produce the same durable records and event summaries
as the corresponding app actions.

Mutation `timestamp`, `profileID`, and `schemaVersion` are validated but not
otherwise used by this ADR. Durable record timestamps come from explicit
`args.now` when present, or the existing product helpers' current-time behavior.

Unsupported mutator names are permanent mutation errors. They advance
`last_mutation_id` and appear in the push result as validation errors.

## Push Result

Although Replicache ignores the push response body, Situ returns a small JSON
object for local debugging and tests:

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

`processedMutationCount` counts mutations that either applied product effects
or were permanently marked processed after an expected application error.

`skippedMutationCount` counts old or future mutations that were ignored without
advancing `last_mutation_id`.

`permanentErrorCount` equals `permanentErrors.length`.

## HTTP Behavior

`POST /replicache/push` accepts JSON request bodies only.

Invalid JSON or invalid request envelopes return status `400` and do not open
the database.

The route opens the app database only after the request envelope is valid. It
uses `databasePath` and `environment` from `HandleSituHttpRequestInput` and
closes the database before returning, whether processing succeeds or fails.

`GET`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, or any other method on
`/replicache/push` return status `405` with:

```text
Allow: POST
```

Successful push processing returns status `200` and the push result JSON.

The route uses the JSON content type and newline body rules from ADR 0042.

## Boundaries

Do not add a pull endpoint in this ADR.

Do not add auth in this ADR. Situ is still a local app; remote exposure and
authorization need a separate decision.

Do not add REST endpoints for individual mutators.

Do not add sync code to primitive packages.

Do not use this route to run agents, schedule work, or execute commands.

## Consequences

Situ gets a single write API surface that can grow by adding named mutators.

The first push route proves the core Replicache ordering and atomic
`lastMutationID` contract without forcing every primitive through sync at once.
