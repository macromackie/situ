---
status: active
category: feature
created: 2026-05-13
---

# 0019. Feature: Notifications Primitive

## Context

Notifications are Situ's actor inbox. They tell a human or local agent that a
visible record likely needs attention without turning that attention into a
hidden job, lease, workflow edge, or scheduler command.

A notification should feel like a simple product notification: who it is for,
which inbox it is for, what record it points at, a Markdown summary, optional detail, whether it has
been read, and whether it has been dismissed from the inbox.

## Decision

The `@situ/notifications` primitive package owns notification records,
notification schema, notification repository functions, and notification-local
mutation helpers.

Notifications attach to a generic `TargetRef` from `@situ/common`. The
notifications package does not import project, task, comment, event,
experiment, review, artifact, measurement, or report packages.

Expected imports:

- `Database` from `bun:sqlite`
- `ActorRef`, `IsoTimestamp`, `SituId`, `SyncMetadata`, `TargetRef`,
  `createId`, `createSyncMetadata`, and `touchSyncMetadata` from `@situ/common`
- `ConflictError`, `NotFoundError`, and `ValidationError` from `@situ/errors`

## Record Shape

A notification record is:

```ts
export type NotificationRecipient = {
  readonly recipientId: string;
  readonly displayName?: string;
};

export type NotificationRecord = {
  readonly id: SituId<"notification">;
  readonly recipient: NotificationRecipient;
  readonly target: TargetRef;
  readonly createdBy: ActorRef;
  readonly summaryMarkdown: string;
  readonly bodyMarkdown?: string;
  readonly readAt?: IsoTimestamp;
  readonly dismissedAt?: IsoTimestamp;
  readonly metadata: SyncMetadata;
};
```

Field meaning:

- `id`: Situ-owned notification id
- `recipient`: visible inbox owner whose inbox contains the notification
- `target`: product record the recipient should inspect
- `createdBy`: visible actor that created or caused the notification
- `summaryMarkdown`: short Markdown inbox summary
- `bodyMarkdown`: optional Markdown detail
- `readAt`: when the notification was marked read
- `dismissedAt`: when the notification was dismissed from the inbox
- `metadata`: shared creation/update timestamps

`summaryMarkdown` must be non-empty after trimming whitespace. `bodyMarkdown`,
when provided, must be non-empty after trimming whitespace. Stored values use
the trimmed strings.

Notifications do not have a `kind` field or workflow status. If a notification
is about a handoff, review request, failed experiment, or requested change, the
summary and target record say that in Markdown and visible product fields.

## Inbox Semantics

Notifications are attention records, not work records.

`readAt` means the notification itself has been seen or opened. `dismissedAt`
means the notification has been cleared from the active inbox. Neither field
means the underlying target was completed, accepted, reviewed, or acted on.

Dismissal is intentionally separate from reading. An actor may dismiss an unread
notification, and the record should preserve that distinction by setting
`dismissedAt` without inventing a `readAt` value.

Dismissed notifications remain stored. The primitive does not hard-delete
notifications.

## Schema

The notification schema fragment creates a `notifications` table:

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  recipient_display_name TEXT,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_by_kind TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_display_name TEXT,
  summary_markdown TEXT NOT NULL,
  body_markdown TEXT,
  read_at TEXT,
  dismissed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

It also creates these indexes:

```sql
CREATE INDEX IF NOT EXISTS notifications_recipient_inbox_idx
  ON notifications (recipient_id, dismissed_at, created_at, id);

CREATE INDEX IF NOT EXISTS notifications_target_idx
  ON notifications (target_kind, target_id);
```

The exact export name is:

```ts
export const notificationsSchemaFragment = {
  packageName: "notifications",
  statements: [
    createNotificationsTableStatement,
    createNotificationsRecipientInboxIndexStatement,
    createNotificationsTargetIndexStatement,
  ],
} as const;
```

The individual schema statement constants shown above are exported.

The notifications table does not use foreign keys for `target_id` because
targets are polymorphic across primitive packages. App actions own target
existence checks when that matters.

## Mutation Helpers

The package exports record helpers:

