---
status: active
category: feature
created: 2026-05-14
---

# 0051. Feature: Replicache Push for Report Records

## Context

ADR 0024 defines reports as durable Markdown records attached to a project and
target. ADR 0037 adds app actions and CLI commands for creating ordinary report
records. ADR 0040 adds report generation as a read-style helper that renders
Markdown from existing product records without creating a report by itself.

A local sync client should be able to create the same ordinary report records
through Replicache push. This lets local agents preserve summaries, handoff
notes, eval reports, or generated Markdown through the same record surface they
use from the CLI.

Creating a report through sync is not the same as generating a report. The
client supplies the Markdown body. The app stores that Markdown as a report
record.

## Decision

Extend the existing Replicache push route:

```text
POST /replicache/push
```

Add one mutator:

```text
reports.create
```

The push request envelope, mutation ordering, skipped old/future mutations,
permanent-error behavior, and result shape remain unchanged from ADR 0043.

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

`reports.create` args:

```ts
type CreateReportMutationArgs = {
  readonly id: SituId<"report">;
  readonly projectId: SituId<"project">;
  readonly target: TargetRef;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly generatedBy: ActorRef;
  readonly now?: IsoTimestamp;
};
```

Validation rules:

- `id` is required and must be a non-empty Situ id string
- `projectId` is required and must be a non-empty Situ id string
- `target` is required and must be a valid `TargetRef`
- `title` and `bodyMarkdown` must be non-empty strings after trimming
- `generatedBy` is required and must be a valid `ActorRef`
- `now`, when present, must be a valid ISO timestamp

Validation should reuse the existing sync validation helpers and conventions:
`requireSituId`, `requireTargetRef`, `requireActorRef`, and
`optionalIsoTimestamp`. Do not introduce stricter ID-prefix validation or new
sync-specific report validation beyond those existing patterns.

Invalid args become permanent validation errors and advance the client's last
processed mutation id.

## Application Behavior

`reports.create` delegates to the existing report app action:

```ts
createReportAction({
  context,
  id,
  projectId,
  target,
  title,
  bodyMarkdown,
  generatedBy,
  now,
});
```

The action writes one `reports` record and returns it. Push does not need to
return the created report record. This ADR does not add report visibility to
Replicache pull; pull behavior for reports remains unchanged and must be
handled by a separate ADR.

The report's `projectId` must refer to an existing project, matching the report
repository's existing foreign-key behavior. Missing projects become permanent
conflict errors.

The report `target` remains an opaque product ref. `reports.create` preserves
the caller-supplied target and does not require the target record to exist.

Duplicate report ids become permanent conflict errors and do not create another
report.

## Primitive Boundaries

Do not add sync-specific behavior to `@situ/reports`.

Do not add report generation behavior to this mutator. In particular,
`reports.create` does not collect project state, render Markdown, inspect
artifacts, run commands, or call `generateProjectReportMarkdown`.

Do not add events or notifications automatically. A report record is already a
visible product record. If a caller wants a handoff, timeline note, or wake-up
notification, it can push a comment, event, or notification as a separate
ordinary mutation when those mutators are available.

## Result Semantics

The push result shape remains:

```ts
type ReplicachePushResult = {
  readonly ok: true;
  readonly processedMutationCount: number;
  readonly skippedMutationCount: number;
  readonly permanentErrorCount: number;
  readonly permanentErrors: readonly ReplicachePermanentMutationError[];
};
```

Successful `reports.create` mutations:

- create exactly one report record
- create zero comment records
- create zero event records
- create zero notification records
- advance the client's last processed mutation id

Permanent errors follow the existing push contract:

- malformed args are permanent validation errors
- missing parent project rows are permanent conflict errors
- duplicate report ids are permanent conflict errors
- permanent errors advance the client's last processed mutation id
- unexpected JavaScript errors abort push processing and do not advance client
  state

Old mutations and future mutations are skipped without validation and without
advancing client state.

## Tests

Implementation should include focused tests for:

- successful `reports.create` writes one report, preserves project id, target,
  title, Markdown body, actor ref, and timestamp metadata, and advances client
  state
- successful `reports.create` creates no comments, no events, and no
  notifications
- malformed report args become permanent validation errors and create no reports
- missing project parents become permanent conflict errors and create no reports
- duplicate report ids become permanent conflict errors without duplicate rows
- report targets are preserved without requiring target existence beyond the
  parent project
- old and future report mutations are skipped without validation and without
  advancing client state

The existing HTTP route tests do not need separate report-mutator coverage
unless this ADR changes HTTP routing behavior, which it should not do.

## Boundaries

Do not add pull records for reports in this ADR.

Do not add `events.create` in this ADR.

Do not add report generation, report persistence from generation, artifact
creation, file reads, command execution, agent spawning, scheduler behavior,
runtime state, or provider sessions.

Do not add new HTTP routes.

## Consequences

Local sync clients can now persist report records through the same mutation log
as projects, tasks, comments, notifications, experiments, measurements,
artifacts, and reviews.

Reports stay simple: they are durable Markdown records. Generation, handoffs,
timeline notes, and wake-up notifications remain explicit separate actions.
