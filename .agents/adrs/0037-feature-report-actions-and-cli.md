---
status: active
category: feature
created: 2026-05-13
---

# 0037. Feature: Report Actions and CLI

## Context

Reports are the durable written-output primitive from ADR 0024. They preserve
generated summaries, final findings, handoff notes, and other longer-form
Markdown outputs derived from visible product records.

The primitive package already stores report records. The app still needs a
small action surface and CLI commands so local agents and humans can record,
inspect, and list reports through ordinary Situ commands.

Reports are records, not renderers or workflow outcomes. Creating a report
through this ADR does not generate a report from other records, render Markdown
to files, create artifacts, create comments, create events, create
notifications, collect measurements, make review decisions, move projects,
move tasks, move experiments, run commands, or decide final task completion.

The report create action only requires the parent project row to exist through
the database foreign key. It does not check that `target` exists. Reports can
target any product record kind through the shared `TargetRef` shape, including
records that are created later or represented outside the local database.

## Decision

Add report app actions and a `situ reports` CLI command group.

Expected files:

```text
projects/app/src/actions/index.ts
projects/app/src/actions/reports.test.ts
projects/app/src/actions/reports.ts
projects/app/src/cli/base.ts
projects/app/src/cli/commands/reports.ts
projects/app/src/cli/format.ts
projects/app/src/cli/situ.test.ts
```

The report record CLI commands in this ADR are thin adapters. They parse
command-local args, open the local database, call report app actions, format
results, and close the database. They do not call primitive repositories
directly.

Later report CLI ADRs may add commands that produce report-shaped output
without creating or reading `ReportRecord` rows. Those later commands should
state their own action/helper boundary explicitly.

## Action API

`projects/app/src/actions/reports.ts` exports:

```ts
export type CreateReportActionInput = CreateReportInput & {
  readonly context: AppActionContext;
};

export type CreateReportActionResult = {
  readonly report: ReportRecord;
};

export function createReportAction(input: CreateReportActionInput): CreateReportActionResult;

export type GetReportActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"report">;
};

export function getReportAction(input: GetReportActionInput): ReportRecord | undefined;

export type ListReportsForProjectActionInput = ListReportsForProjectInput & {
  readonly context: AppActionContext;
};

export function listReportsForProjectAction(
  input: ListReportsForProjectActionInput,
): readonly ReportRecord[];

export type ListReportsForTargetActionInput = ListReportsForTargetInput & {
  readonly context: AppActionContext;
};

export function listReportsForTargetAction(
  input: ListReportsForTargetActionInput,
): readonly ReportRecord[];

export type ListRecentReportsActionInput = ListRecentReportsInput & {
  readonly context: AppActionContext;
};

export function listRecentReportsAction(
  input: ListRecentReportsActionInput,
): readonly ReportRecord[];
```

The action module imports:

- `SituId` from `@situ/common`
- `CreateReportInput`, `ListRecentReportsInput`,
  `ListReportsForProjectInput`, `ListReportsForTargetInput`, and
  `ReportRecord` from `@situ/reports`
- `AppActionContext` from `./context.js`

`createReportAction` calls `context.repositories.reports.create` and returns
`{ report }`.

It forwards these fields to `reports.create`:

- `id`
- `projectId`
- `target`
- `title`
- `bodyMarkdown`
- `generatedBy`
- `now`

It does not forward `context`.

`getReportAction` calls `context.repositories.reports.getById` and returns the
repository result directly.

`listReportsForProjectAction` calls
`context.repositories.reports.listForProject` and returns the repository result
directly.

`listReportsForTargetAction` calls
`context.repositories.reports.listForTarget` and returns the repository result
directly.

`listRecentReportsAction` calls `context.repositories.reports.listRecent` and
returns the repository result directly.

These actions do not emit events or create notifications. A report record is
already visible written output. Future composite actions may collect records,
create reports, create artifacts, emit events, notify actors, or move target
records together when the product action itself needs those effects.

`projects/app/src/actions/index.ts` exports the report actions from
`./reports.js`.

## CLI Commands

The CLI supports these commands:

```text
situ reports create [flags]
situ reports list [flags]
situ reports recent [flags]
situ reports get <report-id>
```

Global options still appear before the command group:

```text
situ --json --db /tmp/situ.db reports list --project-id project_123
```

`projects/app/src/cli/commands/reports.ts` exports exactly:

```ts
export function runReportsCommand(input: { readonly invocation: SituCliInvocation }): SituCliResult;
```

`base.ts` dispatches the `reports` command group to
`runReportsCommand({ invocation })`.

The root help text includes:

```text
  reports  Manage report records.
```

## CLI Flags

### `reports create`

Flags:

```text
--id <report-id>
--project-id <project-id>
--target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
--target-id <target-id>
--title <title>
--body <markdown>
--generated-by-kind <human|local_agent|system>
--generated-by-id <id>
--generated-by-display-name <name>
--now <iso-timestamp>
```

