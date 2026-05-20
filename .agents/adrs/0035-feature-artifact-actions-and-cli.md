---
status: active
category: feature
created: 2026-05-13
---

# 0035. Feature: Artifact Actions and CLI

## Context

Artifacts are the append-only evidence-reference primitive from ADR 0022.
They point at logs, files, screenshots, reports, diffs, archives, URLs, or
other durable references that are too large or too file-like to live directly
inside comments, measurements, reviews, reports, or events.

The primitive package already stores artifact records. The app still needs a
small action surface and CLI commands so local agents and humans can record,
inspect, and list artifact references through ordinary Situ commands.

Artifacts are records, not file managers. Creating an artifact through this ADR
does not copy files, read files, write files, hash content, upload content,
open paths, check path existence, or enforce filesystem allowlists.

## Decision

Add artifact app actions and a `situ artifacts` CLI command group.

Expected files:

```text
projects/app/src/actions/artifacts.ts
projects/app/src/actions/artifacts.test.ts
projects/app/src/actions/index.ts
projects/app/src/cli/base.ts
projects/app/src/cli/commands/artifacts.ts
projects/app/src/cli/flags.ts
projects/app/src/cli/format.ts
projects/app/src/cli/situ.test.ts
```

Artifact CLI commands are thin adapters. They parse command-local args, open
the local database, call artifact app actions, format results, and close the
database. They do not call primitive repositories directly.

## Action API

`projects/app/src/actions/artifacts.ts` exports:

```ts
export type CreateArtifactActionInput = CreateArtifactInput & {
  readonly context: AppActionContext;
};

export type CreateArtifactActionResult = {
  readonly artifact: ArtifactRecord;
};

export function createArtifactAction(input: CreateArtifactActionInput): CreateArtifactActionResult;

export type GetArtifactActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"artifact">;
};

export function getArtifactAction(input: GetArtifactActionInput): ArtifactRecord | undefined;

export type ListArtifactsActionInput = ListArtifactsForTargetInput & {
  readonly context: AppActionContext;
};

export function listArtifactsAction(input: ListArtifactsActionInput): readonly ArtifactRecord[];

export type ListRecentArtifactsActionInput = ListRecentArtifactsInput & {
  readonly context: AppActionContext;
};

export function listRecentArtifactsAction(
  input: ListRecentArtifactsActionInput,
): readonly ArtifactRecord[];
```

The action module imports:

- `SituId` from `@situ/common`
- `ArtifactRecord`, `CreateArtifactInput`, `ListArtifactsForTargetInput`, and
  `ListRecentArtifactsInput` from `@situ/artifacts`
- `AppActionContext` from `./context.js`

`createArtifactAction` calls `context.repositories.artifacts.create` and
returns `{ artifact }`.

It forwards these fields to `artifacts.create`:

- `id`
- `target`
- `title`
- `summaryMarkdown`
- `uri`
- `mediaType`
- `byteSize`
- `sha256`
- `createdBy`
- `now`

It does not forward `context`.

`getArtifactAction` calls `context.repositories.artifacts.getById` and returns
the repository result directly.

`listArtifactsAction` calls `context.repositories.artifacts.listForTarget` and
returns the repository result directly.

`listRecentArtifactsAction` calls
`context.repositories.artifacts.listRecent` and returns the repository result
directly.

These actions do not emit events or create notifications. An artifact record is
already visible evidence. Future composite actions may create artifacts,
measurements, events, reviews, notifications, or reports together when the
product action itself needs those effects.

`projects/app/src/actions/index.ts` exports the artifact actions from
`./artifacts.js`.

## CLI Commands

The CLI supports these commands:

```text
situ artifacts create [flags]
situ artifacts list [flags]
situ artifacts recent [flags]
situ artifacts get <artifact-id>
```

Global options still appear before the command group:

```text
situ --json --db /tmp/situ.db artifacts list --target-kind experiment --target-id experiment_123
```

`projects/app/src/cli/commands/artifacts.ts` exports exactly:

```ts
export function runArtifactsCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult;
```

`base.ts` dispatches the `artifacts` command group to
`runArtifactsCommand({ invocation })`.

The root help text includes:

```text
  artifacts  Manage artifact records.
```

## CLI Flags

### `artifacts create`

Flags:

```text
--id <artifact-id>
--target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
--target-id <target-id>
--title <title>
--summary <markdown>
--uri <uri>
--media-type <media-type>
--byte-size <non-negative-safe-integer>
--sha256 <sha256>
--actor-kind <human|local_agent|system>
--actor-id <id>
--actor-display-name <name>
--now <iso-timestamp>
```

Required flags:

