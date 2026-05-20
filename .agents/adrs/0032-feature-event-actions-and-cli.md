---
status: active
category: feature
created: 2026-05-13
---

# 0032. Feature: Event Actions and CLI

## Context

Events are the append-only timeline primitive from ADR 0018. Project and task
actions already emit events, but local agents and humans still need a direct
CLI surface to inspect timeline entries, list recent activity, and append a
plain correction or note when that is the product action being performed.

Events should remain simple visible activity records. They are not workflow
steps, leases, scheduler commands, hidden jobs, or runtime session handles.

An event record has an id, a target, an actor, a Markdown summary, optional
Markdown body, and sync metadata. This ADR does not change that primitive
shape.

## Decision

Add event app actions and a `situ events` CLI command group.

Expected files:

```text
projects/app/src/actions/events.ts
projects/app/src/actions/events.test.ts
projects/app/src/actions/index.ts
projects/app/src/cli/base.ts
projects/app/src/cli/commands/events.ts
projects/app/src/cli/flags.ts
projects/app/src/cli/format.ts
projects/app/src/cli/situ.test.ts
```

Event CLI commands are thin adapters. They parse command-local args, open the
local database, call event app actions, format results, and close the database.
They do not call primitive repositories directly.

## Action API

`projects/app/src/actions/events.ts` exports:

```ts
export type CreateEventActionInput = CreateEventInput & {
  readonly context: AppActionContext;
};

export type CreateEventActionResult = {
  readonly event: EventRecord;
};

export function createEventAction(input: CreateEventActionInput): CreateEventActionResult;

export type GetEventActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"event">;
};

export function getEventAction(input: GetEventActionInput): EventRecord | undefined;

export type ListEventsActionInput = ListEventsForTargetInput & {
  readonly context: AppActionContext;
};

export function listEventsAction(input: ListEventsActionInput): readonly EventRecord[];

export type ListRecentEventsActionInput = ListRecentEventsInput & {
  readonly context: AppActionContext;
};

export function listRecentEventsAction(input: ListRecentEventsActionInput): readonly EventRecord[];
```

The action module imports:

- `SituId` from `@situ/common`
- `CreateEventInput`, `EventRecord`, `ListEventsForTargetInput`, and
  `ListRecentEventsInput` from `@situ/events`
- `AppActionContext` from `./context.js`

`createEventAction` calls `context.repositories.events.create` and returns
`{ event }`.

It forwards these fields to `events.create`:

- `id`
- `target`
- `actor`
- `summaryMarkdown`
- `bodyMarkdown`
- `now`

It does not forward `context`.

`getEventAction` calls `context.repositories.events.getById` and returns the
repository result directly.

`listEventsAction` calls `context.repositories.events.listForTarget` and
returns the repository result directly.

`listRecentEventsAction` calls `context.repositories.events.listRecent` and
returns the repository result directly.

These actions do not emit other events or create notifications. Event creation
is itself the visible timeline entry.

`projects/app/src/actions/index.ts` exports the event actions from
`./events.js`.

## CLI Commands

The CLI supports these commands:

```text
situ events create [flags]
situ events list [flags]
situ events recent [flags]
situ events get <event-id>
```

Global options still appear before the command group:

```text
situ --json --db /tmp/situ.db events list --target-kind task --target-id task_123
```

`projects/app/src/cli/commands/events.ts` exports exactly:

```ts
export function runEventsCommand(input: { readonly invocation: SituCliInvocation }): SituCliResult;
```

`base.ts` dispatches the `events` command group to
`runEventsCommand({ invocation })`.

The root help text includes:

```text
  events    Manage event timeline records.
```

## CLI Flags

### `events create`

Flags:

```text
--id <event-id>
--target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
--target-id <target-id>
--actor-kind <human|local_agent|system>
--actor-id <id>
--actor-display-name <name>
--summary <markdown>
--body <markdown>
--now <iso-timestamp>
```

Required flags:

