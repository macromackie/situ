---
status: active
category: feature
created: 2026-05-13
---

# 0033. Feature: Experiment Actions and CLI

## Context

Experiments are the visible candidate-work primitive from ADR 0020. They are
how Situ represents a concrete attempt to improve a task: a proposed approach,
its branch or worktree, its current status, its assignee, and its latest
revision number.

The primitive package already stores experiment records. The app still needs a
small action surface and CLI commands so local agents and humans can create,
inspect, assign, move, and revise experiments through ordinary Situ commands.

Experiment actions should feel like product actions, not workflow steps. A
local agent can create an experiment, move the experiment to `running`, revise
the same experiment after feedback, and move the experiment back to
`ready_for_review` without creating hidden jobs, leases, workers, or scheduler
records.

## Decision

Add experiment app actions and a `situ experiments` CLI command group.

Expected files:

```text
projects/app/src/actions/experiments.ts
projects/app/src/actions/experiments.test.ts
projects/app/src/actions/index.ts
projects/app/src/cli/base.ts
projects/app/src/cli/commands/experiments.ts
projects/app/src/cli/flags.ts
projects/app/src/cli/format.ts
projects/app/src/cli/situ.test.ts
```

Experiment CLI commands are thin adapters. They parse command-local args, open
the local database, call experiment app actions, format results, and close the
database. They do not call primitive repositories directly.

## Action API

`projects/app/src/actions/experiments.ts` exports:

```ts
export type CreateExperimentActionInput = CreateExperimentInput & {
  readonly context: AppActionContext;
  readonly eventId?: SituId<"event">;
};

export type CreateExperimentActionResult = {
  readonly experiment: ExperimentRecord;
  readonly event: EventRecord;
};

export function createExperimentAction(
  input: CreateExperimentActionInput,
): CreateExperimentActionResult;

export type GetExperimentActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"experiment">;
};

export function getExperimentAction(input: GetExperimentActionInput): ExperimentRecord | undefined;

export type ListExperimentsActionInput = ListExperimentsInput & {
  readonly context: AppActionContext;
};

export function listExperimentsAction(
  input: ListExperimentsActionInput,
): readonly ExperimentRecord[];

export type MoveExperimentActionInput = MoveExperimentInput & {
  readonly context: AppActionContext;
  readonly actor: ActorRef;
  readonly eventId?: SituId<"event">;
};

export type MoveExperimentActionResult = {
  readonly experiment: ExperimentRecord;
  readonly event: EventRecord;
};

export function moveExperimentAction(input: MoveExperimentActionInput): MoveExperimentActionResult;

export type AssignExperimentActionInput = AssignExperimentInput & {
  readonly context: AppActionContext;
  readonly actor: ActorRef;
  readonly eventId?: SituId<"event">;
};

export type AssignExperimentActionResult = {
  readonly experiment: ExperimentRecord;
  readonly event: EventRecord;
};

export function assignExperimentAction(
  input: AssignExperimentActionInput,
): AssignExperimentActionResult;

export type ReviseExperimentActionInput = ReviseExperimentInput & {
  readonly context: AppActionContext;
  readonly actor: ActorRef;
  readonly eventId?: SituId<"event">;
};

export type ReviseExperimentActionResult = {
  readonly experiment: ExperimentRecord;
  readonly event: EventRecord;
};

export function reviseExperimentAction(
  input: ReviseExperimentActionInput,
): ReviseExperimentActionResult;
```

The action module imports:

- `ActorRef` and `SituId` from `@situ/common`
- `EventRecord` from `@situ/events`
- `AssignExperimentInput`, `CreateExperimentInput`, `ExperimentRecord`,
  `ListExperimentsInput`, `MoveExperimentInput`, and
  `ReviseExperimentInput` from `@situ/experiments`
- `AppActionContext` and `runAppTransaction` from `./context.js`

`projects/app/src/actions/index.ts` exports the experiment actions from
`./experiments.js`.

## Action Behavior

`createExperimentAction`, `moveExperimentAction`, `assignExperimentAction`,
and `reviseExperimentAction` create one event after the experiment write
succeeds. Each write action must call `runAppTransaction` so the experiment
write and event write commit or roll back together.

`createExperimentAction` forwards these fields to `experiments.create`:

- `id`
- `projectId`
- `taskId`
- `title`
- `summaryMarkdown`
- `createdBy`
- `assignedTo`
- `status`
- `baseRef`
- `branchName`
- `worktreePath`
- `now`

It does not forward `context` or `eventId`.

`moveExperimentAction` forwards these fields to `experiments.move`:

- `id`
- `status`
- `now`

It does not forward `context`, `actor`, or `eventId`.

`assignExperimentAction` forwards these fields to `experiments.assign`:

