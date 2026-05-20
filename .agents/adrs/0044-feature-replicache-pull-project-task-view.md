---
status: active
category: feature
created: 2026-05-14
---

# 0044. Feature: Replicache Pull for Project and Task View

## Context

ADR 0043 adds the first Replicache-shaped write surface:
`POST /replicache/push` for project and task mutations.

A sync client also needs a read surface. Replicache's official pull reference
says pull uses HTTP `POST`, the request body contains `pullVersion`,
`clientGroupID`, `cookie`, `profileID`, and `schemaVersion`, and successful
responses contain a `cookie`, `lastMutationIDChanges`, and a patch.

Reference: <https://doc.replicache.dev/reference/server-pull>

Situ should start with the simplest useful pull behavior. It should expose
visible product state through a full reset patch instead of building an
incremental diff system before there is evidence that it is needed.

## Decision

Add a local Replicache-shaped pull route:

```text
POST /replicache/pull
```

The route lives in the HTTP handler from ADR 0042 and delegates pull processing
to `projects/app/src/sync/`.

This ADR intentionally supports the same first product view as ADR 0043's first
write set:

- projects
- tasks

Later ADRs may extend the pull view to comments, events, notifications,
experiments, measurements, artifacts, reviews, reports, or an incremental
cookie-based diff.

## Sync Module

Add pull request validation and pull response construction to
`projects/app/src/sync/`.

The sync module owns:

- Replicache pull request and patch types
- pull request validation
- reading Replicache client mutation state
- building the project/task client view patch

The sync module does not own product schemas. Project and task records still
belong to their primitive packages. The pull implementation reads them through
the app action context and repositories.

## Pull Request Shape

The accepted pull request shape is:

```ts
type ReplicachePullRequest = {
  readonly pullVersion: 1;
  readonly clientGroupID: string;
  readonly cookie: JsonValue;
  readonly profileID: string;
  readonly schemaVersion: string;
};

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
```

Validation rules:

- `pullVersion` must be `1`
- `clientGroupID`, `profileID`, and `schemaVersion` must be non-empty strings
- `cookie` must be present and must be a JSON value
- non-finite numbers are not valid JSON values for this contract

The `cookie` value is validated but ignored by this ADR.

Invalid request envelopes return `400` and do not open the database.

Unsupported `pullVersion` values are treated as invalid request envelopes in
this local API. This matches ADR 0043's early push behavior and keeps the local
contract obvious.

## Pull Response Shape

Although Replicache permits more advanced pull responses, Situ returns a full
reset patch in this ADR:

```ts
type ReplicachePullResponse = {
  readonly cookie: null;
  readonly lastMutationIDChanges: Record<string, number>;
  readonly patch: readonly ReplicachePatchOperation[];
};

type ReplicachePatchOperation =
  | {
      readonly op: "clear";
    }
  | {
      readonly op: "put";
      readonly key: string;
      readonly value: JsonValue;
    };
```

The first patch operation is always:

```json
{ "op": "clear" }
```

The remaining patch operations rebuild the supported client view from scratch.
This is intentionally less efficient than an incremental diff, but it is easy
to reason about and avoids hidden sync state.

`cookie` is always `null` because this ADR does not use incremental pull
cookies.

`lastMutationIDChanges` contains every known client mutation id for the request
`clientGroupID`. It is read from `replicache_client_mutations`.

The `lastMutationIDChanges` object is keyed by Replicache `clientID`, which is
stored as `client_id` in SQLite. For example:

```json
{
  "client-1": 3,
  "client-2": 8
}
```

If the request `clientGroupID` has no known client mutation rows, return an
empty object.

## Client View Keys

Use stable, human-readable keys:

```text
projects/<projectId>
tasks/<taskId>
```

Examples:

```text
projects/project_123
tasks/task_123
```

Project records are emitted before task records.

Use unfiltered `projects.list()` and unfiltered `tasks.list()`. This means pull
returns archived projects, terminal tasks, and every other project/task record
currently stored in the local app database.

Within each record kind, preserve the repository's list ordering. Do not add a
separate sync-specific sort unless a later ADR changes the client view
contract.

## Client View Values

Patch `put` values are JSON versions of the corresponding product records.

Values should preserve the same field names as the TypeScript record returned
by the primitive repository. Optional `undefined` fields are omitted from the
JSON value.

Do not rename fields, add UI-only fields, or embed related records in this ADR.
The key identifies the record kind, and the value is the product record.

## Consistency

Pull processing must read product records and `lastMutationIDChanges` inside
one SQLite transaction using the existing `withTransaction` helper from
`projects/app/src/db/`. The transaction is read-only from the product point of
view: pull must not create, update, or delete product records.

Because ADR 0043 commits product effects and `last_mutation_id` together, a
pull transaction that reads both gets a consistent local snapshot.

## HTTP Behavior

`POST /replicache/pull` accepts JSON request bodies only.

Invalid JSON or invalid request envelopes return status `400` and do not open
the database.

The route opens the app database only after the request envelope is valid. It
uses `databasePath` and `environment` from `HandleSituHttpRequestInput` and
closes the database before returning, whether processing succeeds or fails.

`GET`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, or any other method on
`/replicache/pull` return status `405` with:

```text
Allow: POST
```

Successful pull processing returns status `200` and the pull response JSON.

The route reuses the existing HTTP JSON response helpers from ADR 0042. Both
success and error responses use:

```text
Content-Type: application/json; charset=utf-8
```

Every JSON response body ends with one trailing newline.

## Boundaries

Do not add an incremental diff algorithm in this ADR.

Do not add a server runtime or `situ serve` command in this ADR.

Do not add auth in this ADR. Situ is still a local app; remote exposure and
authorization need a separate decision.

Do not add sync code to primitive packages.

Do not use this route to run agents, schedule work, or execute commands.

Do not extend pull to every primitive in this ADR. The first read view should
match the first Replicache write set from ADR 0043.

## Consequences

Situ gets a complete first sync loop for projects and tasks:

```text
push named project/task mutations
  -> persist product records and client mutation ids
  -> pull a full project/task client view
```

The reset patch strategy keeps the implementation inspectable. A later ADR can
introduce incremental cookies only when the product needs that complexity.
