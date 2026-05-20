---
status: active
category: feature
created: 2026-05-14
---

# 0053. Feature: Replicache Push for Event Records

## Context

ADR 0018 defines events as the append-only timeline primitive. ADR 0032 adds
event app actions and CLI commands so humans and local agents can inspect
activity and append plain timeline notes.

Project, task, and experiment app actions already create timeline events when
those product actions need visible history. Local sync clients also need a way
to append an ordinary event when the event itself is the product action being
performed, such as a correction, note, or visible activity marker.

Events are not workflow steps, leases, scheduler commands, hidden jobs, or
runtime session handles. They are durable timeline records.

## Decision

Extend the existing Replicache push route:

```text
POST /replicache/push
```

Add one mutator:

```text
events.create
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

`events.create` args:

```ts
type CreateEventMutationArgs = {
  readonly id: SituId<"event">;
  readonly target: TargetRef;
  readonly actor: ActorRef;
  readonly summaryMarkdown: string;
  readonly bodyMarkdown?: string;
  readonly now?: IsoTimestamp;
};
```

Validation rules:

- `id` is required and must be a non-empty Situ id string
- `target` is required and must be a valid `TargetRef`
- `actor` is required and must be a valid `ActorRef`
- `summaryMarkdown` must be a non-empty string after trimming
- `bodyMarkdown`, when present, must be a non-empty string after trimming
- `now`, when present, must be a valid ISO timestamp

Validation should reuse the existing sync validation helpers and conventions:
`requireSituId`, `requireTargetRef`, `requireActorRef`,
`requireNonEmptyString`, `optionalNonEmptyString`, and
`optionalIsoTimestamp`. Do not introduce stricter ID-prefix validation or new
sync-specific event validation beyond those existing patterns.

Add `parseCreateEventMutationArgs` in the existing sync validation module using
the local validation helpers. Do not export or move those helpers unless an
existing code pattern already requires it.

The parsed `summaryMarkdown`, `bodyMarkdown`, and actor display name use the
existing sync validation normalization. Non-empty string helpers trim accepted
values before persistence; push does not preserve leading or trailing
whitespace.

Invalid args become permanent validation errors and advance the client's last
processed mutation id.

## Application Behavior

`events.create` delegates to the existing event app action:

```ts
createEventAction({
  context,
  id,
  target,
  actor,
  summaryMarkdown,
  bodyMarkdown,
  now,
});
```

The action writes one `events` record and returns `{ event }`. Push ignores
that return value and does not return the created event record. Event visibility
in Replicache pull must be handled by a separate ADR.

The event `target` remains an opaque product ref. `events.create` preserves the
caller-supplied target and does not require the target record to exist.

Duplicate event ids become permanent conflict errors and do not create another
event.

## Primitive Boundaries

Do not add sync-specific behavior to `@situ/events`.

Do not add event kinds, workflow statuses, scheduler state, provider sessions,
leases, heartbeats, runtime handles, or target existence checks.

Do not add comments, reports, or notifications automatically. An event record
is itself the visible timeline entry. If a caller wants a handoff comment,
written report, or wake-up notification, it can push those as separate ordinary
mutations when those mutators are available.

Do not make event creation imply that target work was performed, accepted, or
completed. Target records and specialized primitives still carry their own
state.

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

Successful `events.create` mutations:

- create exactly one event record
- create zero comment records
- create zero notification records
- create zero report records
- advance the client's last processed mutation id

Permanent errors follow the existing push contract:

- malformed args are permanent validation errors
- duplicate event ids are permanent conflict errors
- permanent errors advance the client's last processed mutation id
- unexpected JavaScript errors abort push processing and do not advance client
  state

Old mutations and future mutations are skipped without validation and without
advancing client state.

## Tests

Implementation should include focused tests for:

- successful `events.create` writes one event, preserves target, actor ref,
  normalized summary Markdown, normalized optional body Markdown, and timestamp
  metadata, and advances client state
- successful `events.create` creates no comments, no notifications, and no
  reports
- malformed event args become permanent validation errors and create no events
- blank optional `bodyMarkdown` becomes a permanent validation error
- duplicate event ids become permanent conflict errors without duplicate rows
- event targets are preserved without requiring target existence, including a
  successful create whose target id has no backing target row
- old and future event mutations are skipped without validation and without
  advancing client state

The existing HTTP route tests do not need separate event-mutator coverage
unless this ADR changes HTTP routing behavior, which it should not do.

## Boundaries

Do not add pull records for events in this ADR.

Do not add event update, delete, archive, or move behavior.

Do not add REST endpoints.

Do not add sync code to primitive packages.

Do not generate reports, render Markdown, read files, hash files, copy
artifacts, spawn agents, schedule work, or open provider sessions.

## Consequences

Local sync clients can now append visible timeline records through the same
mutation log as projects, tasks, comments, notifications, experiments,
measurements, artifacts, reviews, and reports.

Events stay simple: append-only Markdown activity records with visible actor
attribution and opaque target refs.
