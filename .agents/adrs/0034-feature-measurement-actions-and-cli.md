---
status: active
category: feature
created: 2026-05-13
---

# 0034. Feature: Measurement Actions and CLI

## Context

Measurements are the append-only numeric evidence primitive from ADR 0021.
They record what happened when a baseline or experiment revision was evaluated:
metric name, numeric value, optional unit, summary, optional details, and
visible actor attribution.

The primitive package already stores measurement records. The app still needs
a small action surface and CLI commands so local agents and humans can record,
inspect, and compare measurements through ordinary Situ commands.

Measurements are evidence records, not runners. Creating a measurement through
this ADR does not execute commands, inspect artifacts, move experiments, create
reviews, create reports, or decide whether an experiment passed.

## Decision

Add measurement app actions and a `situ measurements` CLI command group.

Expected files:

```text
projects/app/src/actions/measurements.ts
projects/app/src/actions/measurements.test.ts
projects/app/src/actions/index.ts
projects/app/src/cli/base.ts
projects/app/src/cli/commands/measurements.ts
projects/app/src/cli/flags.ts
projects/app/src/cli/format.ts
projects/app/src/cli/situ.test.ts
```

Measurement CLI commands are thin adapters. They parse command-local args,
open the local database, call measurement app actions, format results, and
close the database. They do not call primitive repositories directly.

## Action API

`projects/app/src/actions/measurements.ts` exports:

```ts
export type CreateMeasurementActionInput = CreateMeasurementInput & {
  readonly context: AppActionContext;
};

export type CreateMeasurementActionResult = {
  readonly measurement: MeasurementRecord;
};

export function createMeasurementAction(
  input: CreateMeasurementActionInput,
): CreateMeasurementActionResult;

export type GetMeasurementActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"measurement">;
};

export function getMeasurementAction(
  input: GetMeasurementActionInput,
): MeasurementRecord | undefined;

export type ListMeasurementsActionInput = ListMeasurementsForExperimentInput & {
  readonly context: AppActionContext;
};

export function listMeasurementsAction(
  input: ListMeasurementsActionInput,
): readonly MeasurementRecord[];

export type ListBaselineMeasurementsActionInput = ListMeasurementsForBaselineInput & {
  readonly context: AppActionContext;
};

export function listBaselineMeasurementsAction(
  input: ListBaselineMeasurementsActionInput,
): readonly MeasurementRecord[];

export type ListRecentMeasurementsActionInput = ListRecentMeasurementsInput & {
  readonly context: AppActionContext;
};

export function listRecentMeasurementsAction(
  input: ListRecentMeasurementsActionInput,
): readonly MeasurementRecord[];
```

The action module imports:

- `SituId` from `@situ/common`
- `CreateMeasurementInput`, `ListMeasurementsForExperimentInput`,
  `ListMeasurementsForBaselineInput`, `ListRecentMeasurementsInput`, and
  `MeasurementRecord` from `@situ/measurements`
- `AppActionContext` from `./context.js`

`createMeasurementAction` calls `context.repositories.measurements.create` and
returns `{ measurement }`.

It forwards these fields to `measurements.create`:

- `id`
- `baselineId`
- `experimentId`
- `revisionNumber`
- `metricName`
- `numericValue`
- `unit`
- `summaryMarkdown`
- `detailsMarkdown`
- `measuredBy`
- `now`

It does not forward `context`.

`getMeasurementAction` calls `context.repositories.measurements.getById` and
returns the repository result directly.

`listMeasurementsAction` calls
`context.repositories.measurements.listForExperiment` and returns the
repository result directly.

`listBaselineMeasurementsAction` calls
`context.repositories.measurements.listForBaseline` and returns the repository
result directly.

`listRecentMeasurementsAction` calls
`context.repositories.measurements.listRecent` and returns the repository
result directly.

These actions do not emit events or create notifications. A measurement record
is already visible evidence. Future composite actions may create a measurement,
artifact, event, review, notification, or experiment movement together when
the product action itself needs those effects.

`projects/app/src/actions/index.ts` exports the measurement actions from
`./measurements.js`.

## CLI Commands

The CLI supports these commands:

```text
situ measurements create [flags]
situ measurements list [flags]
situ measurements recent [flags]
situ measurements get <measurement-id>
```

Global options still appear before the command group:

```text
situ --json --db /tmp/situ.db measurements list --experiment-id experiment_123
```

`projects/app/src/cli/commands/measurements.ts` exports exactly:

```ts
export function runMeasurementsCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult;
```

`base.ts` dispatches the `measurements` command group to
`runMeasurementsCommand({ invocation })`.

The root help text includes:

```text
  measurements  Manage measurement records.
```

## CLI Flags

### `measurements create`

Flags:

```text
--id <measurement-id>
--baseline-id <baseline-id>
--experiment-id <experiment-id>
--revision-number <positive-integer>
--metric-name <name>
--value <finite-number>
--unit <unit>
--summary <markdown>
--details <markdown>
--actor-kind <human|local_agent|system>
--actor-id <id>
--actor-display-name <name>
--now <iso-timestamp>
```

