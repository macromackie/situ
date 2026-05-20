---
status: active
category: feature
created: 2026-05-13
---

# 0030. Feature: Notification Actions and CLI

## Context

Notifications are the local inbox primitive from ADR 0019. They are how a
human or local agent sees that a product record may need attention without
adding workers, leases, polling loops, scheduler state, or hidden workflow
steps.

The primitive package already stores notification records. The app still needs
a small action surface so app actions and sync can create notifications, plus
CLI commands so an external local agent harness can inspect, mark, and dismiss
notifications through ordinary Situ commands.

## Decision

Add notification app actions and a `situ notifications` CLI command group.

Expected files:

```text
projects/app/src/actions/index.ts
projects/app/src/actions/notifications.ts
projects/app/src/actions/notifications.test.ts
projects/app/src/cli/base.ts
projects/app/src/cli/commands/notifications.ts
projects/app/src/cli/flags.ts
projects/app/src/cli/format.ts
projects/app/src/cli/situ.test.ts
```

Notification CLI commands are thin adapters. They parse command-local args,
open the local database, call notification app actions, format results, and
close the database. They do not call primitive repositories directly.

The CLI intentionally does not expose manual notification creation. Inbox
records are created by app-level product actions, task assignment side effects,
and sync mutations. This keeps the public CLI focused on reading and clearing
attention rather than hand-crafting inbox records.

## Action API

`projects/app/src/actions/notifications.ts` exports:

```ts
export type CreateNotificationActionInput = CreateNotificationInput & {
  readonly context: AppActionContext;
};

export type CreateNotificationActionResult = {
  readonly notification: NotificationRecord;
};

export function createNotificationAction(
  input: CreateNotificationActionInput,
): CreateNotificationActionResult;

export type GetNotificationActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"notification">;
};

export function getNotificationAction(
  input: GetNotificationActionInput,
): NotificationRecord | undefined;

export type ListNotificationsActionInput = ListNotificationsForRecipientInput & {
  readonly context: AppActionContext;
};

export function listNotificationsAction(
  input: ListNotificationsActionInput,
): readonly NotificationRecord[];

export type MarkNotificationReadActionInput = MarkNotificationReadInput & {
  readonly context: AppActionContext;
};

export type MarkNotificationReadActionResult = {
  readonly notification: NotificationRecord;
};

export function markNotificationReadAction(
  input: MarkNotificationReadActionInput,
): MarkNotificationReadActionResult;

export type DismissNotificationActionInput = DismissNotificationInput & {
  readonly context: AppActionContext;
};

export type DismissNotificationActionResult = {
  readonly notification: NotificationRecord;
};

export function dismissNotificationAction(
  input: DismissNotificationActionInput,
): DismissNotificationActionResult;
```

The action module imports:

- `SituId` from `@situ/common`
- `CreateNotificationInput`, `DismissNotificationInput`,
  `ListNotificationsForRecipientInput`, `MarkNotificationReadInput`, and
  `NotificationRecord` from `@situ/notifications`
- `AppActionContext` from `./context.js`

`createNotificationAction` calls `context.repositories.notifications.create`
and returns `{ notification }`.

It forwards these fields to `notifications.create`:

- `id`
- `recipient`
- `target`
- `createdBy`
- `summaryMarkdown`
- `bodyMarkdown`
- `now`

It does not forward `context`.

`getNotificationAction` calls `context.repositories.notifications.getById` and
returns the repository result directly.

`listNotificationsAction` calls
`context.repositories.notifications.listForRecipient` and returns the
repository result directly.

`markNotificationReadAction` calls
`context.repositories.notifications.markRead` and returns `{ notification }`.
It forwards:

- `id`
- `now`

`dismissNotificationAction` calls `context.repositories.notifications.dismiss`
and returns `{ notification }`. It forwards:

- `id`
- `now`

These actions do not emit events. Notification read and dismissal state belongs
to the notification record itself, and creating a notification is not a target
timeline event. Future feature ADRs may compose notification creation with task,
comment, review, or experiment events when the product action itself changes a
target record.

