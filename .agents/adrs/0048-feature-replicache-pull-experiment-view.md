---
status: active
category: feature
created: 2026-05-14
---

# 0048. Feature: Replicache Pull for Experiment View

## Context

ADR 0047 adds Replicache push mutators for experiments. A sync client that can
create, move, assign, and revise experiments also needs to read those records
back through the same local sync surface.

Experiments are visible candidate-work records. They should appear in pull as
ordinary product records, not as hidden workflow runs, runtime handles,
scheduler jobs, worktree commands, or agent sessions.

ADR 0044 starts pull with projects and tasks. ADR 0046 extends pull with
comments and notifications. This ADR adds experiments to the same full-reset
pull view.

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
put comments/*
put notifications/*
```

Do not add new HTTP routes.

## Pull Patch Order

The first patch operation remains:

```json
{ "op": "clear" }
```

The remaining `put` operations are emitted in this order:

1. all projects from unfiltered `projects.list()`
2. all tasks from unfiltered `tasks.list()`
3. all experiments from unfiltered `experiments.list()`
4. all comments from `comments.listAll()`
5. all notifications from `notifications.listAll()`

Within each record kind, preserve that repository method's ordering. Do not
add a sync-specific sort.

## Client View Keys

Add this stable key:

```text
experiments/<experimentId>
```

Example:

```text
experiments/experiment_123
```

Existing keys remain unchanged:

```text
projects/<projectId>
tasks/<taskId>
comments/<commentId>
notifications/<notificationId>
```

## Client View Values

Patch `put` values are JSON versions of the corresponding product records.

Values preserve the same field names as the TypeScript record returned by the
primitive repository. Optional `undefined` fields are omitted from the JSON
value.

The existing record-to-JSON conversion may be reused. Do not add
experiment-specific field mapping unless it is needed to preserve the
record-field contract or omit `undefined` optional fields.

Example experiment value:

```json
{
  "id": "experiment_123",
  "projectId": "project_123",
  "taskId": "task_123",
  "title": "Try beam search",
  "summaryMarkdown": "Improve the scorer pass.",
  "status": "ready_for_review",
  "revisionNumber": 2,
  "baseRef": "main",
  "branchName": "experiment/beam-search",
  "worktreePath": "/tmp/situ/worktrees/beam-search",
  "assignedTo": {
    "actorKind": "local_agent",
    "actorId": "verifier-1",
    "displayName": "Verifier 1"
  },
  "createdBy": {
    "actorKind": "local_agent",
    "actorId": "scientist-1",
    "displayName": "Scientist 1"
  },
  "metadata": {
    "createdAt": "2026-05-13T12:00:00.000Z",
    "updatedAt": "2026-05-13T12:05:00.000Z"
  }
}
```

If `baseRef`, `branchName`, `worktreePath`, `assignedTo`, or actor
`displayName` is `undefined` in the TypeScript record, omit that property from
the JSON value. Do not serialize omitted optional fields as `null`.

Do not add denormalized parent task/project records, review summaries,
measurement summaries, artifact summaries, UI-only fields, workflow state, or
runtime state to the experiment value.

## Repository Contract

Use the existing experiment repository from ADR 0020:

```ts
export type ExperimentRepository = {
  // existing members remain
  readonly list: (input?: ListExperimentsInput) => readonly ExperimentRecord[];
};
```

Pull reads experiments with unfiltered `experiments.list()`.

`experiments.list()` returns experiments ordered by:

```sql
created_at ASC, id ASC
```

Do not add a separate `listAll` method for experiments in this ADR unless the
existing repository contract is later changed. Unfiltered `list()` already
means "all experiments".

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

- the full reset patch includes experiments after tasks and before comments
- experiment values preserve record field names, revision number, assignment,
  branch/worktree refs, creator attribution, and metadata
- optional experiment fields that are `undefined` are omitted from JSON values
- pull remains read-only by comparing product table counts before and after
  pull, including `experiments`
- `lastMutationIDChanges`, `cookie: null`, request validation, and clear-only
  behavior remain unchanged

If an existing product-count test helper is used, update that helper to include
`experiments`.

The HTTP route does not need separate endpoint tests for experiment records
because ADR 0044 already covers route behavior. Add HTTP coverage only if the
implementation changes HTTP behavior, which this ADR should not do.

## Boundaries

Do not add push mutators in this ADR.

Do not add pull records for measurements, artifacts, reviews, reports, or
events in this ADR.

Although experiment push and app actions may create event records, this pull
slice still excludes `events/*`.

Do not add REST endpoints.

Do not add sync code to primitive packages.

Do not create worktrees, execute commands, spawn agents, schedule work, or
open provider sessions.

Do not add incremental pull cookies or sync-specific product tables.

## Consequences

The sync client can now see candidate-work records that were created or
updated through Replicache push, CLI commands, or app actions.

Projects, tasks, experiments, comments, and notifications form the current
visible local collaboration view without introducing hidden workflow state.
