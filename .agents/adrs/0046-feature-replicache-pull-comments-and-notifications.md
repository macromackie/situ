---
status: active
category: feature
created: 2026-05-14
---

# 0046. Feature: Replicache Pull for Comments and Notifications

## Context

ADR 0045 adds Replicache push mutators for comments and notifications. A sync
client that can write those records also needs to read them back through the
same local sync surface.

ADR 0044 intentionally started pull with projects and tasks only. This ADR
extends that reset-style pull view to Situ's simplest collaboration records:

- comments
- notifications

The goal is still a clear full-snapshot pull, not an incremental sync engine.

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
put comments/*
put notifications/*
```

Do not add new HTTP routes.

## Repository Contract Extensions

The pull implementation should keep reading product records through app
repositories, not direct sync-owned SQL.

Extend the comment repository from ADR 0017 with:

```ts
export type CommentRepository = {
  // existing members remain
  readonly listAll: () => readonly CommentRecord[];
};
```

Add `listAll` to the existing `CommentRepository` type. Do not remove or
replace existing members such as `create`, `getById`, or `listForTarget`.

`listAll` returns every comment ordered by:

```sql
created_at ASC, id ASC
```

Extend the notification repository from ADR 0019 with:

```ts
export type NotificationRepository = {
  // existing members remain
  readonly listAll: () => readonly NotificationRecord[];
};
```

Add `listAll` to the existing `NotificationRepository` type. Do not remove or
replace existing members such as `create`, `getById`, `listForRecipient`,
`markRead`, or `dismiss`.

`listAll` returns every notification, including unread, read, and dismissed
notifications, ordered by:

```sql
created_at ASC, id ASC
```

These methods are primitive repository read methods. They do not emit events,
create notifications, mutate records, or apply recipient filtering.

Do not add comment or notification CLI commands for these list-all methods in
this ADR. Existing CLI commands stay focused on target and inbox workflows.

## Pull Patch Order

The first patch operation remains:

```json
{ "op": "clear" }
```

The remaining `put` operations are emitted in this order:

1. all projects from unfiltered `projects.list()`
2. all tasks from unfiltered `tasks.list()`
3. all comments from `comments.listAll()`
4. all notifications from `notifications.listAll()`

Within each record kind, preserve that repository method's ordering.

## Client View Keys

Add these stable keys:

```text
comments/<commentId>
notifications/<notificationId>
```

Examples:

```text
comments/comment_123
notifications/notification_123
```

Existing project and task keys from ADR 0044 are unchanged:

```text
projects/<projectId>
tasks/<taskId>
```

## Client View Values

Patch `put` values are JSON versions of the corresponding product records.

Values preserve the same field names as the TypeScript record returned by the
primitive repository. Optional `undefined` fields are omitted from the JSON
value.

Example comment value:

```json
{
  "id": "comment_123",
  "target": {
    "targetKind": "task",
    "targetId": "task_123"
  },
  "bodyMarkdown": "Ready for review.",
  "author": {
    "actorKind": "local_agent",
    "actorId": "worker-1",
    "displayName": "Worker 1"
  },
  "metadata": {
    "createdAt": "2026-05-13T12:00:00.000Z",
    "updatedAt": "2026-05-13T12:00:00.000Z"
  }
}
```

Example dismissed notification value:

```json
{
  "id": "notification_123",
  "recipient": {
    "actorKind": "human",
    "actorId": "scott"
  },
  "target": {
    "targetKind": "comment",
    "targetId": "comment_123"
  },
  "createdBy": {
    "actorKind": "local_agent",
    "actorId": "worker-1"
  },
  "summaryMarkdown": "Review handoff comment.",
  "bodyMarkdown": "Please inspect the attached comment.",
  "readAt": "2026-05-13T12:05:00.000Z",
  "dismissedAt": "2026-05-13T12:06:00.000Z",
  "metadata": {
    "createdAt": "2026-05-13T12:00:00.000Z",
    "updatedAt": "2026-05-13T12:06:00.000Z"
  }
}
```

If an actor `displayName`, notification `bodyMarkdown`, `readAt`, or
`dismissedAt` is `undefined` in the TypeScript record, omit that property from
the JSON value. Do not serialize omitted optional fields as `null`.

Do not add denormalized target records, recipient inbox summaries, UI-only
fields, or workflow state.

## Consistency

Pull processing still reads all supported product records and
`lastMutationIDChanges` inside one SQLite transaction using the existing
`withTransaction` helper from `projects/app/src/db/`.

Pull remains read-only from the product point of view. It must not create,
update, or delete product records.

This read-only requirement applies to `processReplicachePull`. Opening a
file-backed database through HTTP may still apply migrations before pull
processing starts. Tests for read-only behavior should compare product table
counts or records before and after `processReplicachePull`, not migration
metadata.

## Tests

Implementation should include focused tests for:

- comment repository `listAll` returns all comments ordered by
  `created_at ASC, id ASC`
- notification repository `listAll` returns unread, read, and dismissed
  notifications ordered by `created_at ASC, id ASC`
- Replicache pull returns comments and notifications after project/task records
- pull values preserve target refs, actor refs, read timestamps, dismissed
  timestamps, and metadata fields
- `processReplicachePull` leaves product table counts or records unchanged
- HTTP pull behavior remains covered by existing route tests unless the route
  behavior changes

## Boundaries

Do not add an incremental diff algorithm in this ADR.

Do not add pull views for events, experiments, measurements, artifacts,
reviews, or reports in this ADR.

Do not add REST endpoints, CLI commands, server runtimes, auth, notification
delivery, workers, schedulers, leases, agent sessions, or provider runtime
concepts.

Do not add recipient-specific filtering to Replicache pull in this ADR. The
local reset pull returns the supported local view.

Do not add comment kinds, notification kinds, formal handoff schemas, or
workflow-specific payload parsing.

## Consequences

The local sync read surface now includes the visible back-and-forth records
created by ADR 0045:

```text
push comment/notification mutations
  -> persist collaboration records
  -> pull projects, tasks, comments, and notifications in one reset view
```

This keeps sync aligned with Situ's human-like primitives without making pull a
workflow engine or an incremental sync subsystem.
