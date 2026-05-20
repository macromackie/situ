---
status: active
category: feature
created: 2026-05-13
---

# 0028. Feature: Project and Task CLI Commands

## Context

Situ's CLI base can parse global options and report errors. The next useful
surface is a small set of commands that local agents and humans can use to
create projects, create tasks, claim or assign tasks, move visible statuses,
and inspect current work.

These commands should be thin adapters. Product behavior belongs in app
actions and primitive repositories; the CLI should parse arguments, open the
local database, call actions, and format results.

## Decision

Add project and task record commands to `projects/app/src/cli/`.

The CLI command implementation should use:

- `openAppDatabase` from `../db/index.js`
- `createAppActionContext`, project actions, and task actions from
  `../actions/index.js`
- `NotFoundError` and `ValidationError` from `@situ/errors`
- `ActorRef`, `SituId`, and `IsoTimestamp` from `@situ/common`

Do not call primitive repositories directly from project/task CLI commands.
Use app actions.

## Command Groups

The CLI supports these command groups:

```text
situ projects create [flags]
situ projects list [flags]
situ projects get <project-id>
situ projects archive <project-id> [flags]
situ tasks create [flags]
situ tasks list [flags]
situ tasks get <task-id>
situ tasks move <task-id> [flags]
situ tasks assign <task-id> [flags]
```

Global options from ADR 0026 still appear before the command group:

```text
situ --json --db /tmp/situ.db projects list
```

Command-specific flags appear after the command group and subcommand. They are
not global options.

## Parser Contract

Command-specific syntax validation must complete before opening the database.
This includes:

- unknown command groups
- unknown subcommands
- missing subcommands
- missing required positional args
- extra positional args
- unknown command flags
- missing flag values
- invalid actor kinds
- invalid statuses
- invalid assignment flag combinations

Command-local help follows ADR 0092. For example,
`situ projects create --help` prints usage without opening the database.

Extra positional args are validation errors. Examples:

- `situ projects get project_1 extra`
- `situ projects create extra --name A ...`
- `situ tasks move task_1 extra --status done ...`

Top-level unknown command groups still use the CLI base unknown-command
behavior and include root help in text mode.

All project/task command handlers call exactly one app action. They do not call
primitive repositories directly.

## Help Text

The root help text becomes exactly:

```text
Usage: situ [global-options] <command>

Global options:
  --json             Print machine-readable JSON output for data commands.
  --db <path>        Use a specific SQLite database path.
  --database <path>  Use a specific SQLite database path.
  --help             Show this help text.
  --version          Print the Situ CLI version.

Commands:
  help      Show this help text.
  version   Print the Situ CLI version.
  doctor    Check local CLI configuration without mutating state.
  projects  Manage project records.
  tasks     Manage task records.
```

The emitted help output appends one trailing newline to this text.

Group-specific help is not added in this ADR. `situ projects`, `situ tasks`,
unknown subcommands, missing required flags, and malformed flags should return
validation errors.

## Output Shape

JSON output is the primary integration surface for local agent tools.

JSON command outputs serialize action return values directly with
`JSON.stringify`. Do not create a separate DTO mapping in this ADR.

JSON command outputs:

| Command            | JSON Output                                              |
| ------------------ | -------------------------------------------------------- |
| `projects create`  | `{"project":<project>,"event":<event>}`                  |
| `projects list`    | `{"projects":[<project>,...]}`                           |
| `projects get`     | `{"project":<project>}`                                  |
| `projects archive` | `{"project":<project>,"event":<event>}`                  |
| `tasks create`     | `{"task":<task>,"event":<event>}` or with `notification` |
| `tasks list`       | `{"tasks":[<task>,...]}`                                 |
| `tasks get`        | `{"task":<task>}`                                        |
| `tasks move`       | `{"task":<task>,"event":<event>}`                        |
| `tasks assign`     | `{"task":<task>,"event":<event>}` or with `notification` |

Each JSON output is one JSON object plus a trailing newline.

Task CLI JSON serializes action results directly. When `tasks create` or
`tasks assign` creates an assignment notification, JSON output includes
`{"task":<task>,"event":<event>,"notification":<notification>}`. When no
notification is created, including unassigned task creation and assignment
clearing, JSON output omits the `notification` key.

Text output is concise and human-readable:

| Command            | Text Output                                       |
| ------------------ | ------------------------------------------------- |
| `projects create`  | `Created project <id> (event <event-id>)`         |
| `projects list`    | one line per project: `<id>\t<status>\t<name>`    |
| `projects get`     | one project line: `<id>\t<status>\t<name>`        |
| `projects archive` | `Archived project <id> (event <event-id>)`        |
| `tasks create`     | `Created task <id> (event <event-id>)`            |
| `tasks list`       | one line per task: `<id>\t<status>\t<title>`      |
| `tasks get`        | one task line: `<id>\t<status>\t<title>`          |
| `tasks move`       | `Moved task <id> to <status> (event <event-id>)`  |
| `tasks assign`     | `Updated task <id> assignment (event <event-id>)` |

