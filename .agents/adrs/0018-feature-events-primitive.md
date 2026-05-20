---
status: active
category: feature
created: 2026-05-13
---

# 0018. Feature: Events Primitive

## Context

Events are the append-only timeline for Situ records. They let a later actor see
what changed without relying on terminal scrollback, private agent context, or a
hidden workflow engine.

Events should read like human activity: a short summary, optional Markdown
detail, visible actor attribution, and a target record.

## Decision

The `@situ/events` primitive package owns event records, event schema, event
repository functions, and event-local mutation helpers.

Events attach to a generic `TargetRef` from `@situ/common`. The events package
does not import project, task, comment, experiment, review, artifact, or report
packages.

Expected imports:

- `Database` from `bun:sqlite`
- `ActorRef`, `IsoTimestamp`, `SituId`, `SyncMetadata`, `TargetRef`,
  `createId`, and `createSyncMetadata` from `@situ/common`
- `ConflictError` and `ValidationError` from `@situ/errors`

## Record Shape

An event record is:

```ts
export type EventRecord = {
  readonly id: SituId<"event">;
  readonly target: TargetRef;
  readonly actor: ActorRef;
  readonly summaryMarkdown: string;
  readonly bodyMarkdown?: string;
  readonly metadata: SyncMetadata;
};
```

Field meaning:

- `id`: Situ-owned event id
- `target`: product record this event belongs to
- `actor`: visible attribution for the actor that caused the event
- `summaryMarkdown`: short Markdown timeline summary
- `bodyMarkdown`: optional Markdown detail
- `metadata`: shared creation/update timestamps

`summaryMarkdown` must be non-empty after trimming whitespace. `bodyMarkdown`,
when provided, must be non-empty after trimming whitespace. Stored values use
the trimmed strings.

Events do not have a rigid `kind` enum. If a task moved, a review was requested,
or an experiment finished, the event summary says that in Markdown. Structured
state belongs on the target primitive records.

## Append-Only Rule

Events are append-only. The events package exports create, get, and list
repository methods only. It does not export update, delete, archive, or move
helpers.

If a previous event was wrong, create a new event that explains the correction.

## Schema

The event schema fragment creates an `events` table:

```sql
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_display_name TEXT,
  summary_markdown TEXT NOT NULL,
  body_markdown TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

It also creates these indexes:

```sql
CREATE INDEX IF NOT EXISTS events_target_idx
  ON events (target_kind, target_id);

CREATE INDEX IF NOT EXISTS events_actor_id_idx
  ON events (actor_id);

CREATE INDEX IF NOT EXISTS events_created_at_idx
  ON events (created_at);
```

The exact export name is:

```ts
export const eventsSchemaFragment = {
  packageName: "events",
  statements: [
    createEventsTableStatement,
    createEventsTargetIndexStatement,
    createEventsActorIdIndexStatement,
    createEventsCreatedAtIndexStatement,
  ],
} as const;
```

The individual schema statement constants shown above are exported.

The events table does not use foreign keys for `target_id` because targets are
polymorphic across primitive packages. App actions own target existence checks
when that matters.

## Mutation Helpers

The package exports one pure record helper:

```ts
export type CreateEventRecordInput = {
  readonly id?: SituId<"event">;
  readonly target: TargetRef;
  readonly actor: ActorRef;
  readonly summaryMarkdown: string;
  readonly bodyMarkdown?: string;
  readonly now?: IsoTimestamp;
};

