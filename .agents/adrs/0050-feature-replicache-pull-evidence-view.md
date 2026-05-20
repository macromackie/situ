---
status: active
category: feature
created: 2026-05-14
---

# 0050. Feature: Replicache Pull for Evidence View

## Context

ADR 0049 adds Replicache push mutators for measurements, artifacts, and
reviews. A sync client that can create evidence records also needs to read
those records back through the same local sync surface.

Measurements, reviews, and artifacts are visible evidence around baselines and
experiments:

- measurements record numeric observations for a baseline or an experiment
  revision
- reviews record feedback and decisions for an experiment revision
- artifacts point at durable evidence attached to a target record

These records should appear in pull as ordinary product records. Pull should
not interpret evidence, run commands, read files, summarize reviews, or add
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
put baselines/*
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

## Repository Contract Extensions

The pull implementation should keep reading product records through app
repositories, not direct sync-owned SQL.

Extend the measurement repository from ADR 0021 with:

```ts
export type MeasurementRepository = {
  // existing members remain
  readonly listAll: () => readonly MeasurementRecord[];
};
```

`listAll` returns every measurement ordered by:

```sql
created_at ASC, id ASC
```

Extend the review repository from ADR 0023 with:

```ts
export type ReviewRepository = {
  // existing members remain
  readonly listAll: () => readonly ReviewRecord[];
};
```

`listAll` returns every review ordered by:

```sql
created_at ASC, id ASC
```

Extend the artifact repository from ADR 0022 with:

```ts
export type ArtifactRepository = {
  // existing members remain
  readonly listAll: () => readonly ArtifactRecord[];
};
```

`listAll` returns every artifact ordered by:

```sql
created_at ASC, id ASC
```

These methods are primitive repository read methods. They do not emit events,
create notifications, mutate records, apply filters, check target existence,
or run filesystem work.

Adding `listAll` primitive repository methods to `@situ/measurements`,
`@situ/reviews`, and `@situ/artifacts` is in scope. These methods must not
import sync types, know about Replicache keys, or contain pull-specific logic.

Each `listAll` implementation should use an unfiltered query shaped like:

```sql
SELECT *
FROM <table>
ORDER BY created_at ASC, id ASC
```

Map rows through the existing repository row-to-record function for that
package.

Do not add CLI commands for these list-all methods in this ADR. Existing CLI
commands stay focused on target, experiment, and recent-record workflows.

## Pull Patch Order

The first patch operation remains:

```json
{ "op": "clear" }
```

The remaining `put` operations are emitted in this order:

1. all projects from unfiltered `projects.list()`
2. all tasks from unfiltered `tasks.list()`
3. all baselines from unfiltered `baselines.list()`
4. all experiments from unfiltered `experiments.list()`
5. all measurements from `measurements.listAll()`
6. all reviews from `reviews.listAll()`
7. all artifacts from `artifacts.listAll()`
8. all reports from `reports.listAll()`
9. all comments from `comments.listAll()`
10. all events from `events.listAll()`
11. all notifications from `notifications.listAll()`

Within each record kind, preserve that repository method's ordering. Do not
add a sync-specific sort.

Artifacts are emitted after measurements and reviews because artifacts often
point at evidence records. Artifact target refs are still opaque; pull does
not require the target to exist or appear earlier in the patch.

## Client View Keys

Add these stable keys:

```text
measurements/<measurementId>
reviews/<reviewId>
artifacts/<artifactId>
```

Examples:

```text
measurements/measurement_123
reviews/review_123
artifacts/artifact_123
```

Existing keys remain unchanged:

```text
projects/<projectId>
tasks/<taskId>
baselines/<baselineId>
experiments/<experimentId>
reports/<reportId>
comments/<commentId>
events/<eventId>
notifications/<notificationId>
```

## Client View Values

Patch `put` values are JSON versions of the corresponding product records.

Values preserve the same field names as the TypeScript record returned by the
primitive repository. Optional `undefined` fields are omitted from the JSON
value.

The existing record-to-JSON conversion may be reused. Do not add
evidence-specific field mapping unless it is needed to preserve the
record-field contract or omit `undefined` optional fields.

The pull layer may continue using the existing generic product-record JSON
conversion used for projects, tasks, experiments, comments, and notifications.
Pull response values must be valid JSON values. Implementations must not
serialize non-finite product numbers as `null`; evidence record constructors
and repositories are expected to preserve finite numeric values only.

Example measurement value:

```json
{
  "id": "measurement_123",
  "baselineId": "baseline_123",
  "metricName": "goal score",
  "numericValue": 6.4,
  "unit": "points",
  "summaryMarkdown": "Native score before candidate changes.",
  "detailsMarkdown": "Measured against the spelling-corrector fixture.",
  "measuredBy": {
    "actorKind": "local_agent",
    "actorId": "scientist-1"
  },
  "metadata": {
    "createdAt": "2026-05-13T12:00:00.000Z",
    "updatedAt": "2026-05-13T12:00:00.000Z"
  }
}
```

Example review value:

```json
{
  "id": "review_123",
  "experimentId": "experiment_123",
  "revisionNumber": 2,
  "decision": "changes_requested",
  "bodyMarkdown": "The approach works, but update the edge-case handling.",
  "reviewer": {
    "actorKind": "local_agent",
    "actorId": "verifier-1",
    "displayName": "Verifier 1"
  },
  "metadata": {
    "createdAt": "2026-05-13T12:01:00.000Z",
    "updatedAt": "2026-05-13T12:01:00.000Z"
  }
}
```

Example artifact value:

```json
{
  "id": "artifact_123",
  "target": {
    "targetKind": "review",
    "targetId": "review_123"
  },
  "title": "Review log",
  "summaryMarkdown": "Captured verifier output.",
  "uri": "file:///tmp/situ/review.log",
  "mediaType": "text/plain",
  "byteSize": 42,
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "createdBy": {
    "actorKind": "local_agent",
    "actorId": "verifier-1"
  },
  "metadata": {
    "createdAt": "2026-05-13T12:02:00.000Z",
    "updatedAt": "2026-05-13T12:02:00.000Z"
  }
}
```

If measurement `unit` or `detailsMarkdown`, review actor `displayName`, or
artifact `mediaType`, `byteSize`, `sha256`, or actor `displayName` is
`undefined` in the TypeScript record, omit that property from the JSON value.
Do not serialize omitted optional fields as `null`.

Do not add denormalized experiment summaries, review summaries, measurement
interpretations, artifact file contents, UI-only fields, workflow state, or
runtime state to these values.

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

- repository `listAll` methods for measurements, reviews, and artifacts return
  every record in `created_at ASC, id ASC` order
- the full reset patch includes baselines after tasks, measurements after
  experiments, reviews after measurements, artifacts after reviews, reports
  after artifacts, comments after reports, events after comments, and
  notifications after events
- measurement values preserve record field names, numeric values, optional
  fields, actor refs, and metadata
- review values preserve record field names, decisions, actor refs, and
  metadata
- artifact values preserve record field names, target refs, optional metadata,
  actor refs, and metadata
- optional evidence fields that are `undefined` are omitted from JSON values
- pull remains read-only by comparing product table counts before and after
  pull, including `baselines`, `measurements`, `reviews`, and `artifacts`
- `lastMutationIDChanges`, `cookie: null`, request validation, and clear-only
  behavior remain unchanged

When tests use a pull product-count helper, it counts these product tables:
`projects`, `tasks`, `baselines`, `experiments`, `measurements`, `reviews`,
`artifacts`, `reports`, `comments`, `events`, and `notifications`.

The HTTP route does not need separate endpoint tests for evidence records
because ADR 0044 already covers route behavior. Add HTTP coverage only if the
implementation changes HTTP behavior, which this ADR should not do.

## Boundaries

Do not add push mutators in this ADR.

Do not add pull records for reports or events in this ADR.

Although evidence creation and app actions may coexist with event records,
this pull slice still excludes `events/*`.

Do not add REST endpoints.

Do not add sync code to primitive packages.

Do not create worktrees, execute commands, read files, hash files, copy
artifacts, spawn agents, schedule work, or open provider sessions.

Do not add incremental pull cookies or sync-specific product tables.

## Consequences

The sync client can now see the core evidence records around experiment
revisions that were created through Replicache push, CLI commands, or app
actions.

Projects, tasks, experiments, measurements, reviews, artifacts, comments, and
notifications form the current visible local collaboration view without
introducing hidden workflow state.
