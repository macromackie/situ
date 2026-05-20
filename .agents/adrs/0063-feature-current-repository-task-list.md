---
status: active
category: feature
created: 2026-05-14
---

# 0063. Feature: Current Repository Task List

## Context

ADR 0059 lets actors recover projects for the current repository.
ADR 0062 lets the task primitive list tasks for an explicit set of project ids.

The next useful local-agent command is a read-only task view for the current
repository:

```text
cd target-repository
situ tasks current
```

This should not select a project, claim work, infer a workflow state, or hide
the project ids involved. It should compose existing visible primitives:

```text
detect current repository
  -> list projects whose repositoryPath equals that repository
  -> list tasks whose projectId is one of those visible project ids
```

## Decision

Add:

```text
situ tasks current [flags]
```

`tasks current` is a read-only CLI command.

Expected files:

```text
projects/app/src/cli/commands/tasks.ts
projects/app/src/cli/situ.test.ts
```

## Command Behavior

Flags:

```text
--project-status <active|archived>
--status <triage|backlog|in_progress|in_review|done|canceled>
--assigned-to-kind <human|local_agent|system>
--assigned-to-id <id>
```

No flags are required.

`--project-status` filters the projects that are considered for the current
repository. When omitted, active and archived projects for the current
repository are both considered.

`--status` filters returned tasks by task status.

When either assigned-to filter flag is present, both are required.

All CLI validation, including semantic `--project-status`, `--status`, and
assigned-to validation, completes before repository detection and before
opening the database.

After parser validation:

1. detect the repository root from `invocation.cwd` using
   `findCurrentRepositoryRoot`
2. open the database
3. create an app action context
4. call:

   ```ts
   listProjectsAction({
     context,
     repositoryPath,
     status: parsed.projectStatus,
   });
   ```

5. call:

   ```ts
   listTasksAction({
     context,
     projectIds: projects.map((project) => project.id),
     status: parsed.status,
     assignedTo: parsed.assignedTo,
   });
   ```

6. close the database in `finally`

Repository detection errors must happen before opening the database.

Once the database has opened, it must close in `finally` for success and for
every error raised after opening.

This command is allowed to call two app read actions. It does not need a new
app action because it is only composing existing read actions. It must not call
primitive repositories directly.

When no projects match the current repository and optional project status,
call `listTasksAction` with `projectIds: []` and return an empty task list.

## Output Shape

JSON output:

```json
{"projects":[<project>,...],"tasks":[<task>,...]}
```

`projects` uses the same project object shape as `situ projects current
--json`: each project includes `id`, `name`, `repositoryPath`, `goalMarkdown`,
`status`, `createdBy`, and `metadata`.

`tasks` uses the same task object shape as `situ tasks list --json`: each task
includes `id`, `projectId`, `title`, `bodyMarkdown`, `status`, `assignedTo`
when present, `createdBy`, and `metadata`.

JSON output always includes both keys, even when either array is empty, and
includes a trailing newline.

Text output uses the same line format as `tasks list`:

```text
<task-id>\t<status>\t<title>
```

When no tasks match, text output is empty and the exit code is still `0`.

Each non-empty output has a trailing newline.

Project ordering in JSON is the project repository ordering:

```sql
ORDER BY created_at ASC, id ASC
```

Task ordering is the task repository ordering across all included projects:

```sql
ORDER BY created_at ASC, id ASC
```

The CLI must not reorder either array.

## Parser Rules

`tasks current` uses the same command-local scanning rules as existing task
commands:

- supported value flags consume the next token when it exists and does not
  start with `--`
- value flags followed by tokens beginning with `--` report
  `Missing value for <flag>.`
- single-dash tokens may be consumed as values
- duplicate scalar flags are allowed; the last value wins
- boolean flags, short flags, equals syntax, and `--` sentinel are unsupported

Parser errors use the existing CLI parser helper and message style:

- unknown flag: `Unknown flag for tasks current: <flag>.`
- missing flag value: `Missing value for <flag>.`
- extra positional args:
  `Command tasks current received extra positional arguments: <args>`
- invalid project status: `Invalid project status: <value>.`
- invalid task status: `Invalid task status: <value>.`
- invalid assignee kind:
  `Invalid actor kind for --assigned-to-kind: <value>.`
- incomplete assignee filter:
  `Assignee filter flags require both --assigned-to-kind and --assigned-to-id.`

Validation order is:

1. scan argv left to right for unknown flags, missing flag values, and
   positional arguments
2. reject extra positional arguments
3. parse semantic values such as project status, task status, and assignee
   filter

Command-local help follows ADR 0092. For example,
`situ tasks current --help` prints usage without detecting the repository or opening the database.

## Tests

Add CLI tests covering:

- text output for tasks across multiple current-repository projects
- JSON output containing both the matched projects and matched tasks
- filtering projects with `--project-status`
- filtering tasks with `--status`
- filtering tasks with `--assigned-to-kind` and `--assigned-to-id`
- duplicate scalar flags using the last value
- empty text output with exit code `0` when no projects match
- empty text output with exit code `0` when projects match but no tasks match
- empty JSON output is exactly:

  ```text
  {"projects":[],"tasks":[]}
  ```

- parser validation before repository detection and before opening the database
  for unknown flags, missing flag values, extra positionals, invalid project
  status, invalid task status, invalid assignee kind, and incomplete assignee
  filters
- repository detection errors happen before opening the database
- database closure after post-open errors

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not add package or action APIs in this ADR.

Do not create, update, archive, move, assign, claim, or select projects or
tasks.

Do not create comments, events, notifications, experiments, measurements,
artifacts, reviews, reports, branches, commits, worktrees, or hidden workflow
state.

Do not run `git`.

Do not add scheduler behavior, workers, leases, heartbeats, provider sessions,
subagent orchestration, local agent execution, or automatic project selection.

Do not change `tasks list`.

## Consequences

Local agents can now inspect the task inbox for the repository they are already
standing in:

```text
cd repo
situ tasks current --project-status active --status backlog
```

The app still keeps the primitive boundary clear: repository detection yields
visible projects, and visible project ids feed ordinary task listing.