```ts
export type CreateNotificationRecordInput = {
  readonly id?: SituId<"notification">;
  readonly recipient: NotificationRecipient;
  readonly target: TargetRef;
  readonly createdBy: ActorRef;
  readonly summaryMarkdown: string;
  readonly bodyMarkdown?: string;
  readonly now?: IsoTimestamp;
};

export type MarkNotificationReadRecordInput = {
  readonly notification: NotificationRecord;
  readonly now?: IsoTimestamp;
};

export type DismissNotificationRecordInput = {
  readonly notification: NotificationRecord;
  readonly now?: IsoTimestamp;
};

export function createNotificationRecord(input: CreateNotificationRecordInput): NotificationRecord;

export function markNotificationReadRecord(
  input: MarkNotificationReadRecordInput,
): NotificationRecord;

export function dismissNotificationRecord(
  input: DismissNotificationRecordInput,
): NotificationRecord;
```

`createNotificationRecord` generates an id with
`createId({ prefix: "notification" })` when one is not provided, validates
fields, leaves `readAt` and `dismissedAt` unset, and sets `createdAt` and
`updatedAt` to the same timestamp.

`markNotificationReadRecord` sets `readAt` and touches `updatedAt` when
`readAt` is not already set. If the notification is already read, it returns the
notification unchanged without validating or using `now`.

`dismissNotificationRecord` sets `dismissedAt` and touches `updatedAt` when
`dismissedAt` is not already set. If the notification is already dismissed, it
returns the notification unchanged without validating or using `now`. Dismissal
does not set or change `readAt`.

Provided `id`, `target.targetKind`, and `target.targetId` are compile-time typed
values and do not get runtime target validation in this package.

Provided `now` values are passed to `createSyncMetadata({ now })` or
`touchSyncMetadata({ metadata, now })` so they are validated and normalized.
When `now` is absent, those helpers choose the current timestamp.

Notification recipients are normalized by trimming `recipientId` and
`displayName`. `recipientId` must be non-empty. `displayName` is optional but
must be non-empty when provided. Stored recipient fields use trimmed values.

Actor refs are normalized by trimming `actorKind`, `actorId`, and `displayName`.
`actorKind` and `actorId` must be non-empty. `displayName` is optional but must
be non-empty when provided. Stored actor refs use trimmed values.

Runtime validation scope:

- `summaryMarkdown`: trimmed and required to be non-empty
- `bodyMarkdown`: trimmed and required to be non-empty when provided
- `recipient.recipientId`: trimmed and required to be non-empty
- `recipient.displayName`: trimmed and required to be non-empty when provided
- `createdBy.actorKind`: trimmed and required to be non-empty
- `createdBy.actorId`: trimmed and required to be non-empty
- `createdBy.displayName`: trimmed and required to be non-empty when provided
- `target`: not runtime-validated or trimmed
- `id`: not runtime-validated beyond TypeScript

The TypeScript types describe the supported caller contract. Runtime validation
is intentionally focused on the fields listed above. The package is not a
general-purpose runtime schema parser for arbitrary JavaScript values. Invalid
values caught by the field validation above throw `ValidationError`; other
wrong primitive types may surface as ordinary JavaScript or database errors.

## Repository

The package exports a SQLite repository:

```ts
export type CreateNotificationRepositoryInput = {
  readonly database: Database;
};

export type CreateNotificationInput = Omit<CreateNotificationRecordInput, "id"> & {
  readonly id?: SituId<"notification">;
};

export type ListNotificationsForRecipientInput = {
  readonly recipientId: string;
  readonly includeDismissed?: boolean;
  readonly limit?: number;
};

export type MarkNotificationReadInput = {
  readonly id: SituId<"notification">;
  readonly now?: IsoTimestamp;
};

export type DismissNotificationInput = {
  readonly id: SituId<"notification">;
  readonly now?: IsoTimestamp;
};

export type NotificationRepository = {
  readonly create: (input: CreateNotificationInput) => NotificationRecord;
  readonly getById: (input: {
    readonly id: SituId<"notification">;
  }) => NotificationRecord | undefined;
  readonly listForRecipient: (
    input: ListNotificationsForRecipientInput,
  ) => readonly NotificationRecord[];
  readonly markRead: (input: MarkNotificationReadInput) => NotificationRecord;
  readonly dismiss: (input: DismissNotificationInput) => NotificationRecord;
};

export function createNotificationRepository(
  input: CreateNotificationRepositoryInput,
): NotificationRepository;
```

