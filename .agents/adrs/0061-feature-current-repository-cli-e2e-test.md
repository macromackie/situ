---
status: active
category: feature
created: 2026-05-14
---

# 0061. Feature: Current Repository CLI E2E Test

## Context

ADR 0010 says deterministic CLI integration checks belong in tests or
e2e-tests. ADR 0060 adds fixture repository materialization, and ADR 0058 and
ADR 0059 add current-repository project bootstrap and lookup commands.

The e2e-tests project should prove those pieces work together through the real
app-facing CLI surface:

```text
materialize fixture repository
  -> run situ projects init from that repository
  -> run situ projects current from that repository
  -> create and list an ordinary task for that project
```

This is a deterministic regression test. It must not call external agents, run
repository commands, score model output, or require network access.

## Decision

Add a fixture-backed e2e test for the current-repository loop.

Expected files:

```text
projects/e2e-tests/src/current-repository-e2e.test.ts
projects/e2e-tests/src/index.ts
```

The e2e test uses:

- `tinyAutoresearchFixture`
- `materializeFixtureRepository`
- `runSituCli` from `@situ/app`
- a temporary root directory
- an explicit temporary SQLite database path

The e2e test runs against real CLI commands. It must not call app repositories
or app actions directly.

## E2E Result Shape

`projects/e2e-tests/src/index.ts` imports `SituCliResult` as a type from
`@situ/app`, imports `tinyAutoresearchFixture` from `@situ/fixtures`, and
imports `TestFixture` as a type from `@situ/fixtures`.

It exports:

```ts
export type CurrentRepositoryE2eResult = {
  readonly fixture: TestFixture;
  readonly repositoryPath: string;
  readonly initResult: SituCliResult;
  readonly currentTextResult: SituCliResult;
  readonly currentJsonResult: SituCliResult;
  readonly taskCreateResult: SituCliResult;
  readonly taskListResult: SituCliResult;
};

export function createCurrentRepositoryE2eResult(input: {
  readonly repositoryPath: string;
  readonly initResult: SituCliResult;
  readonly currentTextResult: SituCliResult;
  readonly currentJsonResult: SituCliResult;
  readonly taskCreateResult: SituCliResult;
  readonly taskListResult: SituCliResult;
}): CurrentRepositoryE2eResult;
```

The function attaches `tinyAutoresearchFixture` as `fixture` and otherwise
returns the provided values. It does not parse CLI output or duplicate product
logic.

## E2E Flow

The test creates a temporary root directory and removes it in `finally`.

Materialize the fixture:

```ts
const materialized = materializeFixtureRepository({
  fixture: tinyAutoresearchFixture,
  rootPath,
});
```

Use:

```text
databasePath = <rootPath>/situ.db
repositoryPath = materialized.repositoryPath
projectId = project_e2e_current_repository
eventId = event_e2e_current_repository
taskId = task_e2e_current_repository
taskEventId = event_e2e_current_repository_task
actorKind = local_agent
actorId = e2e-agent
now = 2026-05-14T12:00:00.000Z
```

Run project init:

```text
situ --db <databasePath> projects init
  --id <projectId>
  --event-id <eventId>
  --name <fixture.name>
  --goal <fixture.goal>
  --actor-kind <actorKind>
  --actor-id <actorId>
  --now <now>
```

with `cwd` set to `repositoryPath`.

Run project current as text:

```text
situ --db <databasePath> projects current --status active
```

with `cwd` set to `repositoryPath`.

Run project current as JSON:

```text
situ --json --db <databasePath> projects current --status active
```

with `cwd` set to `repositoryPath`.

Run task create:

```text
situ --db <databasePath> tasks create
  --id <taskId>
  --event-id <taskEventId>
  --project-id <projectId>
  --title "Inspect fixture repository"
  --body <fixture.goal>
  --actor-kind <actorKind>
  --actor-id <actorId>
  --now <now>
```

with `cwd` set to `repositoryPath`. The command still passes `--project-id`
explicitly. Current-repository recovery is exercised by `projects current`; the
task commands are ordinary task commands against the initialized project.

Run task list:

```text
situ --db <databasePath> tasks list --project-id <projectId>
```

with `cwd` set to `repositoryPath` for consistency with the e2e scenario. The
task list behavior still comes from the explicit `--project-id`.

## Assertions

The e2e test asserts:

- the materialized repository contains the fixture `README.md`
- `projects init` exits `0`
- `projects init` text output is:

  ```text
  Initialized project project_e2e_current_repository (event event_e2e_current_repository)
  ```

- `projects current --status active` exits `0`
- text current output is:

  ```text
  project_e2e_current_repository\tactive\ttiny-autoresearch
  ```

- JSON current output exits `0` and parses as:

  ```json
  {"projects":[<project>]}
  ```

- the parsed `projects` array contains exactly one project
- that project has:
  - `id`: `project_e2e_current_repository`
  - `name`: `tiny-autoresearch`
  - `repositoryPath`: the materialized repository path
  - `goalMarkdown`: `tinyAutoresearchFixture.goal`
  - `status`: `active`
  - `createdBy.actorKind`: `local_agent`
  - `createdBy.actorId`: `e2e-agent`
  - `metadata.createdAt`: `2026-05-14T12:00:00.000Z`
  - `metadata.updatedAt`: `2026-05-14T12:00:00.000Z`
- task creation exits `0`
- task list exits `0`
- task list text output is:

  ```text
  task_e2e_current_repository\ttriage\tInspect fixture repository
  ```

- `createCurrentRepositoryE2eResult` preserves the fixture, repository path,
  and CLI results

Each non-empty expected stdout includes a trailing newline.

## Boundaries

Do not add app features in this ADR.

Do not add new CLI commands.

Do not call app repositories or app actions directly from this e2e test.

The e2e implementation must not run `git`, shell commands, package managers,
benchmark commands, local agent CLIs, provider SDKs, or network calls.

Do not add LLM evals, LLM judges, model scoring, scheduler behavior, workers,
leases, provider sessions, subagent orchestration, or hidden workflow state.

Do not write outside the test temporary root except for ordinary tooling output
such as coverage artifacts.

## Gates

The e2e test must run as part of:

```text
mise run e2e-tests
```

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Consequences

The e2e-tests project now has a small but real regression world:

```text
fixture data
  -> materialized repository
  -> app-facing CLI commands
  -> durable Situ records
  -> visible project/task context recovered from records
```

This gives future agents a deterministic end-to-end check for the local
current-repository experience without introducing an agent runtime or workflow
engine.