- `id`
- `assignedTo`
- `now`

It does not forward `context`, `actor`, or `eventId`.

`reviseExperimentAction` forwards these fields to `experiments.revise`:

- `id`
- `summaryMarkdown`
- `status`
- `baseRef`
- `clearBaseRef`
- `branchName`
- `clearBranchName`
- `worktreePath`
- `clearWorktreePath`
- `now`

It does not forward `context`, `actor`, or `eventId`.

`getExperimentAction` and `listExperimentsAction` are read actions. They do
not need transactions and should return repository results directly.

## Event Rules

Events are append-only timeline records. The action-created event target is
the experiment that changed:

```ts
{ targetKind: "experiment", targetId: experiment.id }
```

Event actor rules:

- `createExperimentAction`: actor is the created experiment's `createdBy`
- `moveExperimentAction`: actor is `input.actor`
- `assignExperimentAction`: actor is `input.actor`
- `reviseExperimentAction`: actor is `input.actor`

Event timestamp rules:

- Pass `input.now` to both the experiment repository write and event creation
  when `now` exists on the action input.
- When `now` is absent, let each repository choose its own current timestamp.

Event ids:

- When `eventId` is provided, pass it to event creation.
- When `eventId` is absent, let the event repository generate one.

Event summaries are exact:

| Action                   | Summary                                     |
| ------------------------ | ------------------------------------------- |
| `createExperimentAction` | `Created experiment`                        |
| `moveExperimentAction`   | `Moved experiment to <status>`              |
| `assignExperimentAction` | `Assigned experiment to <assignee label>`   |
| `assignExperimentAction` | `Cleared experiment assignee`               |
| `reviseExperimentAction` | `Revised experiment to revision <revision>` |

The assign summary uses `Assigned experiment to <assignee label>` when
`input.assignedTo` is present. The assignee label is `displayName` when
present, otherwise `actorId`.

The assign summary uses `Cleared experiment assignee` when `input.assignedTo`
is absent.

The revise summary uses the repository result's `revisionNumber`, not a value
derived before the write.

Action-created events do not need `bodyMarkdown` in this ADR. Experiment
records, comments, measurements, artifacts, reviews, and reports carry detailed
evidence.

## Error And Transaction Behavior

Actions do not catch and translate primitive repository errors. Validation,
not-found, conflict, and unexpected errors should propagate from repositories
and transaction helpers.

If event creation fails after the experiment write inside a write action, the
transaction must roll back the experiment write.

Actions must not create events before the experiment write succeeds.

If the experiment write throws, event creation is not attempted.

Actions should not implement their own nested transaction detection. ADR
0025's `runAppTransaction` and the database helper own that behavior.

## CLI Commands

The CLI supports these commands:

```text
situ experiments create [flags]
situ experiments list [flags]
situ experiments get <experiment-id>
situ experiments move <experiment-id> [flags]
situ experiments assign <experiment-id> [flags]
situ experiments revise <experiment-id> [flags]
```

Global options still appear before the command group:

```text
situ --json --db /tmp/situ.db experiments list --task-id task_123
```

`projects/app/src/cli/commands/experiments.ts` exports exactly:

```ts
export function runExperimentsCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult;
```

`base.ts` dispatches the `experiments` command group to
`runExperimentsCommand({ invocation })`.

The root help text includes:

```text
  experiments  Manage experiment records.
```

## CLI Flags

### `experiments create`

Flags:

```text
--id <experiment-id>
--event-id <event-id>
--project-id <project-id>
--task-id <task-id>
--title <title>
--summary <markdown>
--status <planned|running|ready_for_review|accepted|rejected|abandoned>
--base-ref <git-ref>
--branch-name <branch-name>
--worktree-path <path>
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
- `--task-id`
- `--title`
- `--summary`
- `--actor-kind`
- `--actor-id`

Optional flags:

- `--id`
- `--event-id`
- `--status`
- `--base-ref`
- `--branch-name`
- `--worktree-path`
- `--actor-display-name`
- `--assigned-to-kind`
- `--assigned-to-id`
- `--assigned-to-display-name`
- `--now`

Assignee flags are optional, but when any `--assigned-to-*` flag is present,
both `--assigned-to-kind` and `--assigned-to-id` are required.

Action call:

```ts
createExperimentAction({
  context,
  id,
  eventId,
  projectId,
  taskId,
  title,
  summaryMarkdown,
  status,
  baseRef,
  branchName,
  worktreePath,
  createdBy: actor,
  assignedTo,
  now,
});
```

`--summary` maps to `summaryMarkdown`.

### `experiments list`

Flags:

```text
--project-id <project-id>
--task-id <task-id>
--status <planned|running|ready_for_review|accepted|rejected|abandoned>
--assigned-to-kind <human|local_agent|system>
--assigned-to-id <id>
```

No flags are required.

When either assigned-to filter flag is present, both are required.

Action call:

```ts
listExperimentsAction({
  context,
  projectId,
  taskId,
  status,
  assignedTo,
});
```

### `experiments get <experiment-id>`

No flags are supported.

Action call:

```ts
getExperimentAction({
  context,
  id,
});
```

When the action returns `undefined`, throw `NotFoundError` with message
`Experiment was not found.` and details `{ id }`.

### `experiments move <experiment-id>`

Flags:

```text
--event-id <event-id>
--status <planned|running|ready_for_review|accepted|rejected|abandoned>
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
moveExperimentAction({
  context,
  id,
  eventId,
  status,
  actor,
  now,
});
```

### `experiments assign <experiment-id>`

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
assignExperimentAction({
  context,
  id,
  eventId,
  actor,
  assignedTo,
  now,
});
```