Required flags:

- `--project-id`
- `--target-kind`
- `--target-id`
- `--title`
- `--body`
- `--generated-by-kind`
- `--generated-by-id`

Optional flags:

- `--id`
- `--generated-by-display-name`
- `--now`

Action call:

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

`--body` maps to `bodyMarkdown`.

`--generated-by-*` flags map to `generatedBy`.

### `reports list`

Flags:

```text
--project-id <project-id>
--target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
--target-id <target-id>
```

The list command supports exactly one selector:

- project selector: `--project-id`
- target selector: `--target-kind` and `--target-id`

The target selector is intentionally global across reports. `TargetRef` values
already carry a product kind and id, and Situ ids are expected to be stable
record identifiers. Use the project selector when the caller wants a
project-scoped report list instead.

`--project-id` must not be combined with either target flag.

`--target-kind` and `--target-id` must be provided together.

When no selector is provided, fail before opening the database with message
`Command reports list requires --project-id or target flags.`

When `--project-id` is combined with target flags, fail before opening the
database with message
`Command reports list cannot combine --project-id with target flags.`

When exactly one target flag is provided, fail before opening the database with
message `Report target flags require both --target-kind and --target-id.`

Project action call:

```ts
listReportsForProjectAction({
  context,
  projectId,
});
```

Target action call:

```ts
listReportsForTargetAction({
  context,
  target,
});
```