Required flags:

- exactly one target:
  - `--baseline-id`
  - `--experiment-id` plus `--revision-number`
- `--metric-name`
- `--value`
- `--summary`
- `--actor-kind`
- `--actor-id`

Optional flags:

- `--id`
- `--unit`
- `--details`
- `--actor-display-name`
- `--now`

Action call:

```ts
createMeasurementAction({
  context,
  id,
  baselineId,
  experimentId,
  revisionNumber,
  metricName,
  numericValue,
  unit,
  summaryMarkdown,
  detailsMarkdown,
  measuredBy: actor,
  now,
});
```

`--value` maps to `numericValue`.

`--summary` maps to `summaryMarkdown`.

`--details` maps to `detailsMarkdown`.

`--actor-*` flags map to `measuredBy`.

### `measurements list`

Flags:

```text
--experiment-id <experiment-id>
--revision-number <positive-integer>
--metric-name <name>
--baseline-id <baseline-id>
```

Required flags:

- exactly one of `--baseline-id` or `--experiment-id`

Optional flags:

- `--revision-number`
- `--metric-name`

Action call:

```ts
listMeasurementsAction({
  context,
  experimentId,
  revisionNumber,
  metricName,
});
```

When `--baseline-id` is present, the command calls:

```ts
listBaselineMeasurementsAction({
  context,
  baselineId,
  metricName,
});
```

`--revision-number` is only valid with `--experiment-id`.

### `measurements recent`

Flags:

```text
--limit <positive-integer>
```

Optional flags:

- `--limit`

`--limit` is parsed as a positive integer before opening the database. Missing
limits are passed as `undefined`, so the primitive repository owns the default
and cap.

### `measurements get <measurement-id>`

No flags are supported.

Action call:

```ts
getMeasurementAction({
  context,
  id,
});
```

When the action returns `undefined`, throw `NotFoundError` with message
`Measurement was not found.` and details `{ id }`.

## Parser Contract

Command-specific syntax validation must complete before opening the database.
This includes:

- unknown measurement subcommands
- missing subcommands
- missing required positional args
- extra positional args
- missing required flags
- unknown flags
- missing flag values
- invalid actor kinds
- invalid positive integer revision numbers
- invalid positive integer limits
- invalid finite numeric values
- invalid measurement target shapes

Command-local help follows ADR 0092. For example,
`situ measurements create --help` prints usage without opening the database.

Duplicate scalar flags are allowed; the last value wins.

Command-local flags and positionals may be interleaved. For example,
`situ measurements get --unused measurement_1` fails because `--unused` is an
unknown flag, while `situ measurements get measurement_1 extra` fails because
there is an extra positional argument.

The parser does not support boolean flags, short flags, equals syntax, or a
`--` sentinel for measurement commands.

The CLI does not trim string flag values, validate id prefixes, or validate ISO
timestamps. Action and repository helpers own timestamp validation and
string-field normalization after the database is opened. This includes blank or
whitespace-only values for `--metric-name`, `--summary`, `--unit`,
`--details`, `--actor-id`, and `--actor-display-name`.

Parser errors use `ValidationError` through the CLI parser error helper, with
the existing command-local message style:

- missing subcommand: `Command measurements requires a subcommand.`
- unknown subcommand: `Unknown measurements subcommand: <subcommand>.`
- missing required positional arg: `Command <command> requires <<name>>.`
- missing required flag: `Missing required flag <flag>.`
- unknown flag: `Unknown flag for <command>: <flag>.`
- missing flag value: `Missing value for <flag>.`
- extra positional args:
  `Command <command> received extra positional arguments: <args>`
- invalid actor kind: `Invalid actor kind for <flag>: <value>.`
- invalid revision number:
  `Expected a positive integer revision number.`
- invalid limit: `Expected a positive integer limit.`
- invalid numeric value: `Expected a finite numeric value.`
- missing target:
  `Command <command> requires --baseline-id or --experiment-id.`
- conflicting target:
  `Command <command> accepts a baseline target or an experiment target, not both.`
- missing experiment revision:
  `Command <command> requires --revision-number for experiment measurements.`

In parser error messages, `<command>` is the literal command path, for example
`measurements create`, `measurements list`, `measurements recent`, or
`measurements get`.

Required flag validation is deterministic and follows the order documented in
each command's Required flags list.

## Numeric Parsing

Revision numbers use decimal digit strings only:

- accepted examples: `1`, `01`, `50`
- rejected examples: `0`, `-1`, `+1`, `1.5`, `1e2`, `abc`

After the decimal digit string is converted to a number, it must be a safe
integer greater than zero. Non-safe integers are rejected. The CLI does not
trim the revision number before validation.

Limits use the same positive integer parsing rule as recent events and recent
notifications:

- accepted examples: `1`, `01`, `50`
- rejected examples: `0`, `-1`, `+1`, `1.5`, `1e2`, `abc`