Text list output for an empty list is an empty string.

Task CLI text output does not mention notification ids.

Text outputs include a trailing newline when they contain at least one line.

Text table fields are emitted raw. If names or titles contain tabs or newlines,
text output may be awkward; local agents that need robust parsing should use
`--json`.

List ordering is whatever the app action returns. The CLI must not reorder
project or task lists.

## Database Lifecycle

Project and task record commands open the app database:

```ts
const database = openAppDatabase({
  databasePath: invocation.databasePath,
  environment: invocation.environment,
});
```

They create an action context with `createAppActionContext({ database })`, run
one app action, and close the database in a `finally` block.

`doctor` remains non-mutating and does not open the database.

## Shared Flag Rules

Command-specific flags use `--name value` form. Boolean flags use only the flag
name.

Unknown flags are validation errors.

A flag that requires a value is a validation error when the next token is
missing or starts with `--`.

Duplicate scalar flags are allowed; the last value wins.

The command-specific parser does not support short flags, equals syntax, or a
`--` sentinel.

The CLI does not trim flag values itself. Action and repository validation own
normalization.

This rule intentionally makes values beginning with `--` impossible for flags
that require values in this ADR, including Markdown fields. Use JSON or future
file-input flags if that becomes too restrictive.

## Value Conversion

The CLI converts string flags into branded TypeScript boundary types with
casts:

```ts
const projectId = value as SituId<"project">;
const taskId = value as SituId<"task">;
const eventId = value as SituId<"event">;
const now = value as IsoTimestamp;
```

The CLI does not runtime-validate id prefixes or ISO timestamps in this ADR.
Actions and repository helpers own timestamp validation where they accept
`now`.

Empty string values are outside normal shell usage but are allowed through by
the CLI parser when present. Action and repository validation own non-empty
checks.

## Actor Flags

Write commands that need a visible actor use:

```text
--actor-kind <human|local_agent|system>
--actor-id <id>
--actor-display-name <name>
```

`--actor-kind` and `--actor-id` are required when actor flags are required.
`--actor-display-name` is optional.

Actor flag parsing creates:

```ts
const actor: ActorRef = {
  actorKind,
  actorId,
  displayName,
};
```

The CLI validates `actorKind` is one of `human`, `local_agent`, or `system`.

Assignee parsing creates the same `ActorRef` shape:

```ts
const assignedTo: ActorRef = {
  actorKind: assignedToKind,
  actorId: assignedToId,
  displayName: assignedToDisplayName,
};
```

Accepted assignment flag combinations:

- create: no `--assigned-to-*` flags means no assignee
- create: `--assigned-to-kind` and `--assigned-to-id` create an assignee
- create: `--assigned-to-display-name` may appear only with both
  `--assigned-to-kind` and `--assigned-to-id`
- list: no assigned-to filter flags means no assignee filter
- list: `--assigned-to-kind` and `--assigned-to-id` create an assignee filter
- list: there is no display-name filter
- assign: `--clear` clears the assignee
- assign: without `--clear`, `--assigned-to-kind` and `--assigned-to-id`
  create the new assignee
- assign: `--assigned-to-display-name` may appear only with both
  `--assigned-to-kind` and `--assigned-to-id`
- assign: `--clear` cannot combine with any `--assigned-to-*` flag

For `tasks assign --clear`, call:

```ts
assignTaskAction({
  context,
  id,
  eventId,
  actor,
  assignedTo: undefined,
  now,
});
```

## Project Commands

### `projects create`

Flags:

```text
--id <project-id>
--event-id <event-id>
--name <name>
--repository-path <absolute-path>
--goal <markdown>
--actor-kind <human|local_agent|system>
--actor-id <id>
--actor-display-name <name>
--now <iso-timestamp>
```

Required flags:

- `--name`
- `--repository-path`
- `--goal`
- `--actor-kind`
- `--actor-id`

Action call:

```ts
createProjectAction({
  context,
  id,
  eventId,
  name,
  repositoryPath,
  goalMarkdown: goal,
  createdBy: actor,
  now,
});
```

### `projects list`

Flags:

```text
--status <active|archived>
```

No flags are required.

Action call:

```ts
listProjectsAction({
  context,
  status,
});
```

### `projects get <project-id>`

No flags are supported.

Action call:

```ts
getProjectAction({
  context,
  id,
});
```

When the action returns `undefined`, throw `NotFoundError` with message
`Project was not found.` and details `{ id }`.

### `projects archive <project-id>`

Flags:

