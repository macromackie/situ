---
status: active
category: feature
created: 2026-05-13
---

# 0023. Feature: Reviews Primitive

## Context

Reviews are Situ's durable record of feedback on an experiment revision. They
let one actor inspect a candidate, record an outcome, explain the reasoning in
Markdown, and leave a visible record that the original actor can respond to by
continuing the same experiment.

A review should feel like a simple pull-request review: approve it, request
changes, reject it, or leave a non-blocking comment. The review record should
not itself run commands, mutate experiment status, create notifications, or
decide task completion.

## Decision

The `@situ/reviews` primitive package owns review records, review schema,
review repository functions, and review-local mutation helpers.

Reviews belong to experiments. The package stores `experimentId` as a
`SituId<"experiment">` but does not import `@situ/experiments`.

Expected imports:

- `Database` from `bun:sqlite`
- `ActorRef`, `IsoTimestamp`, `SituId`, `SyncMetadata`, `createId`, and
  `createSyncMetadata` from `@situ/common`
- `ConflictError` and `ValidationError` from `@situ/errors`

## Record Shape

A review record is:

```ts
export type ReviewDecision = "approved" | "changes_requested" | "rejected" | "commented";

export type ReviewRecord = {
  readonly id: SituId<"review">;
  readonly experimentId: SituId<"experiment">;
  readonly revisionNumber: number;
  readonly decision: ReviewDecision;
  readonly bodyMarkdown: string;
  readonly reviewer: ActorRef;
  readonly metadata: SyncMetadata;
};
```

Field meaning:

- `id`: Situ-owned review id
- `experimentId`: experiment the review belongs to
- `revisionNumber`: experiment revision this review describes
- `decision`: visible review outcome
- `bodyMarkdown`: Markdown reasoning, feedback, checklist, or next-step note
- `reviewer`: visible attribution for the actor that performed the review
- `metadata`: shared creation/update timestamps

`bodyMarkdown` must be non-empty after trimming whitespace. Stored values use
the trimmed string.

`revisionNumber` must be a positive integer.

## Decisions

Review decisions are deliberately small:

- `approved`: reviewer believes the revision is acceptable
- `changes_requested`: reviewer found actionable changes the original actor
  should address
- `rejected`: reviewer believes the candidate should not continue
- `commented`: reviewer left non-blocking feedback or observations

A review decision does not automatically move the experiment or task. App
actions may compose review creation with experiment movement, comments, events,
or notifications, but the reviews package only stores the review record.

## Append-Only Rule

Reviews are append-only. The reviews package exports create, get, and list
repository methods only. It does not export update, delete, archive, or move
helpers.

If a previous review was wrong or needs follow-up, create a new review, comment,
or event that explains the correction.

Append-only describes the reviews package API. The table still uses
`ON DELETE CASCADE` for parent experiment deletion so local database cleanup
does not leave orphaned child rows when a parent record is removed by a future
maintenance action.

## Schema

The review schema fragment creates a `reviews` table:

```sql
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL CHECK (
    revision_number >= 1
    AND revision_number = CAST(revision_number AS INTEGER)
  ),
  decision TEXT NOT NULL CHECK (
    decision IN ('approved', 'changes_requested', 'rejected', 'commented')
  ),
  body_markdown TEXT NOT NULL,
  reviewer_kind TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  reviewer_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

It also creates these indexes:

```sql
CREATE INDEX IF NOT EXISTS reviews_experiment_id_idx
  ON reviews (experiment_id);

CREATE INDEX IF NOT EXISTS reviews_experiment_revision_idx
  ON reviews (experiment_id, revision_number);

CREATE INDEX IF NOT EXISTS reviews_decision_idx
  ON reviews (decision);

CREATE INDEX IF NOT EXISTS reviews_reviewer_idx
  ON reviews (reviewer_kind, reviewer_id);

CREATE INDEX IF NOT EXISTS reviews_created_at_idx
  ON reviews (created_at);