The repository accepts a `Database` from the caller. It must not open its own
database connection.

`create` inserts the notification and returns the stored record. Duplicate ids
throw `ConflictError`. Invalid caller inputs throw `ValidationError`.
Unexpected SQLite failures may surface as ordinary database errors.

`getById` returns `undefined` when a notification does not exist.

`listForRecipient` returns notifications for the provided recipient id ordered
by `created_at DESC, id DESC`. By default, dismissed notifications are excluded.
Passing `includeDismissed: true` includes dismissed notifications. The
recipient id filter value is trimmed and must be non-empty.

The default `listForRecipient` limit is `50`. Limits greater than `500` are
accepted and executed as `500`. Limit validation happens before clamping:
missing limits use `50`; non-number, non-finite, non-integer, zero, or negative
limits throw `ValidationError`; valid positive integer limits are then capped at
`500`.

`markRead` and `dismiss` throw `NotFoundError` when the notification does not
exist. Otherwise they update the row only when the requested timestamp is not
already set, then return the mapped persisted record.

For `markRead` and `dismiss`, repository lookup happens before timestamp
validation. Missing records throw `NotFoundError` even when `now` is invalid.
Already-read or already-dismissed records are returned unchanged and do not
validate `now`.

`create` identifies duplicate ids by catching SQLite primary-key constraint
failures for `notifications.id`. `getById`, `markRead`, and `dismiss` do not
runtime-validate `id`; they query using the provided value.

Repository methods do not runtime-validate or trim `target.targetKind` or
`target.targetId`; those values are treated as already-typed `TargetRef` values
and are used as provided.

Repository methods do not create transactions themselves. App actions own outer
transactions when a write spans multiple primitives. Repository methods return
the mapped persisted row shape after writes.

Repository row mapping is:

- `id` maps to `NotificationRecord.id`
- `recipient_id` maps to `NotificationRecord.recipient.recipientId`
- `recipient_display_name` maps to `NotificationRecord.recipient.displayName`
- `target_kind` maps to `NotificationRecord.target.targetKind`
- `target_id` maps to `NotificationRecord.target.targetId`
- `created_by_kind` maps to `NotificationRecord.createdBy.actorKind`
- `created_by_id` maps to `NotificationRecord.createdBy.actorId`
- `created_by_display_name` maps to `NotificationRecord.createdBy.displayName`
- `summary_markdown` maps to `NotificationRecord.summaryMarkdown`
- `body_markdown` maps to `NotificationRecord.bodyMarkdown`
- `read_at` maps to `NotificationRecord.readAt`
- `dismissed_at` maps to `NotificationRecord.dismissedAt`
- `created_at` maps to `NotificationRecord.metadata.createdAt`
- `updated_at` maps to `NotificationRecord.metadata.updatedAt`

When optional fields are `undefined`, the repository stores SQL `NULL`. When
reading SQL `NULL`, the repository returns `undefined`.

Input invariants are enforced by mutation helpers and repository entrypoints.
The notifications SQL schema is not responsible for rejecting empty trimmed
strings.

Only duplicate primary-key conflicts for `notifications.id` are translated to
`ConflictError`; other unexpected SQLite constraint failures may surface as
ordinary database errors.

## Boundaries

Do not add notification kinds, workflow statuses, delivery providers, push
transport, email transport, polling loops, scheduler behavior, or target
existence checks to the notifications package. Cross-primitive behavior belongs
in app actions.

Do not store agent runtime sessions, provider threads, workers, leases, or
hidden runtime handles on notifications.

Do not treat `readAt` or `dismissedAt` as proof that target work was performed.
Target records, comments, reviews, measurements, artifacts, reports, and events
carry the work evidence.

## Consequences

Notifications become a simple inbox primitive. Later app actions can create a
task, emit an event, and create notifications in one transaction while this
package remains a small record package.