```text
--event-id <event-id>
--actor-kind <human|local_agent|system>
--actor-id <id>
--actor-display-name <name>
--now <iso-timestamp>
```

Required flags:

- `--actor-kind`
- `--actor-id`

Action call:

```ts
archiveProjectAction({
  context,
  id,
  eventId,
  actor,
  now,
});
```

Missing projects during archive propagate from the action layer. The CLI does
not add a separate existence check.

## Task Commands

### `tasks create`

Flags:

```text
--id <task-id>
--event-id <event-id>
--project-id <project-id>
--title <title>
--body <markdown>
--status <triage|backlog|in_progress|in_review|done|canceled>
--actor-kind <human|local_agent|system>
--actor-id <id>
--actor-display-name <name>
--assigned-to-kind <human|local_agent|system>
--assigned-to-id <id>
--assigned-to-display-name <name>
--now <iso-timestamp>
```

Required flags:

- `--project-id`
- `--title`
- `--body`
- `--actor-kind`
- `--actor-id`

`--status` is optional. When absent, action/repository defaults apply.

Assignee flags are optional, but when any `--assigned-to-*` flag is present,
both `--assigned-to-kind` and `--assigned-to-id` are required. The CLI validates
`assigned-to-kind` with the same actor-kind rule.

Action call:

```ts
createTaskAction({
  context,
  id,
  eventId,
  projectId,
  title,
  bodyMarkdown: body,
  status,
  createdBy: actor,
  assignedTo,
  now,
});
```

### `tasks list`

Flags:

```text
--project-id <project-id>
--status <triage|backlog|in_progress|in_review|done|canceled>
--assigned-to-kind <human|local_agent|system>
--assigned-to-id <id>
```

No flags are required.

When either assigned-to filter flag is present, both are required.

Action call:

```ts
listTasksAction({
  context,
  projectId,
  status,
  assignedTo,
});
```

### `tasks get <task-id>`

No flags are supported.

Action call:

```ts
getTaskAction({
  context,
  id,
});
```

When the action returns `undefined`, throw `NotFoundError` with message
`Task was not found.` and details `{ id }`.

### `tasks move <task-id>`

Flags:

```text
--event-id <event-id>
--status <triage|backlog|in_progress|in_review|done|canceled>
--actor-kind <human|local_agent|system>
--actor-id <id>
--actor-display-name <name>
--now <iso-timestamp>
```

Required flags:

- `--status`
- `--actor-kind`
- `--actor-id`

Action call:

```ts
moveTaskAction({
  context,
  id,
  eventId,
  status,
  actor,
  now,
});
```

### `tasks assign <task-id>`

Flags:

```text
--event-id <event-id>
--actor-kind <human|local_agent|system>
--actor-id <id>
--actor-display-name <name>
--assigned-to-kind <human|local_agent|system>
--assigned-to-id <id>
--assigned-to-display-name <name>
--clear
--now <iso-timestamp>
```

Required flags:

- `--actor-kind`
- `--actor-id`

Assignment behavior:

- `--clear` clears the assignee.
- Without `--clear`, both `--assigned-to-kind` and `--assigned-to-id` are
  required.
- `--clear` cannot be combined with any `--assigned-to-*` flag.

Action call:

```ts
assignTaskAction({
  context,
  id,
  eventId,
  actor,
  assignedTo,
  now,
});
```

For `--clear`, omit `assignedTo` from the action input or pass `undefined`.

Missing tasks during move or assign propagate from the action layer. The CLI
does not add a separate existence check.

## Status Validation

The CLI validates project statuses:

```text
active
archived
```

The CLI validates task statuses:

```text
triage
backlog
in_progress
in_review
done
canceled
```

Invalid statuses are `ValidationError`s before opening the database.

The CLI accepts only the listed literals and passes them unchanged to actions.

## Error Behavior

Record command errors use the CLI base error formatting from ADR 0026.

Parsing and flag validation errors throw `ValidationError`.

Missing records in `get` commands throw `NotFoundError`.

Action, repository, and database errors propagate to the CLI base formatter.

Database connections must be closed even when an action throws.

## Boundaries

Do not add comments, events, notification commands or notification behavior
beyond task assignment notification result surfaces, experiments,
measurements, artifacts, reviews, reports, HTTP handlers, scheduler behavior,
agent runtime behavior, or workflow enforcement in this ADR's implementation.

Do not add a CLI framework dependency.

Do not add hidden defaults for actor identity. Actor identity is visible
product attribution and must come from command flags for write commands.

Do not infer repository path from the process current working directory in this
ADR. `projects create` requires `--repository-path`.

## Consequences

Local agents can start using Situ records through ordinary shell commands.
Later ADRs can add comments, experiment, review, notification, and report
commands using the same parser, database lifecycle, action-context, and output
patterns.