- `--target-kind`
- `--target-id`
- `--actor-kind`
- `--actor-id`
- `--summary`

Optional flags:

- `--id`
- `--actor-display-name`
- `--body`
- `--now`

The CLI maps target flags to:

```ts
target: {
  targetKind,
  targetId,
}
```

The CLI maps actor flags to:

```ts
actor: {
  actorKind,
  actorId,
  displayName: actorDisplayName,
}
```

When `--actor-display-name` is absent, omit `displayName` or pass
`displayName: undefined`.

The command calls:

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

`--summary` maps to `summaryMarkdown`.

`--body` maps to `bodyMarkdown`.

`--now` maps to `now`. When `--now` is absent, pass `undefined` or omit the
property.

The CLI validates `target-kind` and `actor-kind` before it opens the database.
Target-kind validation applies to every event command that accepts
`--target-kind`, including `events create` and `events list`.

The CLI does not trim flag values, validate id prefixes, or validate ISO
timestamps. Action and repository helpers own those validations.

### `events list`

Flags:

```text
--target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
--target-id <target-id>
```

Required flags:

- `--target-kind`
- `--target-id`

The command calls:

```ts
listEventsAction({
  context,
  target,
});
```

### `events recent`

Flags:

```text
--limit <positive-integer>
```

Optional flags:

- `--limit`

`--limit` is parsed as a positive integer before opening the database. Missing
limits are passed as `undefined`, so the primitive repository owns the default.

Limit parsing uses decimal digit strings only:

- accepted examples: `1`, `01`, `50`
- rejected examples: `0`, `-1`, `+1`, `1.5`, `1e2`, `abc`

After the decimal digit string is converted to a number, it must be a safe
integer greater than zero. Non-safe integers are rejected. The CLI does not
trim the limit value before validation.

The command calls:

```ts
listRecentEventsAction({
  context,
  limit,
});
```

### `events get`

The command accepts one positional id:

```text
situ events get event_123
```

The CLI casts the positional value to `SituId<"event">` and does not validate
the id prefix before opening the database.

When the event is not found, the CLI throws `NotFoundError` with:

```text
Event was not found.
```

and details `{ id }`.

The command calls `getEventAction({ context, id })` and wraps the result as
`{ event }` after checking for `undefined`.

## Parser Contract

Command-specific syntax validation must complete before opening the database.
This includes:

- unknown event subcommands
- missing subcommands
- missing required positional args
- extra positional args
- missing required flags
- unknown flags
- missing flag values
- invalid actor kinds
- invalid target kinds
- invalid positive integer limits

Command-local help follows ADR 0092. For example,
`situ events create --help` prints usage without opening the database.

Duplicate scalar flags are allowed; the last value wins.

Command-local tokens are scanned left-to-right before higher-level validation.
Tokens beginning with `--` are treated as command-local flags regardless of
position. A supported value flag consumes the next token as its value when that
token exists and does not start with `--`.

A supported value flag followed by any token beginning with `--` reports
`Missing value for <flag>.` before evaluating the following token. For example,
`situ events create --summary --bogus` reports
`Missing value for --summary.`, and `situ events recent --limit --bad` reports
`Missing value for --limit.`.

The parser does not support boolean flags, short flags, equals syntax, or a
`--` sentinel for event commands.

Parser errors use `ValidationError` through the CLI parser error helper, with
the existing command-local message style:

- missing subcommand: `Command events requires a subcommand.`
- unknown subcommand: `Unknown events subcommand: <subcommand>.`
- missing required positional arg: `Command <command> requires <<name>>.`
- missing required flag: `Missing required flag <flag>.`
- unknown flag: `Unknown flag for <command>: <flag>.`
- missing flag value: `Missing value for <flag>.`
- extra positional args:
  `Command <command> received extra positional arguments: <args>`
- invalid actor kind: `Invalid actor kind for <flag>: <value>.`
- invalid target kind: `Invalid target kind: <value>.`
- invalid limit: `Expected a positive integer limit.`