export function createEventRecord(input: CreateEventRecordInput): EventRecord;
```

`createEventRecord` generates an id with `createId({ prefix: "event" })` when
one is not provided, validates fields, and sets `createdAt` and `updatedAt` to
the same timestamp.

Provided `id`, `target.targetKind`, and `target.targetId` are compile-time typed
values and do not get runtime target validation in this package.

Provided `now` values are passed to `createSyncMetadata({ now })` so they are
validated and normalized. When `now` is absent, that helper chooses the current
timestamp.

Actor refs are normalized by trimming `actorKind`, `actorId`, and `displayName`.
`actorKind` and `actorId` must be non-empty. `displayName` is optional but must
be non-empty when provided. Stored actor refs use trimmed values.

Actor refs are runtime-normalized for whitespace and non-empty fields only.
`actorKind` is otherwise treated as a compile-time `ActorRef["actorKind"]`
value.

Runtime validation scope:

- `summaryMarkdown`: trimmed and required to be non-empty
- `bodyMarkdown`: trimmed and required to be non-empty when provided
- `actor.actorKind`: trimmed and required to be non-empty
- `actor.actorId`: trimmed and required to be non-empty
- `actor.displayName`: trimmed and required to be non-empty when provided
- `target`: not runtime-validated or trimmed
- `id`: not runtime-validated beyond TypeScript

Validation failures throw `ValidationError`.

## Repository

The package exports a SQLite repository:

```ts
export type CreateEventRepositoryInput = {
  readonly database: Database;
};

export type CreateEventInput = Omit<CreateEventRecordInput, "id"> & {
  readonly id?: SituId<"event">;
};

export type ListEventsForTargetInput = {
  readonly target: TargetRef;
};

export type ListRecentEventsInput = {
  readonly limit?: number;
};

export type EventRepository = {
  readonly create: (input: CreateEventInput) => EventRecord;
  readonly getById: (input: { readonly id: SituId<"event"> }) => EventRecord | undefined;
  readonly listForTarget: (input: ListEventsForTargetInput) => readonly EventRecord[];
  readonly listRecent: (input?: ListRecentEventsInput) => readonly EventRecord[];
};

export function createEventRepository(input: CreateEventRepositoryInput): EventRepository;
```

The repository accepts a `Database` from the caller. It must not open its own
database connection.

`create` inserts the event and returns the stored record. Duplicate ids throw
`ConflictError`. Invalid caller inputs throw `ValidationError`. Unexpected
SQLite failures may surface as ordinary database errors.

`getById` returns `undefined` when an event does not exist.

`listForTarget` returns events ordered by `created_at ASC, id ASC`.

`listRecent` returns events ordered by `created_at DESC, id DESC`. The default
limit is `50`. Limits greater than `500` are accepted and executed as `500`.
Non-finite, non-integer, zero, negative, or non-number limits throw
`ValidationError`.

`create` identifies duplicate ids by catching SQLite primary-key constraint
failures for `events.id`. `getById` does not runtime-validate `id`; it queries
using the provided value.

Repository methods do not runtime-validate or trim `target.targetKind` or
`target.targetId`; those values are treated as already-typed `TargetRef` values
and are used as provided.

Repository methods do not create transactions themselves. App actions own outer
transactions when a write spans multiple primitives. Repository methods return
the mapped persisted row shape after writes.

Repository row mapping is:

- `id` maps to `EventRecord.id`
- `target_kind` maps to `EventRecord.target.targetKind`
- `target_id` maps to `EventRecord.target.targetId`
- `actor_kind` maps to `EventRecord.actor.actorKind`
- `actor_id` maps to `EventRecord.actor.actorId`
- `actor_display_name` maps to `EventRecord.actor.displayName`
- `summary_markdown` maps to `EventRecord.summaryMarkdown`
- `body_markdown` maps to `EventRecord.bodyMarkdown`
- `created_at` maps to `EventRecord.metadata.createdAt`
- `updated_at` maps to `EventRecord.metadata.updatedAt`

When optional fields are `undefined`, the repository stores SQL `NULL`. When
reading SQL `NULL`, the repository returns `undefined`.

Input invariants are enforced by mutation helpers and repository entrypoints.
The events SQL schema is not responsible for rejecting empty trimmed strings.

Only duplicate primary-key conflicts for `events.id` are translated to
`ConflictError`; other unexpected SQLite constraint failures may surface as
ordinary database errors.

## Boundaries

Do not add event kinds, workflow statuses, notification delivery, comments,
review state, or target existence checks to the events package. Cross-primitive
behavior belongs in app actions.

Do not store agent runtime sessions, provider threads, workers, leases, or
scheduler state on events.

## Consequences

Events provide a durable timeline without turning every action into a workflow
engine. Later app actions can append events around project, task, comment,
review, experiment, and notification changes while this package remains a small
primitive.
