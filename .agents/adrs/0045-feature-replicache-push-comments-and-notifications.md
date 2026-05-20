---
status: active
category: feature
created: 2026-05-14
---

# 0045. Feature: Replicache Push for Comments and Notifications

## Context

ADR 0043 adds `POST /replicache/push` for project and task mutations.

Comments and notifications are the simplest back-and-forth primitives in Situ:

- comments preserve Markdown context on a visible target record
- notifications preserve actor inbox attention on a visible target record

Adding these mutators lets a sync client create ordinary handoff text and inbox
records without adding workflow-specific endpoints, workers, schedulers, or
hidden runtime state.

## Decision

Extend the existing Replicache push route from ADR 0043 with comment and
notification mutators.

Add these supported mutator names:

- `comments.create`
- `notifications.create`
- `notifications.read`
- `notifications.dismiss`

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

The new mutators call the existing comment and notification app actions through
the `AppActionContext` provided by sync.

Comment and notification actions do not own their own transactions. Sync may
call those actions inside the existing ADR 0043 product-effect transaction so
the product effect and `last_mutation_id` update remain atomic.

Do not make comments emit notifications automatically in this ADR. A comment is
itself visible context. If a caller wants another actor's attention, it should
also send a separate `notifications.create` mutation.

Do not make notifications emit events. Notification read and dismissal state
belongs to the notification record itself.

## Supported Mutators

`comments.create` args:

```ts
type CreateCommentMutationArgs = {
  readonly id: SituId<"comment">;
  readonly target: TargetRef;
  readonly bodyMarkdown: string;
  readonly author: ActorRef;
  readonly now?: IsoTimestamp;
};
```

`notifications.create` args:

```ts
type CreateNotificationMutationArgs = {
  readonly id: SituId<"notification">;
  readonly recipient: {
    readonly recipientId: string;
    readonly displayName?: string;
  };
  readonly target: TargetRef;
  readonly createdBy: ActorRef;
  readonly summaryMarkdown: string;
  readonly bodyMarkdown?: string;
  readonly now?: IsoTimestamp;
};
```

`notifications.read` args:

```ts
type ReadNotificationMutationArgs = {
  readonly id: SituId<"notification">;
  readonly now?: IsoTimestamp;
};
```

`notifications.dismiss` args:

```ts
type DismissNotificationMutationArgs = {
  readonly id: SituId<"notification">;
  readonly now?: IsoTimestamp;
};
```

Supported mutators should produce the same durable records and state changes as
the corresponding app actions:

- `createCommentAction`
- `createNotificationAction`
- `markNotificationReadAction`
- `dismissNotificationAction`

## Validation

Supported mutator args must be validated before product writes.

Validation rules:

- `args` must be an object
- required `id` fields must be non-empty strings
- `bodyMarkdown` and `summaryMarkdown` must be non-empty strings
- optional `bodyMarkdown` must be omitted or a non-empty string
- `recipient` must be an object with a non-empty `recipientId` and optional
  non-empty `displayName`
- `target` must be an object with a valid `targetKind` and non-empty `targetId`
- valid `targetKind` values are the target kinds from `@situ/common`
- `ActorRef` fields must follow the actor validation from ADR 0043
- optional `now` fields must be valid ISO timestamps according to the existing
  sync metadata helper validation

`comments.create` and `notifications.create` require caller-provided ids even
though the underlying primitive repositories can generate ids. Replicache
mutations need stable client-known ids so later sync operations can refer to
the same records without needing this ADR to add a pull view for those
primitives.

`notifications.read` and `notifications.dismiss` validate optional `now` before
calling the repository, even if the notification is already read or already
dismissed. This differs from the repository no-op behavior for invalid repeated
timestamps, but keeps sync's supported mutator validation rule simple: malformed
supported args become permanent validation errors before product writes.

If validation fails, the mutation is a permanent validation error under ADR 0043. Sync advances `last_mutation_id` for that mutation and records the
serialized validation error in the push result.

## Target Refs

The accepted target kind values are:

```ts
type TargetKind =
  | "project"
  | "task"
  | "comment"
  | "event"
  | "notification"
  | "baseline"
  | "experiment"
  | "measurement"
  | "artifact"
  | "review"
  | "report";
```

The sync validator should keep its own local runtime list of these strings
unless `@situ/common` later exports a runtime constant. Do not import private
CLI parser state to validate sync payloads.

Target refs preserve caller intent. These mutators do not check that the target
record exists unless the primitive repository already enforces that check.

## Push Result

The push result shape remains the ADR 0043 shape.

`processedMutationCount` counts these new mutators the same way it counts
project and task mutators:

- applied product effects count as processed
- permanent validation, conflict, or not-found errors count as processed after
  advancing `last_mutation_id`

`skippedMutationCount` behavior is unchanged.

## Tests

Implementation should include focused tests for:

- `comments.create` creates a comment and advances `last_mutation_id`
- `notifications.create`, `notifications.read`, and `notifications.dismiss`
  create and update notification records in order
- a comment plus notification sequence can model a handoff without any hidden
  workflow behavior by asserting one comment, one notification, zero events,
  and no new runtime or scheduler tables
- malformed supported mutator args are permanent validation errors
- nonexistent notification records for read or dismiss are permanent not-found
  errors and do not create notification records
- missing required ids are permanent validation errors
- old and future mutation skipping still applies to these mutators through the
  existing ADR 0043 push processor

The HTTP route does not need separate endpoint tests for every new mutator
because ADR 0043 already covers route behavior. Add HTTP coverage only if the
implementation changes HTTP behavior, which this ADR should not do.

## Boundaries

Do not add a pull view for comments or notifications in this ADR.

Do not add REST endpoints for comment or notification mutators.

Do not add notification delivery, polling loops, workers, schedulers, leases,
agent sessions, or provider runtime concepts.

Do not add comment kinds, notification kinds, formal handoff schemas, or
workflow-specific payload parsing.

Do not modify primitive schemas unless an existing primitive package needs a
small repository or error cleanup directly required by this ADR.

## Consequences

The local sync write surface now supports Situ's simplest collaboration loop:

```text
create or move ordinary work
  -> leave Markdown context as a comment
  -> create a notification for the next actor
  -> recipient reads or dismisses the notification through normal product state
```

This keeps back-and-forth agent collaboration visible in the same primitives
humans would use, without turning sync into a workflow engine.
