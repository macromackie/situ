---
status: active
category: feature
created: 2026-05-13
---

# 0021. Feature: Measurements Primitive

## Context

Measurements are Situ's durable numeric evidence. They capture scores, counts,
durations, pass rates, benchmark results, eval outputs, or other numeric
observations that help actors compare baselines and candidate experiments over
time.

A measurement should be easy for a later actor to read: which baseline or
experiment revision it measured, what metric was recorded, the numeric value,
the unit when useful, who recorded it, and a short Markdown explanation of what
the result means.

Measurements are records, not runners. The package stores results that an actor
or app action captured. It does not execute tests, parse command output, manage
artifacts, or decide whether an experiment should be accepted.

## Decision

The `@situ/measurements` primitive package owns measurement records,
measurement schema, measurement repository functions, and measurement-local
mutation helpers.

Measurements belong to exactly one target:

- a baseline, through `baselineId`
- an experiment revision, through `experimentId` and `revisionNumber`

The package stores ids as `SituId<"baseline">` and `SituId<"experiment">` but
does not import `@situ/baselines` or `@situ/experiments`.

Expected imports:

- `Database` from `bun:sqlite`
- `ActorRef`, `IsoTimestamp`, `SituId`, `SyncMetadata`, `createId`, and
  `createSyncMetadata` from `@situ/common`
- `ConflictError` and `ValidationError` from `@situ/errors`

## Record Shape

A measurement record is:

```ts
export type MeasurementRecord = {
  readonly id: SituId<"measurement">;
  readonly baselineId?: SituId<"baseline">;
  readonly experimentId?: SituId<"experiment">;
  readonly revisionNumber?: number;
  readonly metricName: string;
  readonly numericValue: number;
  readonly unit?: string;
  readonly summaryMarkdown: string;
  readonly detailsMarkdown?: string;
  readonly measuredBy: ActorRef;
  readonly metadata: SyncMetadata;
};
```

Field meaning:

- `id`: Situ-owned measurement id
- `baselineId`: baseline this measurement describes
- `experimentId`: experiment the measurement belongs to
- `revisionNumber`: experiment revision this measurement describes
- `metricName`: human-readable metric label, such as `goal score`, `tests
passed`, or `latency ms`
- `numericValue`: finite numeric result
- `unit`: optional unit label, such as `points`, `tests`, `ms`, or `%`
- `summaryMarkdown`: short Markdown interpretation of the result
- `detailsMarkdown`: optional Markdown detail, such as command snippets or
  caveats
- `measuredBy`: visible attribution for the actor that recorded the measurement
- `metadata`: shared creation/update timestamps

`metricName` and `summaryMarkdown` must be non-empty after trimming whitespace.
`unit` and `detailsMarkdown`, when provided, must be non-empty after trimming
whitespace. Stored string values use the trimmed strings.

`numericValue` must be a finite JavaScript number. `NaN`, `Infinity`, and
`-Infinity` are invalid.

`revisionNumber` must be a positive integer when `experimentId` is present.
`revisionNumber` must be absent when `baselineId` is present.

Exactly one target shape is valid:

```text
baselineId set, experimentId absent, revisionNumber absent
experimentId set, baselineId absent, revisionNumber set
```

Measurements do not have a `kind`, status, pass/fail enum, or comparison
direction. If a value is better when lower, has a target threshold, or needs
context to interpret, write that in `summaryMarkdown` or `detailsMarkdown`.
Structured decision state belongs on experiments, reviews, tasks, or reports.

## Append-Only Rule

Measurements are append-only. The measurements package exports create, get, and
list repository methods only. It does not export update, delete, archive, or
move helpers.

If a previous measurement was wrong, create a new measurement that explains the
correction or add a comment/event around the relevant record.

Append-only describes the measurements package API. The table still uses
`ON DELETE CASCADE` for parent baseline or experiment deletion so local
database cleanup does not leave orphaned child rows when a parent record is
removed by a future maintenance action.

## Schema

The measurement schema fragment creates a `measurements` table:

```sql
CREATE TABLE IF NOT EXISTS measurements (
  id TEXT PRIMARY KEY,
  baseline_id TEXT REFERENCES baselines(id) ON DELETE CASCADE,
  experiment_id TEXT REFERENCES experiments(id) ON DELETE CASCADE,
  revision_number INTEGER CHECK (
    revision_number IS NULL
    OR (
      revision_number >= 1
      AND revision_number = CAST(revision_number AS INTEGER)
    )
  ),
  metric_name TEXT NOT NULL,
  numeric_value REAL NOT NULL,
  unit TEXT,
  summary_markdown TEXT NOT NULL,
  details_markdown TEXT,
  measured_by_kind TEXT NOT NULL,
  measured_by_id TEXT NOT NULL,
  measured_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (
      baseline_id IS NOT NULL
      AND experiment_id IS NULL
      AND revision_number IS NULL
    )
    OR (
      baseline_id IS NULL
      AND experiment_id IS NOT NULL
      AND revision_number IS NOT NULL
    )
  )
);
```