`projects/app/src/actions/index.ts` exports the notification actions from
`./notifications.js`.

## CLI Commands

The CLI supports these commands:

```text
situ notifications list [flags]
situ notifications get <notification-id>
situ notifications read <notification-id> [flags]
situ notifications dismiss <notification-id> [flags]
```

Global options still appear before the command group:

```text
situ --json --db /tmp/situ.db notifications list --recipient-id verifier-1
```

`projects/app/src/cli/commands/notifications.ts` exports exactly:

```ts
export function runNotificationsCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult;
```

`base.ts` dispatches the `notifications` command group to
`runNotificationsCommand({ invocation })`.

The root help text includes:

```text
  notifications  Manage notification inbox records.
```

## CLI Flags

### `notifications list`

Flags:

```text
--recipient-id <id>
--include-dismissed
--limit <positive-integer>
```

Required flags:

- `--recipient-id`

Optional flags:

- `--include-dismissed`
- `--limit`

`--include-dismissed` is a boolean flag. Without it, dismissed notifications
are excluded by the primitive repository.

`--limit` is parsed as a positive integer before opening the database. Missing
limits are passed as `undefined`, so the primitive repository owns the default.

The list recipient filter ignores display name.

The CLI maps list recipient flags to:

```ts
recipientId;
```

The command calls:

```ts
listNotificationsAction({
  context,
  recipientId,
  includeDismissed,
  limit,
});
```

`includeDismissed` is `true` only when `--include-dismissed` is present.
Missing `--include-dismissed` is passed as `undefined` or omitted.

### `notifications get`

The command accepts one positional id:

```text
situ notifications get notification_123
```

When the notification is not found, the CLI throws `NotFoundError` with:

```text
Notification was not found.
```

and details:

```ts
{
  id;
}
```

The command calls `getNotificationAction({ context, id })` and wraps the result
as `{ notification }` after checking for `undefined`.

### `notifications read`

Flags:

```text
--now <iso-timestamp>
```

The command accepts one positional notification id and marks that notification
read.

The command calls:

```ts
markNotificationReadAction({
  context,
  id,
  now,
});
```

`--now` maps to `now`. When `--now` is absent, pass `undefined` or omit the
property.

When the notification is not found, the CLI lets the underlying `NotFoundError`
surface. The error message is:

```text
Notification was not found.
```

with details:

```ts
{
  id;
}
```

### `notifications dismiss`

Flags:

```text
--now <iso-timestamp>
```

The command accepts one positional notification id and dismisses that
notification from the active inbox.

The command calls:

```ts
dismissNotificationAction({
  context,
  id,
  now,
});
```

`--now` maps to `now`. When `--now` is absent, pass `undefined` or omit the
property.

When the notification is not found, the CLI lets the underlying `NotFoundError`
surface. The error message is:

```text
Notification was not found.
```

with details:

```ts
{
  id;
}
```

## Parser Contract

Command-specific syntax validation must complete before opening the database.
This includes:

- unknown notification subcommands
- missing subcommands
- missing required positional args
- extra positional args
- missing required flags
- unknown flags
- missing flag values
- invalid positive integer limits

Command-local help follows ADR 0092. For example,
`situ notifications list --help` prints usage without opening the database.

Duplicate scalar flags are allowed; the last value wins.

Boolean flags take no value. Duplicate boolean flags are allowed and
idempotent. A token after a boolean flag is parsed normally as the next flag or
as a positional arg. For example, `situ notifications list --include-dismissed
true ...` treats `true` as a positional arg and then fails because `list`
accepts no positionals.

Command-local flags and positionals may be interleaved. For example,
`situ notifications read --now 2026-05-13T12:00:00.000Z notification_1` and
`situ notifications read notification_1 --now 2026-05-13T12:00:00.000Z` are
equivalent.

The parser does not support short flags, equals syntax, or a `--` sentinel.