### `reports recent`

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
listRecentReportsAction({
  context,
  limit,
});
```

### `reports get <report-id>`

No flags are supported.

Action call:

```ts
getReportAction({
  context,
  id,
});
```

When the action returns `undefined`, throw `NotFoundError` with message
`Report was not found.` and details `{ id }`.

## Parser Contract

Command-specific syntax validation must complete before opening the database.
This includes:

- unknown report subcommands
- missing subcommands
- missing required positional args
- extra positional args
- missing required flags
- unknown flags
- missing flag values
- invalid generated-by actor kinds
- invalid target kinds
- invalid list selector combinations
- invalid positive integer limits

Command-local help follows ADR 0092. For example,
`situ reports --help` and `situ reports create --help` print usage without
opening the database.

Duplicate scalar flags are allowed; the last value wins.

Command-local flags and positionals may be interleaved. For example,
`situ reports get --unused report_1` fails because `--unused` is an unknown
flag, while `situ reports get report_1 extra` fails because there is an extra
positional argument.

Command-local tokens are scanned left-to-right before higher-level validation.
Tokens beginning with `--` are treated as command-local flags regardless of
position. A supported value flag consumes the next token as its value when that
token exists and does not start with `--`.

A supported value flag followed by any token beginning with `--` reports
`Missing value for <flag>.` before evaluating the following token. For example,
`situ reports create --body --bogus` reports `Missing value for --body.`, and
`situ reports recent --limit --bad` reports `Missing value for --limit.`.

A supported value flag may consume a single-dash token as its value. For
example, `situ reports create --title -x ...` passes `-x` as the title value
rather than treating `-x` as a short flag.

The parser does not support boolean flags, short flags, equals syntax, or a
`--` sentinel for report commands.

The CLI does not trim string flag values, validate id prefixes, validate target
id prefixes, or validate ISO timestamps. Action and repository helpers own
timestamp validation and string-field normalization after the database is
opened. This includes blank or whitespace-only values for `--title`, `--body`,
`--generated-by-id`, and `--generated-by-display-name`.

Parser errors use `ValidationError` through the CLI parser error helper, with
the existing command-local message style:

- missing subcommand: `Command reports requires a subcommand.`
- unknown subcommand: `Unknown reports subcommand: <subcommand>.`
- missing required positional arg: `Command <command> requires <<name>>.`
- missing required flag: `Missing required flag <flag>.`
- unknown flag: `Unknown flag for <command>: <flag>.`
- missing flag value: `Missing value for <flag>.`
- extra positional args:
  `Command <command> received extra positional arguments: <args>`
- invalid generated-by actor kind: `Invalid actor kind for <flag>: <value>.`
- invalid target kind: `Invalid target kind: <value>.`
- invalid list selector missing:
  `Command reports list requires --project-id or target flags.`
- invalid list selector combined:
  `Command reports list cannot combine --project-id with target flags.`
- invalid target selector partial:
  `Report target flags require both --target-kind and --target-id.`
- invalid limit: `Expected a positive integer limit.`

In parser error messages, `<command>` is the literal command path, for example
`reports create`, `reports list`, `reports recent`, or `reports get`.

Required flag validation is deterministic and follows the order documented in
each command's Required flags list. Required presence checks happen before
semantic parsing of enum-like values such as `target-kind` and
`generated-by-kind`. For example, a `reports create` command with invalid
`--target-kind` and missing `--generated-by-id` reports the missing
`--generated-by-id` first.

## Numeric Parsing

Limits use decimal digit strings only:

- accepted examples: `1`, `01`, `50`
- rejected examples: `0`, `-1`, `+1`, `1.5`, `1e2`, `abc`

After the decimal digit string is converted to a number, it must be a safe
integer greater than zero. Non-safe integers are rejected. The CLI does not trim
the limit before validation.

The CLI passes accepted limits as JavaScript numbers to app actions.

## Output Shape

JSON command outputs use `JSON.stringify` on the object shown below. Write
commands serialize action return values directly. Read and list commands wrap
read action results as `{ report }` and `{ reports }`.

JSON command outputs:

| Command          | JSON Output                  |
| ---------------- | ---------------------------- |
| `reports create` | `{"report":<report>}`        |
| `reports list`   | `{"reports":[<report>,...]}` |
| `reports recent` | `{"reports":[<report>,...]}` |
| `reports get`    | `{"report":<report>}`        |

Each JSON output is one JSON object plus a trailing newline.

Text output:

| Command          | Text Output           |
| ---------------- | --------------------- |
| `reports create` | `Created report <id>` |
| `reports list`   | report lines          |
| `reports recent` | report lines          |
| `reports get`    | one report line       |

Report lines use:

```text
<id>\t<project-id>\t<target-kind>/<target-id>\t<title>\t<generated-by-kind>/<generated-by-id>\t<body>
```

`<body>` is `bodyMarkdown`.

Text list output for an empty list is an empty string.

Text outputs include a trailing newline when they contain at least one line.

Text fields are emitted raw. Local agents that need robust parsing should use
`--json`.

Because `<body>` is emitted raw, multiline Markdown bodies make text output span
multiple physical lines. Text output is for quick human inspection. Local agents
and scripts that need one-record-per-value parsing must use `--json`.

## Database Lifecycle

Report CLI commands open the app database:

```ts
const database = openAppDatabase({
  databasePath: invocation.databasePath,
  environment: invocation.environment,
});
```

They create an action context with `createAppActionContext({ database })`, run
one report app action, and close the database in a `finally` block.

After command-local parsing succeeds and the database is opened, the database
must close in `finally` for action success, not-found errors,
action/repository validation errors, and repository conflict errors.

`doctor` remains non-mutating and does not open the database.

## Tests

Add action tests covering:

- creating a report through the app action without emitting events or
  notifications, without creating comments, and without changing the parent
  project
- creating a report through the app action for a missing target record while the
  parent project exists
- getting an existing and missing report without emitting events or
  notifications or creating comments
- listing reports for a project
- listing reports for a target
- listing recent reports
- repository errors propagate from the app action

Add CLI tests covering:

- create, list, recent, and get report commands
- JSON output for create
- JSON output for get wraps the record as `{ report }`
- JSON output wraps list and recent results as `{ reports: [...] }`
- text report line formatting
- list by project selector
- list by target selector
- successful `reports create` with an existing project and a missing target
  record
- empty list output
- not-found errors for `reports get`
- database lifecycle after success by running another command against the same
  database after successful report creation
- database lifecycle after not-found by running another command against the same
  database after a missing `reports get`
- command-local syntax validation before opening the database
- missing required flag validation before opening the database
- missing flag value validation before opening the database
- unknown flag validation before opening the database
- extra positional validation before opening the database
- invalid generated-by actor kind validation before opening the database
- invalid target kind validation before opening the database
- list selector missing, combined, and partial validation before opening the
  database
- invalid limit validation before opening the database
- accepted limit examples including `1` and `01`
- safe-integer limit rejection before opening the database
- duplicate scalar flags using the last value
- representative unsupported syntax errors for short flags, equals syntax, and
  `--` sentinel
- value-token edge cases for `--body --bogus`, `--title -x`, and
  `--limit --bad`
- required-presence validation before semantic target/generated-by validation
- after-open repository validation for at least one non-parser field such as
  blank `--body`, while still closing the database
- after-open repository conflict for a missing parent project, while still
  closing the database

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not add report generation orchestration, record collection, Markdown
rendering, PDF generation, artifact file writing, command execution,
project/task/experiment movement, review decisions, measurements, comments,
notifications, events, target existence checks beyond the project foreign key,
scheduler behavior, agent runtime behavior, workers, leases, runtime sessions,
provider threads, or workflow enforcement in this ADR's implementation.

Do not automatically create events when reports are created in this ADR. Use
direct event commands or a future composite feature action when a product
workflow needs timeline entries around a report.

Do not treat a report as proof that the app accepted findings, completed a
task, approved an experiment, or wrote an external file. Report records
preserve written output; target records and artifacts preserve their own state.

## Consequences

Local agents can record and inspect written outputs through the CLI:

```text
create report
  -> list reports attached to a project or target
  -> inspect the Markdown body
  -> use comments, reviews, artifacts, measurements, or events for surrounding context
```

The app can now preserve report records without making reports a workflow
runner, renderer, or file manager.