- `--target-kind`
- `--target-id`
- `--title`
- `--summary`
- `--uri`
- `--actor-kind`
- `--actor-id`

Optional flags:

- `--id`
- `--media-type`
- `--byte-size`
- `--sha256`
- `--actor-display-name`
- `--now`

Action call:

```ts
createArtifactAction({
  context,
  id,
  target,
  title,
  summaryMarkdown,
  uri,
  mediaType,
  byteSize,
  sha256,
  createdBy: actor,
  now,
});
```

`--summary` maps to `summaryMarkdown`.

`--media-type` maps to `mediaType`.

`--byte-size` maps to `byteSize`.

`--sha256` maps to `sha256`. The CLI passes the raw string through; artifact
helpers validate the lowercase 64-character hex digest after the database is
opened.

`--actor-*` flags map to `createdBy`.

### `artifacts list`

Flags:

```text
--target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
--target-id <target-id>
```

Required flags:

- `--target-kind`
- `--target-id`

Action call:

```ts
listArtifactsAction({
  context,
  target,
});
```

### `artifacts recent`

Flags:

```text
--limit <positive-integer>
```

Optional flags:

- `--limit`

`--limit` is parsed as a positive integer before opening the database. Missing
limits are passed as `undefined`, so the primitive repository owns the default
and cap.

Action call:

```ts
listRecentArtifactsAction({
  context,
  limit,
});
```

### `artifacts get <artifact-id>`

No flags are supported.

Action call:

```ts
getArtifactAction({
  context,
  id,
});
```

When the action returns `undefined`, throw `NotFoundError` with message
`Artifact was not found.` and details `{ id }`.

## Parser Contract

Command-specific syntax validation must complete before opening the database.
This includes:

- unknown artifact subcommands
- missing subcommands
- missing required positional args
- extra positional args
- missing required flags
- unknown flags
- missing flag values
- invalid actor kinds
- invalid target kinds
- invalid positive integer limits
- invalid non-negative safe integer byte sizes

Command-local help follows ADR 0092. For example,
`situ artifacts create --help` prints usage without opening the database.

Duplicate scalar flags are allowed; the last value wins.

Command-local flags and positionals may be interleaved. For example,
`situ artifacts get --unused artifact_1` fails because `--unused` is an
unknown flag, while `situ artifacts get artifact_1 extra` fails because there
is an extra positional argument.

Command-local tokens are scanned left-to-right before higher-level validation.
Tokens beginning with `--` are treated as command-local flags regardless of
position. A supported value flag consumes the next token as its value when that
token exists and does not start with `--`.

A supported value flag followed by any token beginning with `--` reports
`Missing value for <flag>.` before evaluating the following token. For example,
`situ artifacts create --title --foo` reports `Missing value for --title.`, and
`situ artifacts create --uri --` reports `Missing value for --uri.`.

A supported value flag may consume a single-dash token as its value. For
example, `situ artifacts create --title -x ...` passes `-x` as the title value
rather than treating `-x` as a short flag.

The parser does not support boolean flags, short flags, equals syntax, or a
`--` sentinel for artifact commands.

The CLI does not trim string flag values, validate id prefixes, validate SHA
format, validate URI shape, or validate ISO timestamps. Action and repository
helpers own timestamp validation and string-field normalization after the
database is opened. This includes blank or whitespace-only values for `--title`,
`--summary`, `--uri`, `--media-type`, `--sha256`, `--actor-id`, and
`--actor-display-name`.

Parser errors use `ValidationError` through the CLI parser error helper, with
the existing command-local message style:

- missing subcommand: `Command artifacts requires a subcommand.`
- unknown subcommand: `Unknown artifacts subcommand: <subcommand>.`
- missing required positional arg: `Command <command> requires <<name>>.`
- missing required flag: `Missing required flag <flag>.`
- unknown flag: `Unknown flag for <command>: <flag>.`
- missing flag value: `Missing value for <flag>.`
- extra positional args:
  `Command <command> received extra positional arguments: <args>`
- invalid actor kind: `Invalid actor kind for <flag>: <value>.`
- invalid target kind: `Invalid target kind: <value>.`
- invalid limit: `Expected a positive integer limit.`
- invalid byte size: `Expected a non-negative safe integer byte size.`

In parser error messages, `<command>` is the literal command path, for example
`artifacts create`, `artifacts list`, `artifacts recent`, or `artifacts get`.

Required flag validation is deterministic and follows the order documented in
each command's Required flags list. Required presence checks happen before
semantic parsing of enum-like values such as `target-kind` and `actor-kind`.
For example, an `artifacts create` command with invalid `--target-kind` and a
missing `--actor-id` reports the missing `--actor-id` first.

## Numeric Parsing