Parser errors use `ValidationError` through the CLI parser error helper, with
the existing command-local message style:

- missing subcommand: `Command notifications requires a subcommand.`
- unknown subcommand: `Unknown notifications subcommand: <subcommand>.`
- missing required positional arg: `Command <command> requires <<name>>.`
- missing required flag: `Missing required flag <flag>.`
- unknown flag: `Unknown flag for <command>: <flag>.`
- missing flag value: `Missing value for <flag>.`
- extra positional args:
  `Command <command> received extra positional arguments: <args>`
- invalid limit: `Expected a positive integer limit.`

In parser error messages, `<command>` is the literal command path, for example
`notifications list`, `notifications read`, or `notifications dismiss`.

Required flag validation is deterministic and follows the order documented in
each command's Required flags list.

## Output Shape

JSON command outputs use `JSON.stringify` on the object shown below. Write
commands serialize action return values directly. Read and list commands wrap
read action results as `{ notification }` and `{ notifications }`.

JSON command outputs:

| Command                 | JSON Output                              |
| ----------------------- | ---------------------------------------- |
| `notifications list`    | `{"notifications":[<notification>,...]}` |
| `notifications get`     | `{"notification":<notification>}`        |
| `notifications read`    | `{"notification":<notification>}`        |
| `notifications dismiss` | `{"notification":<notification>}`        |

Each JSON output is one JSON object plus a trailing newline.

Text output:

| Command                 | Text Output                     |
| ----------------------- | ------------------------------- |
| `notifications list`    | notification lines              |
| `notifications get`     | one notification line           |
| `notifications read`    | `Marked notification <id> read` |
| `notifications dismiss` | `Dismissed notification <id>`   |

Notification lines use:

```text
<id>\t<recipient-id>\t<target-kind>/<target-id>\t<state>\t<summary>
```

`<state>` is:

- `dismissed` when `dismissedAt` is present
- `read` when `readAt` is present and `dismissedAt` is absent
- `unread` when neither timestamp is present

Text list output for an empty list is an empty string.

Text outputs include a trailing newline when they contain at least one line.

Text fields are emitted raw. Local agents that need robust parsing should use
`--json`.

## Database Lifecycle

Notification CLI commands open the app database:

```ts
const database = openAppDatabase({
  databasePath: invocation.databasePath,
  environment: invocation.environment,
});
```

They create an action context with `createAppActionContext({ database })`, run
one notification app action, and close the database in a `finally` block.

`doctor` remains non-mutating and does not open the database.

## Tests

Add action tests covering:

- creating a notification through the app action
- getting an existing and missing notification
- listing active notifications for a recipient
- marking a notification read
- dismissing a notification without marking it read

Add CLI tests covering:

- list, get, read, and dismiss notification commands
- JSON output for at least one read or update command
- JSON output wraps list results as `{ notifications: [...] }`
- `--now` mapping for read and dismiss
- text list state formatting for unread, read, and dismissed notifications
- not-found errors for `notifications get`
- not-found errors for `notifications read` and `notifications dismiss`
- command-local syntax validation before opening the database
- missing required flag validation before opening the database

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not add workers, agent runners, scheduler behavior, polling loops,
subscriptions, push delivery, email delivery, webhook delivery, leases,
runtime sessions, or provider threads.

Do not automatically create notifications from project, task, comment, review,
experiment, or report actions in this ADR. Those product-side effects need
their own feature ADRs.

Do not add notification kinds or workflow statuses. Use Markdown summaries,
targets, read timestamps, and dismissed timestamps.

Do not make notification read or dismissal imply that target work was
performed. Target records, comments, reviews, measurements, artifacts, reports,
and events carry the work evidence.

## Consequences

Local agent harnesses can now treat Situ as a small inbox app:

```text
product action creates notification
  -> recipient lists active notifications
  -> recipient reads the target record
  -> recipient marks or dismisses the notification
```

This supports asleep/wake-up-style coordination without introducing a Situ
worker process or hidden orchestration engine.
