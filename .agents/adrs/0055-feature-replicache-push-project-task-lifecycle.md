---
status: active
category: feature
created: 2026-05-14
---

# 0055. Feature: Replicache Push for Project and Task Lifecycle Mutations

## Context

ADR 0043 adds the first Replicache project/task write set:

- `projects.create`
- `tasks.create`
- `tasks.move`

The app action and CLI surface also supports:

- archiving projects
- assigning or clearing task assignees

Those are ordinary product actions. A local sync client should be able to
perform them through the same Replicache push surface without adding REST
endpoints, workflow state, or special orchestration machinery.

## Decision

Extend the existing Replicache push route:

```text
POST /replicache/push
```

Add two mutators:

```text
projects.archive
tasks.assign
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

`projects.archive` args:

```ts
type ArchiveProjectMutationArgs = {
  readonly id: SituId<"project">;
  readonly eventId?: SituId<"event">;
  readonly actor: ActorRef;
  readonly now?: IsoTimestamp;
};
```

`tasks.assign` args:

```ts
type AssignTaskMutationArgs = {
  readonly id: SituId<"task">;
  readonly eventId?: SituId<"event">;
  readonly actor: ActorRef;
  readonly assignedTo?: ActorRef;
  readonly now?: IsoTimestamp;
};
```

Validation rules:

- `id` is required and must be a non-empty Situ id string
- `eventId`, when present, must be a non-empty Situ id string
- `actor` is required and must be a valid `ActorRef`
- `assignedTo`, when present for `tasks.assign`, must be a valid `ActorRef`
- omitting `assignedTo` for `tasks.assign` clears the task assignee
- `assignedTo: null` is invalid; only omitting `assignedTo` clears the task
  assignee
- `now`, when present, must be a valid ISO timestamp

Validation should reuse the existing sync validation helpers and conventions:
`requireSituId`, `optionalSituId`, `requireActorRef`, `optionalActorRef`, and
`optionalIsoTimestamp`. Do not introduce stricter ID-prefix validation or new
sync-specific validation beyond those existing patterns.

Invalid args become permanent validation errors and advance the client's last
processed mutation id.

## Application Behavior

`projects.archive` delegates to the same transaction-inner helper used by the
project archive app action:

```ts
archiveProjectInContext({
  context,
  id,
  actor,
  eventId,
  now,
});
```

It archives one project and creates one event with summary:

```text
Archived project
```

Missing project ids become permanent not-found errors. Duplicate `eventId`
values become permanent conflict errors and roll back the project archive for
that mutation.

`tasks.assign` delegates to the same transaction-inner helper used by the task
assign app action:

```ts
assignTaskInContext({
  context,
  id,
  actor,
  assignedTo,
  eventId,
  now,
});
```

It updates one task assignment and creates one event.

When `assignedTo` is present, the event summary follows the existing action
behavior:

```text
Assigned task to <displayName-or-actorId>
```

When `assignedTo` is omitted, the event summary is:

```text
Cleared task assignee
```

Missing task ids become permanent not-found errors. Duplicate `eventId` values
become permanent conflict errors and roll back the task assignment for that
mutation.

Push does not need to return the changed project or task record. Replicache
clients read visible state through pull.

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

Successful `projects.archive` mutations:

- set the project status to `archived`
- update the project metadata timestamp
- create exactly one event record
- create zero comments, notifications, reports, experiments, measurements,
  artifacts, or reviews
- advance the client's last processed mutation id

Successful `tasks.assign` mutations:

- set or clear the task assignee
- update the task metadata timestamp
- create exactly one event record
- create zero comments, notifications, reports, experiments, measurements,
  artifacts, or reviews
- advance the client's last processed mutation id

Permanent errors follow the existing push contract:

- malformed args are permanent validation errors
- missing project or task rows are permanent not-found errors
- duplicate event ids are permanent conflict errors
- permanent errors advance the client's last processed mutation id
- expected application errors roll back partial product effects for that
  mutation
- unexpected JavaScript errors abort push processing and do not advance client
  state

Old mutations and future mutations are skipped without validation and without
advancing client state.

## Tests

Implementation should include focused tests for:

- `projects.archive` archives a project, creates the exact archive event, and
  advances client state
- `tasks.assign` assigns a task to an actor, creates the exact assignment event,
  and advances client state
- `tasks.assign` clears a task assignee when `assignedTo` is omitted and
  creates the exact clear-assignee event
- lifecycle events include the expected target, actor, summary, and
  `now`-derived metadata
- these mutators do not create comments, notifications, reports, experiments,
  measurements, artifacts, or reviews
- malformed project/task lifecycle args become permanent validation errors and
  create no product effects
- missing projects and tasks become permanent not-found errors and create no
  events
- duplicate event ids become permanent conflict errors and roll back the
  project archive or task assignment
- permanent lifecycle errors report the expected error kinds and still advance
  client state
- old and future lifecycle mutations are skipped without validation and without
  advancing client state

The existing HTTP route tests do not need separate lifecycle-mutator coverage
unless this ADR changes HTTP routing behavior, which it should not do.

## Boundaries

Do not add pull behavior in this ADR.

Do not add new project statuses or task statuses.

Do not add task revision, project delete, project unarchive, bulk assignment,
or assignment claiming semantics.

Do not add REST endpoints.

Do not add sync code to primitive packages.

Do not create comments, notifications, reports, experiments, measurements,
artifacts, reviews, worktrees, scheduler state, provider sessions, or runtime
state.

These mutators have no filesystem, process, artifact-copying, agent-spawning,
scheduler, provider-session, or runtime side effects.

## Consequences

The sync write surface now covers the core project and task lifecycle actions
already exposed by the app action and CLI layers:

```text
create project
archive project
create task
move task
assign or clear task assignee
```

These remain ordinary product actions with visible event records, not hidden
workflow transitions.