Numeric values use JavaScript `Number(value)` conversion and must be finite.
The CLI must reject missing, empty, whitespace-only, `NaN`, `Infinity`, and
`-Infinity` values before opening the database.

Accepted numeric value examples:

- `0`
- `-0`
- `-1`
- `+1`
- `1.5`
- `1e2`
- `0x10`
- `42`

Rejected numeric value examples:

- empty string
- whitespace-only string
- `NaN`
- `Infinity`
- `-Infinity`
- `abc`

The CLI passes accepted numeric values as JavaScript numbers to app actions.

## Output Shape

JSON command outputs use `JSON.stringify` on the object shown below. Write
commands serialize action return values directly. Read and list commands wrap
read action results as `{ measurement }` and `{ measurements }`.

JSON command outputs:

| Command               | JSON Output                            |
| --------------------- | -------------------------------------- |
| `measurements create` | `{"measurement":<measurement>}`        |
| `measurements list`   | `{"measurements":[<measurement>,...]}` |
| `measurements recent` | `{"measurements":[<measurement>,...]}` |
| `measurements get`    | `{"measurement":<measurement>}`        |

Each JSON output is one JSON object plus a trailing newline.

Text output:

| Command               | Text Output                |
| --------------------- | -------------------------- |
| `measurements create` | `Created measurement <id>` |
| `measurements list`   | measurement lines          |
| `measurements recent` | measurement lines          |
| `measurements get`    | one measurement line       |

Measurement lines use:

```text
<id>\t<target>\t<metricName>\t<numericValue><unitSuffix>\t<summary>
```

`<target>` is `baseline/<baselineId>` for baseline measurements and
`experiment/<experimentId> r<revisionNumber>` for experiment measurements.

`<unitSuffix>` is an empty string when `unit` is absent. When `unit` is
present, `<unitSuffix>` is one space followed by the unit, such as
`points` or `ms`.

`<numericValue>` is `String(measurement.numericValue)`. It does not preserve
the original CLI token. `<summary>` is `summaryMarkdown`.

Text list output for an empty list is an empty string.

Text outputs include a trailing newline when they contain at least one line.

Text fields are emitted raw. Local agents that need robust parsing should use
`--json`.

## Database Lifecycle

Measurement CLI commands open the app database:

```ts
const database = openAppDatabase({
  databasePath: invocation.databasePath,
  environment: invocation.environment,
});
```

They create an action context with `createAppActionContext({ database })`, run
one measurement app action, and close the database in a `finally` block.

After command-local parsing succeeds and the database is opened, the database
must close in `finally` for action success, not-found errors, and
action/repository validation errors.

`doctor` remains non-mutating and does not open the database.

## Tests

Add action tests covering:

- creating a measurement through the app action without emitting events or
  notifications
- getting an existing and missing measurement without emitting events or
  notifications
- listing measurements for an experiment with combined revision and metric
  filters
- creating and listing baseline measurements
- listing recent measurements
- repository errors propagate from the app action

Add CLI tests covering:

- create, list, recent, and get measurement commands
- JSON output for create
- JSON output for get wraps the record as `{ measurement }`
- JSON output wraps list and recent results as `{ measurements: [...] }`
- text measurement line formatting with and without a unit
- not-found errors for `measurements get`
- command-local syntax validation before opening the database
- missing required flag validation before opening the database
- missing flag value validation before opening the database
- unknown flag validation before opening the database
- extra positional validation before opening the database
- invalid actor kind validation before opening the database
- invalid revision number validation before opening the database
- invalid limit validation before opening the database
- invalid numeric value validation before opening the database
- accepted numeric value examples including `-1`, `+1`, `1e2`, and `0x10`
- accepted positive integer examples including `01`
- safe-integer revision number rejection before opening the database
- duplicate scalar flags using the last value
- representative unsupported syntax errors for short flags, equals syntax, and
  `--` sentinel

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not add command execution, artifact storage, review state, experiment status
updates, report generation, pass/fail workflow decisions, notification
delivery, scheduler behavior, agent runtime behavior, workers, leases, runtime
sessions, provider threads, or workflow enforcement in this ADR's
implementation.

Do not automatically create events when measurements are created in this ADR.
Use direct event commands or a future composite feature action when a product
workflow needs timeline entries around a measurement.

Do not add measurement statuses, pass/fail enums, comparison directions, or
threshold fields. Use `metricName`, `numericValue`, `unit`,
`summaryMarkdown`, and `detailsMarkdown` for interpretation.

Do not intentionally store large raw command output in `detailsMarkdown`.
Large output belongs in artifacts; measurements may summarize it and point to
the artifact through ordinary records.

## Consequences

Local agents can record and inspect numeric evidence through the CLI:

```text
create measurement
  -> list measurements for a baseline or experiment revision
  -> compare metrics across baselines and candidate revisions
  -> use comments, reviews, artifacts, reports, or events for surrounding context
```

The app can now preserve experiment performance evidence without making
measurement recording a hidden workflow runner.