For `--clear`, omit `assignedTo` from the action input or pass `undefined`.

If the implementation reuses a shared assignment parser, that parser must
accept the literal command path or otherwise avoid task-specific error text.
For experiment commands, missing assignment flags must mention
`experiments assign`, not `tasks assign`.

### `experiments revise <experiment-id>`

Flags:

```text
--event-id <event-id>
--summary <markdown>
--status <planned|running|ready_for_review|accepted|rejected|abandoned>
--base-ref <git-ref>
--clear-base-ref
--branch-name <branch-name>
--clear-branch-name
--worktree-path <path>
--clear-worktree-path
--actor-kind <human|local_agent|system>
--actor-id <id>
--actor-display-name <name>
--now <iso-timestamp>
```

Required flags:

- `--actor-kind`
- `--actor-id`

The command must include at least one revision flag:

- `--summary`
- `--status`
- `--base-ref`
- `--clear-base-ref`
- `--branch-name`
- `--clear-branch-name`
- `--worktree-path`
- `--clear-worktree-path`

Clear flags explicitly clear their matching optional experiment field.

Invalid revision flag combinations:

- `--clear-base-ref` with `--base-ref`
- `--clear-branch-name` with `--branch-name`
- `--clear-worktree-path` with `--worktree-path`

Action call:

```ts
reviseExperimentAction({
  context,
  id,
  eventId,
  summaryMarkdown,
  status,
  baseRef,
  clearBaseRef,
  branchName,
  clearBranchName,
  worktreePath,
  clearWorktreePath,
  actor,
  now,
});
```

`--summary` maps to `summaryMarkdown`.

Missing experiments during move, assign, or revise propagate from the action
layer. The CLI does not add a separate existence check.

## Parser Contract

Command-specific syntax validation must complete before opening the database.
This includes:

- unknown experiment subcommands
- missing subcommands
- missing required positional args
- extra positional args
- missing required flags
- unknown flags
- missing flag values
- invalid actor kinds
- invalid experiment statuses
- invalid assignment flag combinations
- invalid revision flag combinations
- revise commands with no revision flags

Command-local help follows ADR 0092. For example,
`situ experiments create --help` prints usage without opening the database.

Duplicate scalar flags are allowed; the last value wins.

Boolean flags take no value. Duplicate boolean flags are allowed and
idempotent. A token after a boolean flag is parsed normally as the next flag or
as a positional arg.

Command-local flags and positionals may be interleaved. For example,
`situ experiments move --status running experiment_1 --actor-kind human
--actor-id scott` and `situ experiments move experiment_1 --status running
--actor-kind human --actor-id scott` are equivalent.

The parser does not support short flags, equals syntax, or a `--` sentinel.

Parser errors use `ValidationError` through the CLI parser error helper, with
the existing command-local message style:

- missing subcommand: `Command experiments requires a subcommand.`
- unknown subcommand: `Unknown experiments subcommand: <subcommand>.`
- missing required positional arg: `Command <command> requires <<name>>.`
- missing required flag: `Missing required flag <flag>.`
- unknown flag: `Unknown flag for <command>: <flag>.`
- missing flag value: `Missing value for <flag>.`
- extra positional args:
  `Command <command> received extra positional arguments: <args>`
- invalid actor kind: `Invalid actor kind for <flag>: <value>.`
- invalid experiment status: `Invalid experiment status: <value>.`
- invalid assignment clear combination:
  `--clear cannot be combined with assignee flags.`
- missing assignment assignee:
  `Command experiments assign requires assignee flags unless --clear is present.`
- invalid revision clear combination:
  `<clear-flag> cannot be combined with <value-flag>.`
- missing revision flags:
  `Command experiments revise requires at least one revision flag.`