It also creates these indexes:

```sql
CREATE INDEX IF NOT EXISTS measurements_baseline_id_idx
  ON measurements (baseline_id);

CREATE INDEX IF NOT EXISTS measurements_experiment_id_idx
  ON measurements (experiment_id);

CREATE INDEX IF NOT EXISTS measurements_experiment_revision_idx
  ON measurements (experiment_id, revision_number);

CREATE INDEX IF NOT EXISTS measurements_metric_name_idx
  ON measurements (metric_name);

CREATE INDEX IF NOT EXISTS measurements_created_at_idx
  ON measurements (created_at);
```

The exact export name is:

```ts
export const measurementsSchemaFragment = {
  packageName: "measurements",
  statements: [
    createMeasurementsTableStatement,
    createMeasurementsBaselineIdIndexStatement,
    createMeasurementsExperimentIdIndexStatement,
    createMeasurementsExperimentRevisionIndexStatement,
    createMeasurementsMetricNameIndexStatement,
    createMeasurementsCreatedAtIndexStatement,
  ],
} as const;
```

The individual schema statement constants shown above are exported.

The measurement schema may reference the `baselines` and `experiments` tables
by SQL name. Applying schema fragments in the correct order is the app database
layer's responsibility.

Foreign-key checks rely on the caller-provided SQLite connection having
`PRAGMA foreign_keys = ON`. The app database layer owns that setting. Tests that
exercise foreign-key behavior should enable it on the in-memory database before
creating records.

## Mutation Helpers

The package exports one record helper:

```ts
export type CreateMeasurementRecordInput = {
  readonly id?: SituId<"measurement">;
  readonly baselineId?: SituId<"baseline">;
  readonly experimentId?: SituId<"experiment">;
  readonly revisionNumber?: number;
  readonly metricName: string;
  readonly numericValue: number;
  readonly unit?: string;
  readonly summaryMarkdown: string;
  readonly detailsMarkdown?: string;
  readonly measuredBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export function createMeasurementRecord(input: CreateMeasurementRecordInput): MeasurementRecord;
```

`createMeasurementRecord` generates an id with
`createId({ prefix: "measurement" })` when one is not provided, validates
fields, and sets `createdAt` and `updatedAt` to the same timestamp.

Provided `id`, `baselineId`, and `experimentId` are compile-time typed values
and do not get runtime prefix validation in this package.

Provided `now` values are passed to `createSyncMetadata({ now })` so they are
validated and normalized. When `now` is absent, that helper chooses the current
timestamp.

Actor refs are normalized by trimming `actorKind`, `actorId`, and `displayName`.
`actorKind` and `actorId` must be non-empty. `displayName` is optional but must
be non-empty when provided. Stored actor refs use trimmed values.

Runtime validation scope:

- target shape: exactly one of baseline target or experiment revision target
- `revisionNumber`: required to be a positive integer for experiment targets
  and absent for baseline targets
- `metricName`: trimmed and required to be non-empty
- `numericValue`: required to be a finite number
- `unit`: trimmed and required to be non-empty when provided
- `summaryMarkdown`: trimmed and required to be non-empty
- `detailsMarkdown`: trimmed and required to be non-empty when provided
- `measuredBy.actorKind`: trimmed and required to be non-empty
- `measuredBy.actorId`: trimmed and required to be non-empty
- `measuredBy.displayName`: trimmed and required to be non-empty when provided
- `baselineId`, `experimentId`, and `id`: not runtime-validated beyond
  TypeScript

The TypeScript types describe the supported caller contract. Runtime validation
is intentionally focused on the fields listed above. The package is not a
general-purpose runtime schema parser for arbitrary JavaScript values. Invalid
values caught by the field validation above throw `ValidationError`.

String fields listed above are validated by trimming their values. Non-string
values for those fields may surface as ordinary JavaScript errors when they do
not have string methods. Missing required nested objects, such as `measuredBy`,
may also surface as ordinary JavaScript errors. The package does not need
defensive runtime parsing for callers that violate the TypeScript input shapes.

## Repository

The package exports a SQLite repository:

