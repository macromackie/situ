---
status: active
category: feature
created: 2026-05-14
---

# 0065. Feature: Task Assignment Inbox Notifications

## Context

Tasks carry responsibility through `assignedTo`. Notifications are the visible
inbox primitive that lets an actor notice work without adding hidden workers,
leases, scheduler state, provider sessions, or workflow-specific delivery
machinery.

Earlier task and sync ADRs kept task writes and notification writes separate.
That boundary was useful while the notification primitive was being introduced.
The target product behavior now needs one narrow composition rule: assigning a
task to an actor should create an ordinary notification for that actor.

This keeps the mental model close to a human collaboration tool:

```text
actor assigns task to verifier-1
  -> task.assignedTo becomes verifier-1
  -> task timeline records the assignment event
  -> verifier-1 has a visible inbox notification pointing at the task
```

The notification is not a job. It is only a visible attention record.

## Decision

Task assignment actions create inbox notifications when the action input
includes a valid `assignedTo` actor.

This ADR intentionally narrows the earlier task-action and push-mutator
boundaries for this specific case:

- `createTaskAction` creates a notification when `assignedTo` is present.
- `assignTaskAction` creates a notification when `assignedTo` is present.
- `tasks.create` Replicache push creates a notification when `assignedTo` is
  present because it delegates to the task create action helper.
- `tasks.assign` Replicache push creates a notification when `assignedTo` is
  present because it delegates to the task assign action helper.

Clearing assignment does not create a notification. For app actions and
repository-shaped TypeScript inputs, clearing assignment means `assignedTo` is
omitted or `undefined`. `null` is outside the supported app action type and is
invalid in Replicache or CLI input validation. Empty actor fields are invalid
under the existing actor validation rules.

Moving a task does not create a notification.

Reading, listing, or fetching a task does not create a notification.

## Action API

`CreateTaskActionResult` becomes:

```ts
export type CreateTaskActionResult = {
  readonly task: TaskRecord;
  readonly event: EventRecord;
  readonly notification?: NotificationRecord;
};
```

`AssignTaskActionResult` becomes:

```ts
export type AssignTaskActionResult = {
  readonly task: TaskRecord;
  readonly event: EventRecord;
  readonly notification?: NotificationRecord;
};
```

The optional `notification` field is present only when the action creates a
notification.

`MoveTaskActionResult` does not change.

Read action results do not change.

## Notification Shape

Assignment-created notifications use the assigned actor id as the recipient
inbox id:

```ts
recipient: {
  recipientId: input.assignedTo.actorId,
  displayName: input.assignedTo.displayName,
}
```

For `createTaskAction`, the creating actor caused the notification:

```ts
createdBy: task.createdBy;
```

For `assignTaskAction`, the assigning actor caused the notification:

```ts
createdBy: input.actor;
```

The target points at the task:

```ts
target: {
  targetKind: "task",
  targetId: task.id,
}
```

The summary is exact:

```text
Assigned task: <task title>
```

Assignment-created notifications do not set `bodyMarkdown`. The task already
contains the durable Markdown handoff body, and the notification should stay a
small inbox pointer.

Assignment-created notifications leave `readAt` and `dismissedAt` unset.

The notification repository generates the notification id with the normal
notification id prefix. Task commands and Replicache task mutators do not accept
caller-provided notification ids.

Assignment notifications have no project, workspace, retry, delivery, or
runtime-session fields beyond the ordinary `NotificationRecord` shape.

`bodyMarkdown`, `readAt`, and `dismissedAt` are omitted from the returned
record and stored as SQL `NULL` by the notification repository.

## Reassignment And Repeated Assignment

Each successful assignment action with a valid `assignedTo` creates a new
notification, even if the task was already assigned to the same actor.

Reassigning a task creates a notification for the new assignee only. Existing
notifications for previous assignees remain unchanged. They are not
auto-dismissed, marked read, deleted, or superseded.