In parser error messages, `<command>` is the literal command path, for example
`experiments create`, `experiments list`, `experiments move`,
`experiments assign`, or `experiments revise`.

Required flag validation is deterministic and follows the order documented in
each command's Required flags list.

## Status Validation

The CLI validates experiment statuses:

```text
planned
running
ready_for_review
accepted
rejected
abandoned
```

Invalid statuses are `ValidationError`s before opening the database.

The CLI accepts only the listed literals and passes them unchanged to actions.

## Output Shape

JSON command outputs use `JSON.stringify` on the object shown below. Write
commands serialize action return values directly. Read and list commands wrap
read action results as `{ experiment }` and `{ experiments }`.

JSON command outputs:

| Command              | JSON Output                                   |
| -------------------- | --------------------------------------------- |
| `experiments create` | `{"experiment":<experiment>,"event":<event>}` |
| `experiments list`   | `{"experiments":[<experiment>,...]}`          |
| `experiments get`    | `{"experiment":<experiment>}`                 |
| `experiments move`   | `{"experiment":<experiment>,"event":<event>}` |
| `experiments assign` | `{"experiment":<experiment>,"event":<event>}` |
| `experiments revise` | `{"experiment":<experiment>,"event":<event>}` |

Each JSON output is one JSON object plus a trailing newline.

Text output:

| Command              | Text Output                                                  |
| -------------------- | ------------------------------------------------------------ |
| `experiments create` | `Created experiment <id> (event <event-id>)`                 |
| `experiments list`   | experiment lines                                             |
| `experiments get`    | one experiment line                                          |
| `experiments move`   | `Moved experiment <id> to <status> (event <event-id>)`       |
| `experiments assign` | `Updated experiment <id> assignment (event <event-id>)`      |
| `experiments revise` | `Revised experiment <id> to revision <n> (event <event-id>)` |

Experiment lines use:

```text
<id>\t<status>\tr<revisionNumber>\t<title>
```

Text list output for an empty list is an empty string.

Text outputs include a trailing newline when they contain at least one line.

Text fields are emitted raw. Local agents that need robust parsing should use
`--json`.

## Database Lifecycle

Experiment CLI commands open the app database:

```ts
const database = openAppDatabase({
  databasePath: invocation.databasePath,
  environment: invocation.environment,
});
```

They create an action context with `createAppActionContext({ database })`, run
one experiment app action, and close the database in a `finally` block.

After command-local parsing succeeds and the database is opened, the database
must close in `finally` for action success, not-found errors, and
action/repository validation errors.

`doctor` remains non-mutating and does not open the database.

## Tests

Add action tests covering:

- creating an experiment through the app action and creating exactly one event
- moving an experiment and creating exactly one event
- assigning an experiment with display name in the event summary
- assigning an experiment with actor id in the event summary when display name
  is absent
- clearing an experiment assignee with the exact event summary
- revising an experiment and using the returned revision number in the event
  summary
- event creation failure rolls back create, move, assign, and revise writes
- primary experiment write failure creates no event
- getting an existing and missing experiment
- listing experiments with combined filters

Add CLI tests covering:

- create, list, get, move, assign, and revise experiment commands
- JSON output for at least one write command
- JSON output wraps list results as `{ experiments: [...] }`
- text experiment line formatting
- not-found errors for `experiments get`
- not-found errors for `experiments move`, `experiments assign`, and
  `experiments revise`
- command-local syntax validation before opening the database
- missing required flag validation before opening the database
- missing flag value validation before opening the database
- unknown flag validation before opening the database
- extra positional validation before opening the database
- invalid experiment status validation before opening the database
- invalid actor kind validation before opening the database
- invalid assignment flag combinations before opening the database
- invalid revision flag combinations before opening the database
- duplicate scalar flags using the last value

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not add git command execution, worktree creation, measurement recording,
artifact recording, review creation, report generation, notification delivery,
HTTP handlers, scheduler behavior, agent runtime behavior, workers, leases,
runtime sessions, provider threads, or workflow enforcement in this ADR's
implementation.

Do not enforce a rigid experiment status-transition graph. Actors choose the
next visible state through ordinary actions.

Do not store historical revision bodies outside the latest experiment record in
this ADR. Historical evidence belongs in events, comments, measurements,
artifacts, reviews, and reports.

Do not add hidden defaults for actor identity. Actor identity is visible
product attribution and must come from command flags for CLI write commands.

## Consequences

Local agents can now operate the visible candidate-work loop through the CLI:

```text
create experiment
  -> assign experiment
  -> move experiment to running
  -> revise the same experiment after feedback
  -> move experiment to ready_for_review
  -> inspect the experiment timeline
```

The app supports same-record revision and human-like handoff without turning
experiments into hidden workflow runs.