```

The exact export name is:

```ts
export const reviewsSchemaFragment = {
  packageName: "reviews",
  statements: [
    createReviewsTableStatement,
    createReviewsExperimentIdIndexStatement,
    createReviewsExperimentRevisionIndexStatement,
    createReviewsDecisionIndexStatement,
    createReviewsReviewerIndexStatement,
    createReviewsCreatedAtIndexStatement,
  ],
} as const;
```

The individual schema statement constants shown above are exported.

The review schema may reference the `experiments` table by SQL name. Applying
schema fragments in the correct order is the app database layer's
responsibility.

Foreign-key checks rely on the caller-provided SQLite connection having
`PRAGMA foreign_keys = ON`. The app database layer owns that setting. Tests that
exercise foreign-key behavior should enable it on the in-memory database before
creating records.

The reviews SQL schema is not responsible for rejecting empty trimmed strings.
Input invariants are enforced by mutation helpers and repository entrypoints.

## Mutation Helpers

The package exports one record helper:

```ts
export type CreateReviewRecordInput = {
  readonly id?: SituId<"review">;
  readonly experimentId: SituId<"experiment">;
  readonly revisionNumber: number;
  readonly decision: ReviewDecision;
  readonly bodyMarkdown: string;
  readonly reviewer: ActorRef;
  readonly now?: IsoTimestamp;
};

export function createReviewRecord(input: CreateReviewRecordInput): ReviewRecord;
```

`createReviewRecord` generates an id with `createId({ prefix: "review" })`
when one is not provided, validates fields, and sets `createdAt` and
`updatedAt` to the same timestamp.

Provided `id` and `experimentId` are compile-time typed values and do not get
runtime prefix validation in this package.

Provided `now` values are passed to `createSyncMetadata({ now })` so they are
validated and normalized. When `now` is absent, that helper chooses the current
timestamp.

Actor refs are normalized by trimming `actorKind`, `actorId`, and `displayName`.
`actorKind` and `actorId` must be non-empty. `displayName` is optional but must
be non-empty when provided. Stored actor refs use trimmed values.

Runtime validation scope:

- `revisionNumber`: required to be a positive integer
- `decision`: required to be one of the review decisions
- `bodyMarkdown`: trimmed and required to be non-empty
- `reviewer.actorKind`: trimmed and required to be non-empty
- `reviewer.actorId`: trimmed and required to be non-empty
- `reviewer.displayName`: trimmed and required to be non-empty when provided
- `experimentId` and `id`: not runtime-validated beyond TypeScript

The TypeScript types describe the supported caller contract. Runtime validation
is intentionally focused on the fields listed above. The package is not a
general-purpose runtime schema parser for arbitrary JavaScript values. Invalid
values caught by the field validation above throw `ValidationError`; other
wrong primitive types may surface as ordinary JavaScript or database errors.

String fields listed above are validated by trimming their values. Non-string
values for those fields may surface as ordinary JavaScript errors when they do
not have string methods. Missing required nested objects, such as `reviewer`,
may also surface as ordinary JavaScript errors. The package does not need
defensive runtime parsing for callers that violate the TypeScript input shapes.

`null` is outside the supported TypeScript input shape for optional fields. It
may surface as an ordinary JavaScript error rather than `ValidationError`.

## Repository

The package exports a SQLite repository:

```ts
export type CreateReviewRepositoryInput = {
  readonly database: Database;
};

export type CreateReviewInput = Omit<CreateReviewRecordInput, "id"> & {
  readonly id?: SituId<"review">;
};

export type ListReviewsForExperimentInput = {
  readonly experimentId: SituId<"experiment">;
  readonly revisionNumber?: number;
  readonly decision?: ReviewDecision;
};

export type ListRecentReviewsInput = {
  readonly limit?: number;
};

export type ReviewRepository = {
  readonly create: (input: CreateReviewInput) => ReviewRecord;
  readonly getById: (input: { readonly id: SituId<"review"> }) => ReviewRecord | undefined;
  readonly listForExperiment: (input: ListReviewsForExperimentInput) => readonly ReviewRecord[];
  readonly listRecent: (input?: ListRecentReviewsInput) => readonly ReviewRecord[];
};

