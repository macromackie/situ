---
status: active
category: feature
created: 2026-05-14
---

# 0049. Feature: Replicache Push for Evidence Records

## Context

Measurements, artifacts, and reviews are Situ's append-only evidence records
around baselines and experiments:

- measurements record numeric observations for a baseline or an experiment
  revision
- artifacts point at durable files, logs, reports, screenshots, or external
  evidence
- reviews record feedback and decisions for an experiment revision

These records let actors explain why an experiment is promising, flawed,
accepted, rejected, or ready for another revision. They should be ordinary
visible product records, not hidden workflow steps.

ADR 0043 adds `POST /replicache/push`. ADR 0047 extends push with experiment
mutators. This ADR adds evidence-record creation to the same single write
surface.

## Decision

Extend the existing Replicache push route with evidence mutators.

Add these supported mutator names:

- `measurements.create`
- `artifacts.create`
- `reviews.create`

These mutators are processed by the existing sync module in
`projects/app/src/sync/`.

Implementation extends the existing `ReplicacheMutation` preparation path:

- add `CreateMeasurementMutationArgs`, `CreateArtifactMutationArgs`, and
  `CreateReviewMutationArgs` in `projects/app/src/sync/types.ts`
- add parser exports in `projects/app/src/sync/validation.ts`
- add switch cases in `projects/app/src/sync/mutators.ts` that call the listed
  app actions

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

The evidence mutators call existing app actions through the `AppActionContext`
provided by sync.

The relevant actions are:

- `createMeasurementAction`
- `createArtifactAction`
- `createReviewAction`

These actions do not own their own transactions. Sync may call them inside the
existing product-effect transaction so the product effect and
`last_mutation_id` update remain atomic.

Evidence mutators do not emit events or notifications automatically. If a
caller wants a timeline note or another actor's attention, it should create a
separate event, comment, or notification through a later supported mutator.

Do not make evidence mutators run commands, parse command output, read files,
hash files, copy artifacts, create worktrees, spawn agents, schedule work, or
move experiments. They only create durable product records from caller-supplied
values.

## Supported Mutators

`measurements.create` args:

```ts
type CreateMeasurementMutationArgs = {
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
  readonly now?: IsoTimestamp;
};
```

`artifacts.create` args:

```ts
type CreateArtifactMutationArgs = {
  readonly id: SituId<"artifact">;
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
```

`reviews.create` args:

```ts
type CreateReviewMutationArgs = {
  readonly id: SituId<"review">;
  readonly experimentId: SituId<"experiment">;
  readonly revisionNumber: number;
  readonly decision: ReviewDecision;
  readonly bodyMarkdown: string;
  readonly reviewer: ActorRef;
  readonly now?: IsoTimestamp;
};
```

Review decisions are:

```ts
type ReviewDecision = "approved" | "changes_requested" | "rejected" | "commented";
```

## Validation

Supported mutator args must be syntax-validated before product writes.

Shared validation rules:

- `args` must be an object
- required `id` fields must be non-empty strings
- optional `now` fields must be valid ISO timestamps according to the existing
  sync metadata helper validation
- timestamp validation uses the existing sync `optionalIsoTimestamp` pattern:
  require a non-empty string and validate/normalize it with
  `createSyncMetadata({ now }).createdAt` before passing it to the action
- `ActorRef` fields must be objects with:
  - `actorKind`: one of `human`, `local_agent`, or `system`
  - `actorId`: non-empty string
  - `displayName`: omitted or non-empty string

`measurements.create` validation rules:

- the target must be exactly one of:
  - `baselineId`
  - `experimentId` plus `revisionNumber`
- `baselineId`, when present, must be a non-empty string
- `experimentId`, when present, must be a non-empty string
- `revisionNumber`, when present, must be a positive safe integer
- `revisionNumber` must be present for experiment targets and absent for
  baseline targets
- `metricName` must be a non-empty string
- `numericValue` must be a finite number
- `unit` must be omitted or a non-empty string
- `summaryMarkdown` must be a non-empty string
- `detailsMarkdown` must be omitted or a non-empty string
- `measuredBy` must be a valid actor ref

`artifacts.create` validation rules:

- `target` must be an object with a valid `targetKind` and non-empty
  `targetId`
- valid `targetKind` values are:
  - `project`
  - `task`
  - `comment`
  - `event`
  - `notification`
  - `baseline`
  - `experiment`
  - `measurement`
  - `artifact`
  - `review`
  - `report`
- `title` must be a non-empty string
- `summaryMarkdown` must be a non-empty string
- `uri` must be a non-empty string
- `mediaType` must be omitted or a non-empty string
- `byteSize` must be omitted or a non-negative safe integer
- `sha256` must be omitted or a lowercase 64-character hex SHA-256 digest
- `createdBy` must be a valid actor ref

`reviews.create` validation rules:

- `experimentId` must be a non-empty string
- `revisionNumber` must be a positive safe integer
- `decision` must be one of the review decisions listed above
- `bodyMarkdown` must be a non-empty string
- `reviewer` must be a valid actor ref

Add a sync-level `reviewDecisions` runtime set and validate `args.decision`
before calling `createReviewAction`.

All three mutators require caller-provided ids even though the underlying
primitive repositories can generate ids. Replicache mutations need stable
client-known ids so later sync operations can refer to the same evidence
records without waiting for server-generated ids.

Domain validation still belongs to the existing app action and primitive
repository behavior:

- missing parent experiments for measurements or reviews become permanent
  conflict errors
- duplicate measurement, artifact, or review ids become permanent conflict
  errors
- artifact target refs preserve caller intent and do not check target
  existence unless a later ADR adds app-level target checks

If validation or expected app behavior fails with a `BaseError`, the mutation
is a permanent mutation error under ADR 0043. Sync advances
`last_mutation_id` for that mutation and records the serialized error in the
push result.

## Push Result

The push result shape remains the ADR 0043 shape.

`processedMutationCount` counts these mutators the same way it counts earlier
mutators:

- applied product effects count as processed
- permanent validation or conflict errors count as processed after advancing
  `last_mutation_id`

`skippedMutationCount` behavior is unchanged.

## Tests

Implementation should include focused tests for:

- `measurements.create`, `artifacts.create`, and `reviews.create` create their
  product records and advance `last_mutation_id`
- these mutators create zero events and zero notifications
- malformed supported mutator args are permanent validation errors and leave no
  evidence records
- missing parent experiments for measurements and reviews are permanent
  conflict errors and leave no evidence records
- duplicate ids become permanent conflict errors without leaving partial
  duplicate records
- artifact target refs are preserved without requiring the target record to
  exist
- old and future mutation skipping still applies to these mutators through the
  existing ADR 0043 push processor

The HTTP route does not need separate endpoint tests for every new mutator
because ADR 0043 already covers route behavior. Add HTTP coverage only if the
implementation changes HTTP behavior, which this ADR should not do.

## Boundaries

Do not add pull records for measurements, artifacts, or reviews in this ADR.

Do not add any additional mutator names in this ADR beyond the three evidence
mutators. Existing mutators from prior ADRs remain supported.

Do not add REST endpoints.

Do not add sync code to primitive packages.

Do not add update, delete, archive, move, or revise behavior to append-only
evidence records.

Do not create worktrees, execute commands, read files, hash files, copy
artifacts, spawn agents, schedule work, or open provider sessions.

## Consequences

Sync clients can now record the core evidence around baselines and experiment
revisions through the same single write surface used for projects, tasks,
comments, notifications, and experiments.

The candidate-work loop stays primitive-focused: experiments hold candidate
state, while measurements, artifacts, and reviews hold visible evidence and
feedback.
