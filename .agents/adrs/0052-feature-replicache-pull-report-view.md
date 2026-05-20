---
status: active
category: feature
created: 2026-05-14
---

# 0052. Feature: Replicache Pull for Report View

## Context

ADR 0051 adds a Replicache push mutator for ordinary report records. A sync
client that can create reports also needs to read reports back through the same
local sync surface.

Reports are durable Markdown records attached to projects and target records.
They preserve generated summaries, final findings, handoff notes, eval reports,
and other longer-form written output.

Pull should expose report records as product records. Pull should not generate
reports, render Markdown, inspect artifacts, summarize experiments, run
commands, or add workflow state.

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
put notifications/*
```

Do not add new HTTP routes.

## Repository Contract Extension

The pull implementation should keep reading product records through app
repositories, not direct sync-owned SQL.

Extend the report repository from ADR 0024 with:

```ts
export type ReportRepository = {
  // existing members remain
  readonly listAll: () => readonly ReportRecord[];
};
```

`listAll` returns every report ordered by:

```sql
created_at ASC, id ASC
```

This is a primitive repository read method. It does not emit events, create
notifications, mutate records, apply filters, check target existence, generate
reports, render Markdown, or run filesystem work.

Adding `listAll` to `@situ/reports` is in scope. The method must not import
sync types, know about Replicache keys, or contain pull-specific logic.

The implementation should use an unfiltered query shaped like:

```sql
SELECT *
FROM reports
ORDER BY created_at ASC, id ASC
```

Map rows through the existing repository row-to-record function.

Do not add CLI commands for this list-all method in this ADR. Existing CLI
commands stay focused on project, target, and recent-report workflows.

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
9. all notifications from `notifications.listAll()`

Within each record kind, preserve that repository method's ordering. Do not
add a sync-specific sort.

Reports are emitted after artifacts because reports often summarize evidence or
point at artifacts. Report target refs are still opaque; pull does not require
the target to exist or appear earlier in the patch. Comments remain after
reports because comments are the ordinary back-and-forth layer around product
records.

## Client View Keys

Add this stable key:

```text
reports/<reportId>
```

Example:

```text
reports/report_123
```

Existing keys remain unchanged:

```text
projects/<projectId>
tasks/<taskId>
experiments/<experimentId>
measurements/<measurementId>
reviews/<reviewId>
artifacts/<artifactId>
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
artifacts, comments, and notifications. Pull response values must be valid JSON
values.

Example report value:

```json
{
  "id": "report_123",
  "projectId": "project_123",
  "target": {
    "targetKind": "experiment",
    "targetId": "experiment_123"
  },
  "title": "Spelling Corrector Run",
  "bodyMarkdown": "# Findings\n\nThe best experiment reached 8.4.",
  "generatedBy": {
    "actorKind": "local_agent",
    "actorId": "scientist-1",
    "displayName": "Scientist 1"
  },
  "metadata": {
    "createdAt": "2026-05-13T12:00:00.000Z",
    "updatedAt": "2026-05-13T12:00:00.000Z"
  }
}
```

If `generatedBy.displayName` is `undefined` in the TypeScript record, omit that
property from the JSON value. Do not serialize omitted optional fields as
`null`.

Do not add generated summaries, rendered HTML, file contents, UI-only fields,
workflow state, or runtime state to report values.

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

- repository `listAll` returns every report in `created_at ASC, id ASC` order
- the full reset patch includes reports after artifacts and before comments
- report values preserve record field names, project id, target refs, title,
  Markdown body, actor refs, and metadata
- optional `generatedBy.displayName` values that are `undefined` are omitted
  from JSON values
- pull remains read-only by comparing product table counts before and after
  pull, including `reports`
- the pull test product-count helper includes `reports` so the read-only
  assertion covers report rows
- `lastMutationIDChanges`, `cookie: null`, request validation, and empty
  product database behavior remain unchanged
- when the product database is empty, `patch` is exactly
  `[{ "op": "clear" }]`

When tests use a pull product-count helper, it counts these product tables:
`projects`, `tasks`, `experiments`, `measurements`, `reviews`, `artifacts`,
`reports`, `comments`, and `notifications`.

Existing HTTP validation tests are sufficient because ADR 0044 already covers
route behavior. This ADR does not require new HTTP tests unless the
implementation changes HTTP behavior, pull request validation, or database
opening order, which it should not do.

## Boundaries

Do not add push mutators in this ADR.

Do not add pull records for events in this ADR.

Although report app actions and push mutations may coexist with event records,
this pull slice still excludes `events/*`.

Do not add REST endpoints.

Do not add sync code to primitive packages.

Do not generate reports, render Markdown, read files, hash files, copy
artifacts, spawn agents, schedule work, or open provider sessions.

Do not add incremental pull cookies or sync-specific product tables.

## Consequences

The sync client can now see report records created through Replicache push, CLI
commands, or app actions.

Projects, tasks, experiments, measurements, reviews, artifacts, reports,
comments, and notifications form the current visible local collaboration view
without introducing hidden workflow state.
