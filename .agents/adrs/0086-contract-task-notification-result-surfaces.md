---
status: active
category: contract
created: 2026-05-14
---

# 0086. Contract: Task Notification Result Surfaces

## Context

ADR 0065 defines the target task-assignment behavior: creating or assigning a
task to an actor creates an ordinary inbox notification in the same product
action.

The final action and CLI result surfaces must be unambiguous. Earlier task
action and task CLI ADR text should not imply that notifications are forbidden
or omitted from JSON output when assignment creates one.

## Decision

Task create and assign actions return the notification they create.

Final action result contracts:

```ts
export type CreateTaskActionResult = {
  readonly task: TaskRecord;
  readonly event: EventRecord;
  readonly notification?: NotificationRecord;
};

export type AssignTaskActionResult = {
  readonly task: TaskRecord;
  readonly event: EventRecord;
  readonly notification?: NotificationRecord;
};
```

`notification` is present only when the action creates a notification. It is
omitted for unassigned task creation and assignment clearing.

`MoveTaskActionResult` remains:

```ts
export type MoveTaskActionResult = {
  readonly task: TaskRecord;
  readonly event: EventRecord;
};
```

Task create, move, and assign write actions each create exactly one event. Task
create and assign additionally create exactly one notification when
`assignedTo` is present.

The notification write is part of the same transaction as the task write and
event write. If notification creation fails, the task write and event write roll
back.

## CLI JSON

Task CLI JSON serializes action results directly.

Final JSON output shapes:

| Command        | JSON Output                                              |
| -------------- | -------------------------------------------------------- |
| `tasks create` | `{"task":<task>,"event":<event>}` or with `notification` |
| `tasks move`   | `{"task":<task>,"event":<event>}`                        |
| `tasks assign` | `{"task":<task>,"event":<event>}` or with `notification` |

When `tasks create` or `tasks assign` creates a notification, JSON output
includes:

```json
{"task":<task>,"event":<event>,"notification":<notification>}
```

When no notification is created, JSON output omits the `notification` key.

Task CLI text output does not mention notification ids. The task notification is
discoverable through notification commands, Replicache pull, and the returned
JSON payload.

## ADR Alignment

ADR 0027 and ADR 0028 should describe these final result surfaces consistently.
They should not state that task write actions return only `{ task, event }`, and
they should not prohibit the notification side effect that ADR 0065 makes part
of the target product behavior.

ADR 0065 remains the detailed behavioral contract for assignment notification
shape, transaction rules, timestamp rules, and tests.

## Verification

Tests must prove:

- assigned task creation returns one event and one notification
- unassigned task creation returns one event and omits notification
- task assignment returns one event and one notification
- assignment clearing returns one event and omits notification
- task CLI JSON includes `notification` only when the action created one
- task CLI text output remains unchanged

## Consequences

A fresh implementation can preserve the simple task action surface while still
making assignment notifications visible to local agents through ordinary
product records.
