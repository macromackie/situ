---
status: active
category: feature
created: 2026-05-13
---

# 0022. Feature: Artifacts Primitive

## Context

Artifacts are durable references to evidence that is too large, too structured,
or too file-like to live directly in comments, measurements, reviews, reports,
or events.

An artifact might point at a captured command log, benchmark output file,
coverage report, screenshot, generated report source, diff, archive, or
external URL. A later actor should be able to inspect the artifact record, see
what visible record it belongs to, understand what it contains, and find the
referenced file or URL.

Artifacts are records, not file managers. The package stores references and
metadata. It does not copy files, read files, write files, hash contents,
upload data, enforce filesystem allowlists, or decide how evidence should be
interpreted.

## Decision

The `@situ/artifacts` primitive package owns artifact records, artifact schema,
artifact repository functions, and artifact-local mutation helpers.

Artifacts attach to a generic `TargetRef` from `@situ/common`. The artifacts
package does not import project, task, comment, event, notification,
experiment, measurement, review, or report packages.

Expected imports:

- `Database` from `bun:sqlite`
- `ActorRef`, `IsoTimestamp`, `SituId`, `SyncMetadata`, `TargetRef`,
  `createId`, and `createSyncMetadata` from `@situ/common`
- `ConflictError` and `ValidationError` from `@situ/errors`

## Record Shape

An artifact record is:

```ts
export type ArtifactRecord = {
  readonly id: SituId<"artifact">;
  readonly target: TargetRef;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly uri: string;
  readonly mediaType?: string;
  readonly byteSize?: number;
  readonly sha256?: string;
  readonly createdBy: ActorRef;
  readonly metadata: SyncMetadata;
};
```

Field meaning:

- `id`: Situ-owned artifact id
- `target`: product record the artifact belongs to
- `title`: short human-readable artifact label
- `summaryMarkdown`: Markdown explanation of what the artifact contains
- `uri`: durable local or external reference to the artifact content
- `mediaType`: optional media type such as `text/plain` or `application/json`
- `byteSize`: optional content size in bytes
- `sha256`: optional lowercase hex SHA-256 digest for content verification
- `createdBy`: visible attribution for the actor that recorded the artifact
- `metadata`: shared creation/update timestamps

`title`, `summaryMarkdown`, and `uri` must be non-empty after trimming
whitespace. `mediaType` and `sha256`, when provided, must be non-empty after
trimming whitespace. Stored string values use the trimmed strings.

`byteSize`, when provided, must be a non-negative safe integer.

`sha256`, when provided, must be exactly 64 lowercase hex characters.

The package treats `uri` as an opaque string after trimming. It may be a local
path, `file://` URI, `https://` URL, `situ-artifact://` URI, or another
reference chosen by app actions. This package does not parse URI schemes or
check path existence. Relative-path meaning, local path roots, and URI
durability are entirely caller-owned.

Artifacts do not have a workflow status. The title and summary should explain
what the artifact is. Structured state belongs on the target record,
measurement, review, task, experiment, or report.

## Append-Only Rule

Artifacts are append-only. The artifacts package exports create, get, and list
repository methods only. It does not export update, delete, archive, or move
helpers.

If an artifact points at the wrong thing or becomes obsolete, create a new
artifact, comment, or event that explains the correction.

## Schema

The artifact schema fragment creates an `artifacts` table:

```sql
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary_markdown TEXT NOT NULL,
  uri TEXT NOT NULL,
  media_type TEXT,
  byte_size INTEGER CHECK (
    byte_size IS NULL
    OR (byte_size >= 0 AND byte_size = CAST(byte_size AS INTEGER))
  ),
  sha256 TEXT,
  created_by_kind TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

It also creates these indexes:

```sql
CREATE INDEX IF NOT EXISTS artifacts_target_idx
  ON artifacts (target_kind, target_id);

CREATE INDEX IF NOT EXISTS artifacts_created_by_idx
  ON artifacts (created_by_kind, created_by_id);

CREATE INDEX IF NOT EXISTS artifacts_created_at_idx
  ON artifacts (created_at);
