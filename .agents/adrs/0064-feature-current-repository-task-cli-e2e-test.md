---
status: active
category: feature
created: 2026-05-14
---

# 0064. Feature: Current Repository Task CLI E2E Test

## Context

ADR 0061 adds a fixture-backed e2e test for current-repository project init and
lookup. ADR 0063 adds `situ tasks current`, which composes current-repository
project lookup with task listing.

The e2e-tests project should now prove the task-current command through the same
real CLI path:

```text
materialize fixture repository
  -> run situ projects init from that repository
  -> create an ordinary task for that project
  -> run situ tasks current from that repository
```

This remains a deterministic regression test. It must not call external agents,
run repository commands, score model output, or require network access.

## Decision

Extend the existing current-repository fixture e2e test to cover
`tasks current`.

Expected files:

```text
projects/e2e-tests/src/current-repository-e2e.test.ts
projects/e2e-tests/src/index.ts
```

The e2e test still uses:

- `tinyAutoresearchFixture`
- `materializeFixtureRepository`
- `runSituCli` from `@situ/app`
- a temporary root directory
- an explicit temporary SQLite database path

The e2e test runs against real CLI commands. It must not call app repositories,
app actions, primitive repositories, or HTTP handlers directly.

## E2E Result Shape

Extend `CurrentRepositoryE2eResult` in `projects/e2e-tests/src/index.ts` with:

```ts
readonly currentTasksTextResult: SituCliResult;
readonly currentTasksJsonResult: SituCliResult;
```

Extend `createCurrentRepositoryE2eResult` input with the same fields and
return those values unchanged.

The helper still attaches `tinyAutoresearchFixture` as `fixture`. It does not
parse CLI output or duplicate product logic.

## E2E Flow

The e2e test creates the same deterministic current-repository world as
ADR 0061.

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

First materialize `tinyAutoresearchFixture` with `materializeFixtureRepository`
under the temporary root and set `repositoryPath` to the returned
`materialized.repositoryPath`.

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

with `cwd` set to `repositoryPath`.

Then run current tasks as text:

```text
situ --db <databasePath> tasks current --project-status active
```

with `cwd` set to `repositoryPath`.

Run current tasks as JSON:

```text
situ --json --db <databasePath> tasks current --project-status active
```

with `cwd` set to `repositoryPath`.

The e2e test may keep the existing `tasks list --project-id <projectId>` assertion
from ADR 0061. `tasks current` is the new behavior being added by this ADR.

## Assertions

The e2e test asserts:

- `tasks current --project-status active` exits `0`
- text current-tasks output is exactly:

  ```ts
  "task_e2e_current_repository\ttriage\tInspect fixture repository\n";
  ```

- JSON current-tasks output exits `0` and parses as:

  ```json
  {"projects":[<project>],"tasks":[<task>]}
  ```

- the parsed JSON object has exactly the top-level keys `projects` and `tasks`
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
- the parsed `tasks` array contains exactly one task
- that task has:
  - `id`: `task_e2e_current_repository`
  - `projectId`: `project_e2e_current_repository`
  - `title`: `Inspect fixture repository`
  - `bodyMarkdown`: `tinyAutoresearchFixture.goal`
  - `status`: `triage`
  - `createdBy.actorKind`: `local_agent`
  - `createdBy.actorId`: `e2e-agent`
  - no `assignedTo` property
  - `metadata.createdAt`: `2026-05-14T12:00:00.000Z`
  - `metadata.updatedAt`: `2026-05-14T12:00:00.000Z`
- `createCurrentRepositoryE2eResult` preserves the current-tasks text and JSON
  CLI results

Each non-empty expected stdout includes a trailing newline.

## Boundaries

Do not add app features in this ADR.

Do not add new CLI commands.

Do not call app repositories, app actions, primitive repositories, HTTP
handlers, or sync handlers directly from this e2e test.

The e2e code/runtime must not run `git`, shell commands, package managers,
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

The e2e test now checks the local-agent path that matters most after project
bootstrap:

```text
cd repo
situ tasks current --project-status active
  -> visible tasks for projects in this repository
```

Future agents can verify project recovery and task recovery through one
deterministic fixture world without introducing an agent runtime or workflow
engine.