Parser tests only need to assert the serialized error message and kind. Error
details should be useful and include the relevant command, flag, value, or
allowed values when naturally available, but this ADR does not require exact
details payloads for parser errors.

In parser error messages, `<command>` is the literal command path, for example
`events create`, `events list`, `events recent`, or `events get`.

Required flag validation is deterministic and follows the order documented in
each command's Required flags list.

Parser validation order is deterministic:

1. Require the subcommand to exist.
2. Scan tokens left-to-right for unknown flags and missing flag values.
3. Validate positional arity.
4. Validate required flags in the documented order.
5. Validate enum-like flag values such as actor kind and target kind.
6. Validate numeric limits.

## Output Shape

JSON command outputs use `JSON.stringify` on the object shown below. Write
commands serialize action return values directly. Read and list commands wrap
read action results as `{ event }` and `{ events }`.

JSON command outputs:

| Command         | JSON Output                |
| --------------- | -------------------------- |
| `events create` | `{"event":<event>}`        |
| `events list`   | `{"events":[<event>,...]}` |
| `events recent` | `{"events":[<event>,...]}` |
| `events get`    | `{"event":<event>}`        |

Each JSON output is one JSON object plus a trailing newline.

Text output:

| Command         | Text Output          |
| --------------- | -------------------- |
| `events create` | `Created event <id>` |
| `events list`   | event lines          |
| `events recent` | event lines          |
| `events get`    | one event line       |

`events get`, `events list`, and `events recent` use the same event-line
formatter. Multiple event lines are joined with `\n`, and the final CLI result
appends a trailing newline when at least one line exists.

Event lines use:

```text
<id>\t<target-kind>/<target-id>\t<actor-kind>/<actor-id>\t<summary>
```

Text list output for an empty list is an empty string.

Text outputs include a trailing newline when they contain at least one line.

Text fields are emitted raw. If an event summary contains tabs or newlines,
text output may contain extra physical columns or lines. This is acceptable for
this ADR because text output is for quick terminal inspection. Local agents
that need robust parsing should use `--json`.

## Database Lifecycle

Event CLI commands open the app database:

```ts
const database = openAppDatabase({
  databasePath: invocation.databasePath,
  environment: invocation.environment,
});
```

They create an action context with `createAppActionContext({ database })`, run
one event app action, and close the database in a `finally` block.

After command-local parsing succeeds and the database is opened, the database
must close in `finally` for action success, not-found errors, and
action/repository validation errors.

`doctor` remains non-mutating and does not open the database.

## Tests

Add action tests covering:

- creating an event through the app action
- getting an existing and missing event
- listing events for a target
- listing recent events
- no additional events or notifications are emitted by event actions

Add CLI tests covering:

- create, list, recent, and get event commands
- JSON output for create
- JSON output wraps list and recent results as `{ events: [...] }`
- text event line formatting
- not-found errors for `events get`
- command-local syntax validation before opening the database
- missing required flag validation before opening the database
- missing flag value validation before opening the database
- unknown flag validation before opening the database
- extra positional validation before opening the database
- invalid target kind validation before opening the database
- invalid actor kind validation before opening the database
- invalid limit validation before opening the database
- duplicate scalar flags using the last value

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not add event kinds, workflow statuses, scheduler behavior, runtime
sessions, provider threads, target existence checks, notification delivery,
comments, reviews, measurements, artifacts, or reports.

Do not automatically create events from comments, notifications, reviews,
experiments, or reports in this ADR. Product actions that need timeline entries
should compose that behavior explicitly in their own feature ADRs.

Do not make event creation imply that target work was performed. Events are
timeline evidence; target records and specialized primitives still carry their
own state.

## Consequences

Local agent harnesses can inspect the visible timeline without relying on
private terminal context:

```text
list recent events
  -> inspect a target timeline
  -> append a correction or note when the timeline itself needs one
```

This keeps activity visible and append-only without turning events into a
workflow engine.