```

The exact export name is:

```ts
export const artifactsSchemaFragment = {
  packageName: "artifacts",
  statements: [
    createArtifactsTableStatement,
    createArtifactsTargetIndexStatement,
    createArtifactsCreatedByIndexStatement,
    createArtifactsCreatedAtIndexStatement,
  ],
} as const;
```

The individual schema statement constants shown above are exported.

The artifacts table does not use foreign keys for `target_id` because targets
are polymorphic across primitive packages. App actions own target existence
checks when that matters.

## Mutation Helpers

The package exports one record helper:

```ts
export type CreateArtifactRecordInput = {
  readonly id?: SituId<"artifact">;
  readonly target: TargetRef;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly uri: string;
  readonly mediaType?: string;
  readonly byteSize?: number;
  readonly sha256?: string;
  readonly createdBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export function createArtifactRecord(input: CreateArtifactRecordInput): ArtifactRecord;
```

`createArtifactRecord` generates an id with `createId({ prefix: "artifact" })`
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

Runtime validation scope:

- `title`: trimmed and required to be non-empty
- `summaryMarkdown`: trimmed and required to be non-empty
- `uri`: trimmed and required to be non-empty
- `mediaType`: trimmed and required to be non-empty when provided
- `byteSize`: required to be a non-negative safe integer when provided
- `sha256`: trimmed and required to be a lowercase 64-character hex digest when
  provided
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

String fields listed above are validated by trimming their values. Non-string
values for those fields may surface as ordinary JavaScript errors when they do
not have string methods. Missing required nested objects, such as `createdBy`,
may also surface as ordinary JavaScript errors. The package does not need
defensive runtime parsing for callers that violate the TypeScript input shapes.

## Repository

The package exports a SQLite repository:

```ts
export type CreateArtifactRepositoryInput = {
  readonly database: Database;
};

export type CreateArtifactInput = Omit<CreateArtifactRecordInput, "id"> & {
  readonly id?: SituId<"artifact">;
};

export type ListArtifactsForTargetInput = {
  readonly target: TargetRef;
};

export type ListRecentArtifactsInput = {
  readonly limit?: number;
};

export type ArtifactRepository = {
  readonly create: (input: CreateArtifactInput) => ArtifactRecord;
  readonly getById: (input: { readonly id: SituId<"artifact"> }) => ArtifactRecord | undefined;
  readonly listForTarget: (input: ListArtifactsForTargetInput) => readonly ArtifactRecord[];
  readonly listRecent: (input?: ListRecentArtifactsInput) => readonly ArtifactRecord[];
};

export function createArtifactRepository(input: CreateArtifactRepositoryInput): ArtifactRepository;
```

The repository accepts a `Database` from the caller. It must not open its own
database connection or apply schema statements. The caller is responsible for
running schema setup before repository methods are used.

`create` inserts the artifact and returns the stored record. Duplicate ids throw
`ConflictError`. Invalid caller inputs throw `ValidationError`. Unexpected
SQLite failures may surface as ordinary database errors.

`getById` returns `undefined` when an artifact does not exist.

`listForTarget` returns artifacts ordered by `created_at ASC, id ASC`.

`listRecent` returns artifacts ordered by `created_at DESC, id DESC`. The
default limit is `50`. Limits greater than `500` are accepted and executed as
`500`. Limit validation happens before clamping: missing limits use `50`;
non-number, non-finite, non-integer, zero, or negative limits throw
`ValidationError`; valid positive integer limits are then capped at `500`.

The supported `listRecent` caller shape is `undefined` or an object with an
optional numeric `limit`. Wrong-shaped runtime inputs outside the TypeScript
contract may surface as ordinary JavaScript errors.

`create` identifies duplicate ids by catching SQLite primary-key constraint
failures for `artifacts.id`. `getById` does not runtime-validate `id`; it
queries using the provided value.

Repository methods do not runtime-validate or trim `target.targetKind` or
`target.targetId`; those values are treated as already-typed `TargetRef` values
and are used as provided.

Repository methods do not create transactions themselves. App actions own outer
transactions when a write spans multiple primitives. Repository methods return
the mapped persisted row shape after writes.

Repository row mapping is:

- `id` maps to `ArtifactRecord.id`
- `target_kind` maps to `ArtifactRecord.target.targetKind`
- `target_id` maps to `ArtifactRecord.target.targetId`
- `title` maps to `ArtifactRecord.title`
- `summary_markdown` maps to `ArtifactRecord.summaryMarkdown`
- `uri` maps to `ArtifactRecord.uri`
- `media_type` maps to `ArtifactRecord.mediaType`
- `byte_size` maps to `ArtifactRecord.byteSize`
- `sha256` maps to `ArtifactRecord.sha256`
- `created_by_kind` maps to `ArtifactRecord.createdBy.actorKind`
- `created_by_id` maps to `ArtifactRecord.createdBy.actorId`
- `created_by_display_name` maps to `ArtifactRecord.createdBy.displayName`
- `created_at` maps to `ArtifactRecord.metadata.createdAt`
- `updated_at` maps to `ArtifactRecord.metadata.updatedAt`

When optional fields are `undefined`, the repository stores SQL `NULL`. When
reading SQL `NULL`, the repository returns `undefined`.

Repository read methods map persisted rows as stored. They do not re-run
creation validation, re-trim fields, validate timestamps, parse URIs, inspect
paths, or verify hashes while reading.

Only duplicate primary-key failures for `artifacts.id` are translated to
`ConflictError`; other unexpected SQLite constraint failures may surface as
ordinary database errors.

## Boundaries

Do not add file copying, file deletion, command execution, hashing, uploads,
artifact rendering, report generation, review state, experiment status updates,
or target existence checks to the artifacts package. Cross-primitive behavior
belongs in app actions.

Do not add provider sessions, workers, leases, scheduler state, hidden runtime
handles, or model conversation state to artifacts.

Do not store secret values in artifact fields. App actions that capture command
output or files must apply secret handling before creating artifact records.

## Consequences

Artifacts become simple durable evidence references. Later app actions can copy
files, capture command outputs, compute hashes, emit events, create artifacts,
and attach them to experiments, measurements, reviews, tasks, reports, or
projects while this package remains a small primitive.
