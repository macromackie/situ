---
status: active
category: feature
created: 2026-05-13
---

# 0024. Feature: Reports Primitive

## Context

Reports are Situ's durable record of generated summaries, final findings,
handoff notes, and other longer-form outputs derived from product records.

A report should feel like a written document attached to the work. It has a
title, a Markdown body, visible attribution, and a target record. The report
record should not itself rerun research, collect measurements, approve
experiments, move tasks, create notifications, or render files.

## Decision

The `@situ/reports` primitive package owns report records, report schema,
report repository functions, and report-local mutation helpers.

Reports belong to projects and may target any Situ product record. The package
stores `projectId` as a `SituId<"project">` and `target` as a `TargetRef`, but
does not import `@situ/projects`, `@situ/tasks`, `@situ/experiments`, or other
primitive packages.

Expected imports:

- `Database` from `bun:sqlite`
- `ActorRef`, `IsoTimestamp`, `SituId`, `SyncMetadata`, `TargetRef`,
  `createId`, and `createSyncMetadata` from `@situ/common`
- `ConflictError` and `ValidationError` from `@situ/errors`

The shared shapes used by this ADR are:

```ts
export type IdPrefix =
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

export type ActorRef = {
  readonly actorKind: "human" | "local_agent" | "system";
  readonly actorId: string;
  readonly displayName?: string;
};

export type TargetRef<TKind extends IdPrefix = IdPrefix> = {
  readonly targetKind: TKind;
  readonly targetId: SituId<TKind>;
};

export type SyncMetadata = {
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
};
```

The package should import these shapes from `@situ/common`; the snippet above
is included to make the expected field names explicit.

## Record Shape

A report record is:

```ts
export type ReportRecord = {
  readonly id: SituId<"report">;
  readonly projectId: SituId<"project">;
  readonly target: TargetRef;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly generatedBy: ActorRef;
  readonly metadata: SyncMetadata;
};
```

Field meaning:

- `id`: Situ-owned report id
- `projectId`: project the report belongs to
- `target`: product record the report is about
- `title`: short human-readable title
- `bodyMarkdown`: Markdown report body
- `generatedBy`: visible attribution for the actor that generated or wrote the
  report
- `metadata`: shared creation/update timestamps

`title` and `bodyMarkdown` must be non-empty after trimming whitespace. Stored
values use the trimmed strings.

The report record intentionally has no `kind`, `status`, `format`, or
`decision` field. Actors should express those meanings in the title and
Markdown body unless a later ADR proves that structured report state is needed.

## Append-Only Rule

Reports are append-only. The reports package exports create, get, and list
repository methods only. It does not export update, delete, archive, or move
helpers.

If a report needs to be corrected or superseded, create a new report and use
the Markdown body, comments, events, or artifacts to explain the relationship.

Append-only describes the reports package API. The table still uses
`ON DELETE CASCADE` for parent project deletion so local database cleanup does
not leave orphaned child rows when a parent record is removed by a future
maintenance action.

## Schema

The report schema fragment creates a `reports` table:

```sql
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  generated_by_kind TEXT NOT NULL,
  generated_by_id TEXT NOT NULL,
  generated_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

It also creates these indexes:

```sql
CREATE INDEX IF NOT EXISTS reports_project_id_idx
  ON reports (project_id);

CREATE INDEX IF NOT EXISTS reports_target_idx
  ON reports (target_kind, target_id);

CREATE INDEX IF NOT EXISTS reports_generated_by_idx
  ON reports (generated_by_kind, generated_by_id);

CREATE INDEX IF NOT EXISTS reports_created_at_idx
  ON reports (created_at);