Clearing assignment leaves existing notifications unchanged.

Replicache client mutation idempotency remains the existing push responsibility:
an already-processed mutation id is skipped and does not create another
notification. A later distinct mutation that assigns the same actor again is a
new product action and creates a new notification.

## Timestamp Rules

When a task action receives `now`, pass that same value to:

- the task write
- the event write
- the notification write, when a notification is created

When `now` is absent, let each repository choose its own current timestamp.

The action should not add a separate notification timestamp argument.

The existing primitive helpers define exact metadata effects:

- task creation sets the task `createdAt` and `updatedAt`
- task assignment updates the task `updatedAt`
- event creation sets the event `createdAt` and `updatedAt`
- notification creation sets the notification `createdAt` and `updatedAt`

## Transaction Rules

Task writes, assignment events, and assignment notifications are one product
action. They must commit or roll back together.

If task creation or assignment fails, do not create the event or notification.

If event creation fails, roll back the task write and do not leave a
notification behind.

If notification creation fails, roll back the task write and event write.

The transaction callback must use the callback `context`, not the outer action
input context, for all repositories involved in the write.

## Replicache Push Behavior

Replicache push remains a thin adapter over app actions.

Successful `tasks.create` mutations with `assignedTo` present now create:

- one task
- one event
- one notification for the assignee

Successful `tasks.create` mutations without `assignedTo` still create:

- one task
- one event
- zero notifications

Successful `tasks.assign` mutations with `assignedTo` present now create:

- one assignment update
- one event
- one notification for the assignee

Successful `tasks.assign` mutations with `assignedTo` omitted still create:

- one assignment-clearing update
- one event
- zero notifications

The push result shape does not change. Clients read notification state through
pull, notification commands, or notification repositories.

## CLI Behavior

Project and task CLI commands remain thin adapters over app actions.

Text output for task commands does not change.

JSON output continues to serialize action return values directly. Therefore:

- `situ --json tasks create ...` includes `notification` when `assignedTo` is
  present.
- `situ --json tasks assign ...` includes `notification` when `assignedTo` is
  present.
- JSON output omits `notification` when no notification was created.

No notification id flag is added to task commands. The notification repository
generates the notification id.

## Required Tests

Implementation should include focused tests for:

- creating an assigned task creates one event and one notification
- creating an unassigned task creates one event and zero notifications
- assigning a task creates one event and one notification
- assigning a task to the same actor again creates another event and another
  notification
- reassigning a task leaves prior notifications unchanged and creates one
  notification for the new assignee
- clearing a task assignee creates one event and zero notifications
- assignment-created notifications use the exact recipient, target, creator,
  summary, omitted body, unread, undismissed, id-generation, and timestamp
  rules from this ADR
- event creation failure rolls back the task write and leaves no notification
- notification creation failure rolls back the task write and event write
- Replicache `tasks.create` with `assignedTo` creates a notification
- Replicache `tasks.create` without `assignedTo` creates no notification
- Replicache `tasks.assign` with `assignedTo` creates a notification
- Replicache `tasks.assign` without `assignedTo` creates no notification
- task CLI JSON output includes `notification` only when the action created one
- task CLI text output remains unchanged

## Boundaries

Do not add notification kinds, notification statuses, delivery transports,
polling loops, scheduler state, provider sessions, workers, leases, or hidden
runtime handles.

Do not make comments, events, reviews, reports, experiments, measurements, or
artifacts create notifications automatically in this ADR.

Do not make task moves create notifications in this ADR.

Do not treat notification `readAt` or `dismissedAt` as proof that task work was
performed.

Do not add a separate assignment-notification table or task-notification join
table. The ordinary notification record is enough.

## Consequences

An assigned actor can discover work through the same visible inbox primitive it
uses for every other attention record. External local harnesses may choose to
list notifications for an actor and wake the appropriate local agent, but Situ
does not store that wake-up runtime as product state.