export function createReviewRepository(input: CreateReviewRepositoryInput): ReviewRepository;
```

The repository accepts a `Database` from the caller. It must not open its own
database connection or apply schema statements. The caller is responsible for
running schema setup before repository methods are used.

`create` inserts the review and returns the stored record. Duplicate ids throw
`ConflictError`. Foreign-key failures for missing parent experiments also throw
`ConflictError`. Invalid caller inputs throw `ValidationError`. Unexpected
SQLite failures may surface as ordinary database errors.

`getById` returns `undefined` when a review does not exist.

`listForExperiment` returns reviews ordered by `created_at ASC, id ASC`. The
experiment id filter is required. Optional `revisionNumber` and `decision`
filters combine with `AND`. `revisionNumber` filters must be positive integers.
`decision` filters must be valid review decisions.

The supported `listForExperiment` caller shape is an object with an
`experimentId` and optional `revisionNumber` and `decision` fields.
Wrong-shaped runtime inputs outside the TypeScript contract may surface as
ordinary JavaScript errors.

`listRecent` returns reviews ordered by `created_at DESC, id DESC`. The default
limit is `50`. Limits greater than `500` are accepted and executed as `500`.
Limit validation happens before clamping: missing limits use `50`; non-number,
non-finite, non-integer, zero, or negative limits throw `ValidationError`; valid
positive integer limits are then capped at `500`.

The supported `listRecent` caller shape is `undefined` or an object with an
optional numeric `limit`. Wrong-shaped runtime inputs outside the TypeScript
contract may surface as ordinary JavaScript errors.

`create` identifies duplicate ids by catching SQLite primary-key constraint
failures for `reviews.id`. It identifies missing parent experiments by catching
SQLite foreign-key constraint failures. `getById` does not runtime-validate
`id`; it queries using the provided value.

Duplicate id detection should match SQLite `SQLITE_CONSTRAINT_PRIMARYKEY`
failures that reference `reviews.id`. Missing parent detection should match
SQLite `SQLITE_CONSTRAINT_FOREIGNKEY` failures.

Repository methods do not create transactions themselves. App actions own outer
transactions when a write spans multiple primitives. Repository methods return
the mapped persisted row shape after writes.

Repository row mapping is:

- `id` maps to `ReviewRecord.id`
- `experiment_id` maps to `ReviewRecord.experimentId`
- `revision_number` maps to `ReviewRecord.revisionNumber`
- `decision` maps to `ReviewRecord.decision`
- `body_markdown` maps to `ReviewRecord.bodyMarkdown`
- `reviewer_kind` maps to `ReviewRecord.reviewer.actorKind`
- `reviewer_id` maps to `ReviewRecord.reviewer.actorId`
- `reviewer_display_name` maps to `ReviewRecord.reviewer.displayName`
- `created_at` maps to `ReviewRecord.metadata.createdAt`
- `updated_at` maps to `ReviewRecord.metadata.updatedAt`

When optional fields are `undefined`, the repository stores SQL `NULL`. When
reading SQL `NULL`, the repository returns `undefined`.

For optional actor display names, returning `undefined` means the returned actor
object includes a `displayName` property with value `undefined`.

Repository read methods map persisted rows as stored. They do not re-run
creation validation, re-trim fields, validate timestamps, or revalidate review
decisions while reading.

Only duplicate primary-key failures for `reviews.id` and foreign-key failures
for missing parent experiment rows during `create` are translated to
`ConflictError`; other unexpected SQLite constraint failures may surface as
ordinary database errors.

## Boundaries

Do not add experiment status updates, task status updates, comments,
notifications, events, measurements, artifacts, report generation, command
execution, or target existence checks beyond database foreign keys to the
reviews package. Cross-primitive behavior belongs in app actions.

Do not add provider sessions, workers, leases, scheduler state, hidden runtime
handles, or model conversation state to reviews.

Do not treat a review decision as proof that app actions updated the experiment
or task. Review records preserve feedback; target records preserve their own
current state.

## Consequences

Reviews become simple visible feedback records. Later app actions can create a
review, emit events, notify the original actor, and move an experiment or task
while the reviews package remains a small primitive.