```ts
export type CreateMeasurementRepositoryInput = {
  readonly database: Database;
};

export type CreateMeasurementInput = Omit<CreateMeasurementRecordInput, "id"> & {
  readonly id?: SituId<"measurement">;
};

export type ListMeasurementsForExperimentInput = {
  readonly experimentId: SituId<"experiment">;
  readonly revisionNumber?: number;
  readonly metricName?: string;
};

export type ListMeasurementsForBaselineInput = {
  readonly baselineId: SituId<"baseline">;
  readonly metricName?: string;
};

export type ListRecentMeasurementsInput = {
  readonly limit?: number;
};

export type MeasurementRepository = {
  readonly create: (input: CreateMeasurementInput) => MeasurementRecord;
  readonly getById: (input: {
    readonly id: SituId<"measurement">;
  }) => MeasurementRecord | undefined;
  readonly listForExperiment: (
    input: ListMeasurementsForExperimentInput,
  ) => readonly MeasurementRecord[];
  readonly listForBaseline: (
    input: ListMeasurementsForBaselineInput,
  ) => readonly MeasurementRecord[];
  readonly listAll: () => readonly MeasurementRecord[];
  readonly listRecent: (input?: ListRecentMeasurementsInput) => readonly MeasurementRecord[];
};

export function createMeasurementRepository(
  input: CreateMeasurementRepositoryInput,
): MeasurementRepository;
```

The repository accepts a `Database` from the caller. It must not open its own
database connection.

`create` inserts the measurement and returns the stored record. Duplicate ids
throw `ConflictError`. Foreign-key failures for missing parent baselines or
experiments also throw `ConflictError`. Invalid caller inputs throw
`ValidationError`. Unexpected SQLite failures may surface as ordinary database
errors.

`getById` returns `undefined` when a measurement does not exist.

`listForExperiment` returns measurements ordered by `created_at ASC, id ASC`.
The experiment id filter is required. Optional `revisionNumber` and `metricName`
filters combine with `AND`. `revisionNumber` filters must be positive integers.
`metricName` filters are trimmed, must be non-empty, and use exact
case-sensitive SQL equality against the stored trimmed value.

`listForBaseline` returns baseline measurements ordered by `created_at ASC, id
ASC`. The baseline id filter is required. Optional `metricName` filters use the
same exact matching behavior as experiment measurements.

`listAll` returns all measurements ordered by `created_at ASC, id ASC`.

`listRecent` returns measurements ordered by `created_at DESC, id DESC`. The
default limit is `50`. Limits greater than `500` are accepted and executed as
`500`. Limit validation happens before clamping: missing limits use `50`;
non-number, non-finite, non-integer, zero, or negative limits throw
`ValidationError`; valid positive integer limits are then capped at `500`.

`create` identifies duplicate ids by catching SQLite primary-key constraint
failures for `measurements.id`. It identifies missing parent baselines or
experiments by catching SQLite foreign-key constraint failures. `getById` does
not
runtime-validate `id`; it queries using the provided value.

Repository methods do not create transactions themselves. App actions own outer
transactions when a write spans multiple primitives. Repository methods return
the mapped persisted row shape after writes.

Repository row mapping is:

- `id` maps to `MeasurementRecord.id`
- `baseline_id` maps to `MeasurementRecord.baselineId`
- `experiment_id` maps to `MeasurementRecord.experimentId`
- `revision_number` maps to `MeasurementRecord.revisionNumber`
- `metric_name` maps to `MeasurementRecord.metricName`
- `numeric_value` maps to `MeasurementRecord.numericValue`
- `unit` maps to `MeasurementRecord.unit`
- `summary_markdown` maps to `MeasurementRecord.summaryMarkdown`
- `details_markdown` maps to `MeasurementRecord.detailsMarkdown`
- `measured_by_kind` maps to `MeasurementRecord.measuredBy.actorKind`
- `measured_by_id` maps to `MeasurementRecord.measuredBy.actorId`
- `measured_by_display_name` maps to `MeasurementRecord.measuredBy.displayName`
- `created_at` maps to `MeasurementRecord.metadata.createdAt`
- `updated_at` maps to `MeasurementRecord.metadata.updatedAt`

When optional fields are `undefined`, the repository stores SQL `NULL`. When
reading SQL `NULL`, the repository returns `undefined`.

Only duplicate primary-key failures for `measurements.id` and foreign-key
failures for missing parent baseline or experiment rows during `create` are
translated to `ConflictError`; other unexpected SQLite constraint failures may
surface as ordinary database errors.

## Boundaries

Do not add command execution, artifact storage, review state, baseline status
updates, experiment status updates, report generation, pass/fail workflow
decisions, or target existence checks beyond database foreign keys to the
measurements package.
Cross-primitive behavior belongs in app actions.

Do not add provider sessions, workers, leases, scheduler state, hidden runtime
handles, or model conversation state to measurements.

Do not intentionally store large raw command output in `detailsMarkdown`. This
is caller guidance, not repository validation. Large output belongs in
artifacts; the measurement may summarize it and point to the artifact through
ordinary comments, events, reviews, or reports.

## Consequences

Measurements become simple numeric evidence records. Later app actions can run
commands, capture artifacts, emit events, create measurements, and request
review while the measurements package remains a small primitive.
