---
status: active
category: feature
created: 2026-05-14
---

# 0054. Feature: Replicache Pull for Event View

## Context

ADR 0053 adds a Replicache push mutator for ordinary event records. A sync
client that can append timeline events also needs to read those events back
through the same local sync surface.

Events are append-only timeline records. They explain visible activity around
product records, but they are not workflow steps, locks, jobs, leases, runtime
session handles, or scheduler state.

Pull should expose event records as product records. Pull should not interpret
events, infer work state, move tasks, summarize activity, wake agents, or add
workflow state.

## Decision

Extend the existing Replicache pull route:

```text
POST /replicache/pull
```

The route, request validation, response envelope, `cookie: null`, and
`lastMutationIDChanges` behavior remain unchanged.

Request envelope:

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

Invalid request envelopes return `400` and do not open the database.

Response shape:

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

`lastMutationIDChanges` contains every known client mutation id for the request
`clientGroupID`. The object is keyed by Replicache `clientID`, which is stored
as `client_id` in SQLite.

The pull patch remains a reset patch:

```text
clear
put projects/*
put tasks/*
put experiments/*
put measurements/*
put reviews/*
put artifacts/*
put reports/*
put comments/*
put events/*
put notifications/*
```

Do not add new HTTP routes.

## Repository Contract Extension

The pull implementation should keep reading product records through app
repositories, not direct sync-owned SQL.

Extend the event repository from ADR 0018 with:

```ts
export type EventRepository = {
  // existing members remain
  readonly listAll: () => readonly EventRecord[];
};
```

`listAll` returns every event ordered by:

```sql
created_at ASC, id ASC
```

This is a primitive repository read method. It does not emit events, create
notifications, mutate records, apply filters, check target existence, interpret
event summaries, or run workflow behavior.

Adding `listAll` to `@situ/events` is in scope. The method must not import sync
types, know about Replicache keys, or contain pull-specific logic.

The implementation should use an unfiltered query shaped like:

```sql
SELECT *
FROM events
ORDER BY created_at ASC, id ASC
```

Map rows through the existing repository row-to-record function.

Do not add CLI commands for this list-all method in this ADR. Existing CLI
commands stay focused on target and recent-event workflows.

## Pull Patch Order

The first patch operation remains:

```json
{ "op": "clear" }
```

The remaining `put` operations are emitted in this order:

1. all projects from unfiltered `projects.list()`
2. all tasks from unfiltered `tasks.list()`
3. all experiments from unfiltered `experiments.list()`
4. all measurements from `measurements.listAll()`
5. all reviews from `reviews.listAll()`
6. all artifacts from `artifacts.listAll()`
7. all reports from `reports.listAll()`
8. all comments from `comments.listAll()`
9. all events from `events.listAll()`
10. all notifications from `notifications.listAll()`

Within each record kind, preserve that repository method's ordering. Do not
add a sync-specific sort.

Events are emitted after comments because comments are the ordinary
back-and-forth content and events are the timeline around product records.
Notifications remain last because they are per-recipient wake-up records that
can point at any product record, including comments and events.

Event target refs are opaque; pull does not require the target to exist or
appear earlier in the patch.

## Client View Keys

Add this stable key:

```text
events/<eventId>
```

Example:

```text
events/event_123
```

Existing keys remain unchanged:

```text
projects/<projectId>
tasks/<taskId>
experiments/<experimentId>
measurements/<measurementId>
reviews/<reviewId>
artifacts/<artifactId>
reports/<reportId>
comments/<commentId>
notifications/<notificationId>
```

## Client View Values

Patch `put` values are JSON versions of the corresponding product records.

Values preserve the same field names as the TypeScript record returned by the
primitive repository. Optional `undefined` fields are omitted from the JSON
value.

The pull layer may continue using the existing generic product-record JSON
conversion used for projects, tasks, experiments, measurements, reviews,
artifacts, reports, comments, and notifications. Pull response values must be
valid JSON values.

Example event value:

```json
{
  "id": "event_123",
  "target": {
    "targetKind": "experiment",
    "targetId": "experiment_123"
  },
  "actor": {
    "actorKind": "local_agent",
    "actorId": "scientist-1",
    "displayName": "Scientist 1"
  },
  "summaryMarkdown": "Revised experiment to revision 2",
  "bodyMarkdown": "The revision improves edge-case handling.",
  "metadata": {
    "createdAt": "2026-05-13T12:00:00.000Z",
    "updatedAt": "2026-05-13T12:00:00.000Z"
  }
}
```

If `actor.displayName` or `bodyMarkdown` is `undefined` in the TypeScript
record, omit that property from the JSON value. Do not serialize omitted
optional fields as `null`.

Do not add event interpretations, denormalized target state, inferred workflow
state, UI-only fields, runtime state, or scheduler state to event values.

## Consistency

Pull processing still reads all supported product records and
`lastMutationIDChanges` inside one SQLite transaction using the existing
`withTransaction` helper from `projects/app/src/db/`.

Pull remains read-only from the product point of view. It must not create,
update, or delete product records.

Because Replicache push commits product effects and `last_mutation_id`
together, a pull transaction that reads both gets a consistent local snapshot.

## Tests

Implementation should include focused tests for:

- repository `listAll` returns every event in `created_at ASC, id ASC` order
- the app repository bundle exposes `events.listAll()` through
  `context.repositories.events`
- the full reset patch includes events after comments and before notifications
- event values preserve record field names, target refs, actor refs, summary
  Markdown, optional body Markdown, and metadata
- optional `actor.displayName` and `bodyMarkdown` values that are `undefined`
  are omitted from JSON values
- pull remains read-only by comparing product table counts before and after
  pull, including `events`
- the pull test product-count helper includes `events` so the read-only
  assertion covers event rows
- `lastMutationIDChanges`, `cookie: null`, request validation, and empty
  product database behavior remain unchanged
- when the product database is empty, `patch` is exactly
  `[{ "op": "clear" }]`

Existing HTTP validation and database-opening-order tests are sufficient
because this ADR does not change routing, request validation, or when the
database is opened. If an existing HTTP pull test asserts the full response
body, update that expectation to include event `put` operations whenever the
test fixture creates events. No additional route-only HTTP test is required.

## Boundaries

Do not add push mutators in this ADR.

Do not add REST endpoints.

Do not add sync code to primitive packages.

Do not infer state from events, move tasks, move experiments, create
notifications, generate reports, read files, hash files, copy artifacts, spawn
agents, schedule work, or open provider sessions.

Do not add incremental pull cookies or sync-specific product tables.

## Consequences

The sync client can now see timeline events created through Replicache push,
CLI commands, app actions, or other product actions that explicitly compose
event creation.

Projects, tasks, experiments, measurements, reviews, artifacts, reports,
comments, events, and notifications form the current visible local
collaboration view without introducing hidden workflow state.