```

The exact export name is:

```ts
export const reportsSchemaFragment = {
  packageName: "reports",
  statements: [
    createReportsTableStatement,
    createReportsProjectIdIndexStatement,
    createReportsTargetIndexStatement,
    createReportsGeneratedByIndexStatement,
    createReportsCreatedAtIndexStatement,
  ],
} as const;
```

The individual schema statement constants shown above are exported.

The package root `src/index.ts` must export the report types, mutation helper
and input type, repository factory and repository input/result types, schema
fragment, and individual schema statement constants.

The report schema may reference the `projects` table by SQL name. Applying
schema fragments in the correct order is the app database layer's
responsibility.

Foreign-key checks rely on the caller-provided SQLite connection having
`PRAGMA foreign_keys = ON`. The app database layer owns that setting. Tests that
exercise foreign-key behavior should enable it on the in-memory database before
creating records.

The reports SQL schema is not responsible for rejecting empty trimmed strings.
Input invariants are enforced by mutation helpers and repository entrypoints.

The `target` fields are intentionally not foreign keys. A report can target any
Situ product record kind through the shared `TargetRef` shape, and polymorphic
target existence checks belong in app actions when needed.

Package tests may create a minimal `projects` table to exercise report foreign
keys, but the reports package must not import `@situ/projects`.

## Mutation Helpers

The package exports one record helper:

```ts
export type CreateReportRecordInput = {
  readonly id?: SituId<"report">;
  readonly projectId: SituId<"project">;
  readonly target: TargetRef;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly generatedBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export function createReportRecord(input: CreateReportRecordInput): ReportRecord;
```

`createReportRecord` generates an id with `createId({ prefix: "report" })`
when one is not provided, validates fields, and sets `createdAt` and
`updatedAt` to the same timestamp.

Provided `id`, `projectId`, and `target` are compile-time typed values and do
not get runtime prefix validation in this package.

Provided `now` values are passed to `createSyncMetadata({ now })` so they are
validated and normalized. When `now` is absent, that helper chooses the current
timestamp.

Actor refs are normalized by trimming `actorKind`, `actorId`, and
`displayName`. `actorKind` and `actorId` must be non-empty. `displayName` is
optional but must be non-empty when provided. Stored actor refs use trimmed
values.

Runtime validation scope:

- `title`: trimmed and required to be non-empty
- `bodyMarkdown`: trimmed and required to be non-empty
- `generatedBy.actorKind`: trimmed and required to be non-empty
- `generatedBy.actorId`: trimmed and required to be non-empty
- `generatedBy.displayName`: trimmed and required to be non-empty when provided
- `projectId`, `target`, and `id`: not runtime-validated beyond TypeScript

The TypeScript types describe the supported caller contract. Runtime validation
is intentionally focused on the fields listed above. The package is not a
general-purpose runtime schema parser for arbitrary JavaScript values. Invalid
values caught by the field validation above throw `ValidationError`; other
wrong primitive types may surface as ordinary JavaScript or database errors.

String fields listed above are validated by trimming their values. Non-string
values for those fields may surface as ordinary JavaScript errors when they do
not have string methods. Missing required nested objects, such as `generatedBy`,
may also surface as ordinary JavaScript errors. The package does not need
defensive runtime parsing for callers that violate the TypeScript input shapes.

`null` is outside the supported TypeScript input shape for optional fields. It
may surface as an ordinary JavaScript error rather than `ValidationError`.

## Repository

The package exports a SQLite repository:

```ts
export type CreateReportRepositoryInput = {
  readonly database: Database;
};

export type CreateReportInput = Omit<CreateReportRecordInput, "id"> & {
  readonly id?: SituId<"report">;
};

export type ListReportsForProjectInput = {
  readonly projectId: SituId<"project">;
};

export type ListReportsForTargetInput = {
  readonly target: TargetRef;
};

export type ListRecentReportsInput = {
  readonly limit?: number;
};

export type ReportRepository = {
  readonly create: (input: CreateReportInput) => ReportRecord;
  readonly getById: (input: { readonly id: SituId<"report"> }) => ReportRecord | undefined;
  readonly listForProject: (input: ListReportsForProjectInput) => readonly ReportRecord[];
  readonly listForTarget: (input: ListReportsForTargetInput) => readonly ReportRecord[];
  readonly listRecent: (input?: ListRecentReportsInput) => readonly ReportRecord[];
};

export function createReportRepository(input: CreateReportRepositoryInput): ReportRepository;
```

`CreateReportInput` intentionally mirrors `CreateReportRecordInput` for now.
It stays separate so the repository API can diverge later without changing the
record helper contract.

The repository accepts a `Database` from the caller. It must not open its own
database connection or apply schema statements. The caller is responsible for
running schema setup before repository methods are used.

`create` inserts the report and returns the stored record. Duplicate ids throw
`ConflictError`. Foreign-key failures for missing parent projects also throw
`ConflictError`. Invalid caller inputs throw `ValidationError`. Unexpected
SQLite failures may surface as ordinary database errors.

`getById` returns `undefined` when a report does not exist.

`listForProject` returns reports ordered by `created_at ASC, id ASC`. The
project id filter is required.

`listForTarget` returns reports ordered by `created_at ASC, id ASC`. The target
kind and target id filter are required.

The supported `listForProject` caller shape is an object with a `projectId`
field. The supported `listForTarget` caller shape is an object with a `target`
field. Wrong-shaped runtime inputs outside the TypeScript contract may surface
as ordinary JavaScript errors.

`listRecent` returns reports ordered by `created_at DESC, id DESC`. The default
limit is `50`. Limits greater than `500` are accepted and executed as `500`.
Limit validation happens before clamping: missing limits use `50`; non-number,
non-finite, non-integer, zero, or negative limits throw `ValidationError`; valid
positive integer limits are then capped at `500`.

The supported `listRecent` caller shape is `undefined` or an object with an
optional numeric `limit`. Wrong-shaped runtime inputs outside the TypeScript
contract may surface as ordinary JavaScript errors.

`create` identifies duplicate ids by catching SQLite primary-key constraint
failures for `reports.id`. It identifies missing parent projects by catching
SQLite foreign-key constraint failures. `getById` does not runtime-validate
`id`; it queries using the provided value.

Duplicate id detection should match SQLite `SQLITE_CONSTRAINT_PRIMARYKEY`
failures whose message includes `reports.id`. Missing parent detection should
match SQLite `SQLITE_CONSTRAINT_FOREIGNKEY` failures.

In implementation terms, the package should inspect Bun SQLite errors with:

- `error instanceof Error`
- `"code" in error`
- `error.code === "SQLITE_CONSTRAINT_PRIMARYKEY"`
- `error.message.includes("reports.id")`

for duplicate ids, and:

- `error instanceof Error`
- `"code" in error`
- `error.code === "SQLITE_CONSTRAINT_FOREIGNKEY"`

for missing parent projects. Because `project_id` is the only report foreign
key, any SQLite foreign-key failure from inserting into `reports` is treated as
a missing project and translated to `ConflictError`.

Repository methods do not create transactions themselves. App actions own outer
transactions when a write spans multiple primitives. Repository methods return
the mapped persisted row shape after writes.

`create` should insert the row, then select the inserted report through the same
row mapping used by `getById`. It should not return the pre-insert constructed
record directly.

Repository row mapping is:

- `id` maps to `ReportRecord.id`
- `project_id` maps to `ReportRecord.projectId`
- `target_kind` maps to `ReportRecord.target.targetKind`
- `target_id` maps to `ReportRecord.target.targetId`
- `title` maps to `ReportRecord.title`
- `body_markdown` maps to `ReportRecord.bodyMarkdown`
- `generated_by_kind` maps to `ReportRecord.generatedBy.actorKind`
- `generated_by_id` maps to `ReportRecord.generatedBy.actorId`
- `generated_by_display_name` maps to `ReportRecord.generatedBy.displayName`
- `created_at` maps to `ReportRecord.metadata.createdAt`
- `updated_at` maps to `ReportRecord.metadata.updatedAt`

When optional fields are `undefined`, the repository stores SQL `NULL`. When
reading SQL `NULL`, the repository returns `undefined`.

For optional actor display names, returning `undefined` means the returned actor
object includes a `displayName` property with value `undefined`.

Repository read methods map persisted rows as stored. They do not re-run
creation validation, re-trim fields, validate timestamps, or revalidate target
kinds while reading.

`listForProject.projectId`, `listForTarget.target`, `target.targetKind`, and
`target.targetId` are not runtime-validated beyond normal JavaScript failure
modes. Tests should not require specific error classes for inputs outside the
TypeScript caller contract unless this ADR explicitly requires `ValidationError`
or `ConflictError`.

Only duplicate primary-key failures for `reports.id` and foreign-key failures
for missing parent project rows during `create` are translated to
`ConflictError`; other unexpected SQLite constraint failures may surface as
ordinary database errors.

## Boundaries

Do not add report generation orchestration, Markdown rendering, PDF generation,
artifact file writing, command execution, project/task/experiment movement,
review decisions, measurements, comments, notifications, events, or target
existence checks beyond the project foreign key to the reports package.
Cross-primitive behavior belongs in app actions and report generation helpers.

Do not add provider sessions, workers, leases, scheduler state, hidden runtime
handles, or model conversation state to reports.

Do not treat a report as proof that the app accepted findings, completed a
task, approved an experiment, or wrote an external file. Report records preserve
written output; target records and artifacts preserve their own state.

## Consequences

Reports become simple visible written snapshots. Later app actions can collect
records, create a report, attach rendered artifacts, emit events, and notify
actors while the reports package remains a small primitive.