Byte sizes use decimal digit strings only:

- accepted examples: `0`, `1`, `01`, `50`
- rejected examples: `-1`, `+1`, `1.5`, `1e2`, `abc`

After the decimal digit string is converted to a number, it must be a safe
integer greater than or equal to zero. Non-safe integers are rejected. The CLI
does not trim the byte size before validation.

Limits use the same positive integer parsing rule as recent events,
notifications, measurements, reports, reviews, and artifacts:

- accepted examples: `1`, `01`, `50`
- rejected examples: `0`, `-1`, `+1`, `1.5`, `1e2`, `abc`

The CLI passes accepted byte sizes and limits as JavaScript numbers to app
actions.

## Output Shape

JSON command outputs use `JSON.stringify` on the object shown below. Write
commands serialize action return values directly. Read and list commands wrap
read action results as `{ artifact }` and `{ artifacts }`.

JSON command outputs:

| Command            | JSON Output                      |
| ------------------ | -------------------------------- |
| `artifacts create` | `{"artifact":<artifact>}`        |
| `artifacts list`   | `{"artifacts":[<artifact>,...]}` |
| `artifacts recent` | `{"artifacts":[<artifact>,...]}` |
| `artifacts get`    | `{"artifact":<artifact>}`        |

Each JSON output is one JSON object plus a trailing newline.

Text output:

| Command            | Text Output             |
| ------------------ | ----------------------- |
| `artifacts create` | `Created artifact <id>` |
| `artifacts list`   | artifact lines          |
| `artifacts recent` | artifact lines          |
| `artifacts get`    | one artifact line       |

Artifact lines use:

```text
<id>\t<target-kind>/<target-id>\t<title>\t<uri>\t<summary>
```

`<summary>` is `summaryMarkdown`.

Text list output for an empty list is an empty string.

Text outputs include a trailing newline when they contain at least one line.

Text fields are emitted raw. Local agents that need robust parsing should use
`--json`.

## Database Lifecycle

Artifact CLI commands open the app database:

```ts
const database = openAppDatabase({
  databasePath: invocation.databasePath,
  environment: invocation.environment,
});
```

They create an action context with `createAppActionContext({ database })`, run
one artifact app action, and close the database in a `finally` block.

After command-local parsing succeeds and the database is opened, the database
must close in `finally` for action success, not-found errors, and
action/repository validation errors.

`doctor` remains non-mutating and does not open the database.

## Tests

Add action tests covering:

- creating an artifact through the app action without emitting events or
  notifications
- getting an existing and missing artifact without emitting events or
  notifications
- listing artifacts for a target
- listing recent artifacts
- repository errors propagate from the app action

Add CLI tests covering:

- create, list, recent, and get artifact commands
- JSON output for create
- JSON output for get wraps the record as `{ artifact }`
- JSON output wraps list and recent results as `{ artifacts: [...] }`
- text artifact line formatting
- not-found errors for `artifacts get`
- command-local syntax validation before opening the database
- missing required flag validation before opening the database
- missing flag value validation before opening the database
- unknown flag validation before opening the database
- extra positional validation before opening the database
- invalid actor kind validation before opening the database
- invalid target kind validation before opening the database
- invalid limit validation before opening the database
- invalid byte size validation before opening the database
- accepted byte size examples including `0` and `01`
- safe-integer byte size rejection before opening the database
- duplicate scalar flags using the last value
- representative unsupported syntax errors for short flags, equals syntax, and
  `--` sentinel
- value-token edge cases for `--title --foo`, `--title -x`, and `--uri --`
- required-presence validation before semantic target/actor validation
- after-open repository validation for at least one non-parser field such as
  invalid `--sha256`, while still closing the database

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not add file copying, file deletion, file reading, command execution,
hashing, uploads, artifact rendering, report generation, review state,
experiment status updates, notification delivery, scheduler behavior, agent
runtime behavior, workers, leases, runtime sessions, provider threads, or
workflow enforcement in this ADR's implementation.

Do not automatically create events when artifacts are created in this ADR. Use
direct event commands or a future composite feature action when a product
workflow needs timeline entries around an artifact.

Do not add artifact statuses or file lifecycle state. Use `title`,
`summaryMarkdown`, `uri`, and optional file metadata for interpretation.

Do not store secret values in artifact fields. App actions that capture command
output or files must apply secret handling before creating artifact records.

## Consequences

Local agents can record and inspect durable evidence references through the
CLI:

```text
create artifact
  -> list artifacts attached to a target
  -> inspect the artifact URI
  -> use comments, reviews, measurements, reports, or events for surrounding context
```

The app can now preserve pointers to larger evidence without making artifact
recording a file manager or workflow runner.
