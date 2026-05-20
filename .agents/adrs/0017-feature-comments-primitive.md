---
status: active
category: feature
created: 2026-05-13
---

# 0017. Feature: Comments Primitive

## Context

Comments carry the human-like back-and-forth around visible records. They are
where actors explain decisions, hand off context, ask for review, respond to
feedback, and leave plain Markdown notes that another actor can read later.

Comments should stay boring. The app should not encode every collaboration move
as a special workflow comment type.

## Decision

The `@situ/comments` primitive package owns comment records, comment schema,
comment repository functions, and comment-local mutation helpers.

Comments attach to a generic `TargetRef` from `@situ/common`. The comments
package does not import project, task, experiment, review, artifact, or report
packages.

Expected imports:

- `Database` from `bun:sqlite`
- `ActorRef`, `IsoTimestamp`, `SituId`, `SyncMetadata`, `TargetRef`,
  `createId`, and `createSyncMetadata` from `@situ/common`
- `ConflictError` and `ValidationError` from `@situ/errors`

## Record Shape

A comment record is:

```ts
export type CommentRecord = {
  readonly id: SituId<"comment">;
  readonly target: TargetRef;
  readonly bodyMarkdown: string;
  readonly author: ActorRef;
  readonly metadata: SyncMetadata;
};
```

Field meaning:

- `id`: Situ-owned comment id
- `target`: product record the comment belongs to
- `bodyMarkdown`: Markdown comment content
- `author`: visible attribution for the actor that wrote the comment
- `metadata`: shared creation/update timestamps

`bodyMarkdown` must be non-empty after trimming whitespace. The stored value
uses the trimmed string.

Comments do not have a `kind` field. If a comment is a handoff, review request,
answer, or bug note, the actor writes that in Markdown. Structured state belongs
on the target record, review record, notification record, or event record.

## Schema

The comment schema fragment creates a `comments` table:

```sql
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  author_kind TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

It also creates these indexes:

```sql
CREATE INDEX IF NOT EXISTS comments_target_idx
  ON comments (target_kind, target_id);

CREATE INDEX IF NOT EXISTS comments_author_id_idx
  ON comments (author_id);
```

The exact export name is:

```ts
export const commentsSchemaFragment = {
  packageName: "comments",
  statements: [
    createCommentsTableStatement,
    createCommentsTargetIndexStatement,
    createCommentsAuthorIdIndexStatement,
  ],
} as const;
```

The comments table does not use foreign keys for `target_id` because targets are
polymorphic across primitive packages. App actions own target existence checks
when that matters.

## Mutation Helpers

The package exports pure record helpers:

```ts
export type CreateCommentRecordInput = {
  readonly id?: SituId<"comment">;
  readonly target: TargetRef;
  readonly bodyMarkdown: string;
  readonly author: ActorRef;
  readonly now?: IsoTimestamp;
};

export function createCommentRecord(input: CreateCommentRecordInput): CommentRecord;
```

`createCommentRecord` generates an id with `createId({ prefix: "comment" })`
when one is not provided, validates fields, and sets `createdAt` and
`updatedAt` to the same timestamp.

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

Validation failures throw `ValidationError`.

## Repository

The package exports a SQLite repository:

```ts
export type CreateCommentRepositoryInput = {
  readonly database: Database;
};

export type CreateCommentInput = Omit<CreateCommentRecordInput, "id"> & {
  readonly id?: SituId<"comment">;
};

export type ListCommentsForTargetInput = {
  readonly target: TargetRef;
};

export type CommentRepository = {
  readonly create: (input: CreateCommentInput) => CommentRecord;
  readonly getById: (input: { readonly id: SituId<"comment"> }) => CommentRecord | undefined;
  readonly listForTarget: (input: ListCommentsForTargetInput) => readonly CommentRecord[];
};

export function createCommentRepository(input: CreateCommentRepositoryInput): CommentRepository;
```

The repository accepts a `Database` from the caller. It must not open its own
database connection.

`create` inserts the comment and returns the stored record. Duplicate ids throw
`ConflictError`. Invalid caller inputs throw `ValidationError`. Unexpected
SQLite failures may surface as ordinary database errors.

`getById` returns `undefined` when a comment does not exist.

`listForTarget` returns comments ordered by `created_at ASC, id ASC`.

Repository methods do not runtime-validate or trim `target.targetKind` or
`target.targetId`; those values are treated as already-typed `TargetRef` values
and are used as provided.

Repository methods do not create transactions themselves. App actions own outer
transactions when a write spans multiple primitives. Repository methods return
the mapped persisted row shape after writes.

Repository row mapping is:

- `id` maps to `CommentRecord.id`
- `target_kind` maps to `CommentRecord.target.targetKind`
- `target_id` maps to `CommentRecord.target.targetId`
- `body_markdown` maps to `CommentRecord.bodyMarkdown`
- `author_kind` maps to `CommentRecord.author.actorKind`
- `author_id` maps to `CommentRecord.author.actorId`
- `author_display_name` maps to `CommentRecord.author.displayName`
- `created_at` maps to `CommentRecord.metadata.createdAt`
- `updated_at` maps to `CommentRecord.metadata.updatedAt`

When `author.displayName` is `undefined`, the repository stores SQL `NULL`.
When reading SQL `NULL`, the repository returns `displayName: undefined`.

Input invariants are enforced by mutation helpers and repository entrypoints.
The comments SQL schema is not responsible for rejecting empty trimmed strings.

Only duplicate primary-key conflicts for `comments.id` are translated to
`ConflictError`; other unexpected SQLite constraint failures may surface as
ordinary database errors.

## Boundaries

Do not add comment kinds, workflow statuses, notification delivery, event
emission, review state, or target existence checks to the comments package.
Cross-primitive behavior belongs in app actions.

Do not store agent runtime sessions, provider threads, workers, leases, or
scheduler state on comments.

## Consequences

Comments give actors a simple Markdown backchannel without turning conversation
into workflow code. Later app actions can create comments alongside events and
notifications while this package remains a small primitive.
