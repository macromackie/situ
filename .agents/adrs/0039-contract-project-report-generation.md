---
status: active
category: contract
created: 2026-05-13
---

# 0039. Contract: Project Report Generation

## Context

Reports are durable written records owned by ADR 0024. Report actions and CLI
commands from ADR 0037 let agents create and inspect those records.

The app also needs deterministic helpers that collect visible project state and
render a Markdown summary. These helpers should make report generation easy
without turning report generation into a workflow runner.

This is a read-only rendering contract:

```text
project records
  -> collect related visible records
  -> build an in-memory snapshot
  -> render Markdown
  -> caller decides whether to create a report record
```

## Decision

`projects/app/src/reports/` owns report generation helpers over app records.

Expected files:

```text
projects/app/src/reports/collection.ts
projects/app/src/reports/index.ts
projects/app/src/reports/index.test.ts
projects/app/src/reports/render.ts
projects/app/src/reports/types.ts
projects/app/src/reports/visual.ts
```

The module exports:

```ts
export type ReportTargetAttachments = {
  readonly comments: readonly CommentRecord[];
  readonly events: readonly EventRecord[];
  readonly artifacts: readonly ArtifactRecord[];
  readonly reports: readonly ReportRecord[];
};

export type ProjectReportSnapshot = {
  readonly project: ProjectRecord;
  readonly target: ReportTargetAttachments;
  readonly tasks: readonly ProjectReportTaskSnapshot[];
};

export type ProjectReportTaskSnapshot = {
  readonly task: TaskRecord;
  readonly target: ReportTargetAttachments;
  readonly experiments: readonly ProjectReportExperimentSnapshot[];
};

export type ProjectReportExperimentSnapshot = {
  readonly experiment: ExperimentRecord;
  readonly target: ReportTargetAttachments;
  readonly measurements: readonly ProjectReportMeasurementSnapshot[];
  readonly reviews: readonly ProjectReportReviewSnapshot[];
};

export type ProjectReportMeasurementSnapshot = {
  readonly measurement: MeasurementRecord;
  readonly target: ReportTargetAttachments;
};

export type ProjectReportReviewSnapshot = {
  readonly review: ReviewRecord;
  readonly target: ReportTargetAttachments;
};

export type CollectProjectReportSnapshotInput = {
  readonly context: AppActionContext;
  readonly projectId: SituId<"project">;
};

export function collectProjectReportSnapshot(
  input: CollectProjectReportSnapshotInput,
): ProjectReportSnapshot;

export type RenderProjectReportMarkdownInput = {
  readonly snapshot: ProjectReportSnapshot;
  readonly generatedAt?: IsoTimestamp;
};

export type RenderProjectReportHtmlInput = {
  readonly snapshot: ProjectReportSnapshot;
  readonly generatedAt?: IsoTimestamp;
};

export function renderProjectReportMarkdown(input: RenderProjectReportMarkdownInput): string;

export function renderProjectReportHtml(input: RenderProjectReportHtmlInput): string;

export type GenerateProjectReportMarkdownInput = CollectProjectReportSnapshotInput & {
  readonly generatedAt?: IsoTimestamp;
};

export type GenerateProjectReportHtmlInput = CollectProjectReportSnapshotInput & {
  readonly generatedAt?: IsoTimestamp;
};

export function generateProjectReportMarkdown(input: GenerateProjectReportMarkdownInput): string;

export function generateProjectReportHtml(input: GenerateProjectReportHtmlInput): string;
```

The module imports record types from primitive packages and `AppActionContext`
from `projects/app/src/actions/context.ts`. It does not import CLI or HTTP
modules.

The report generation public contract is exactly the types and functions listed
above. `index.ts` should be a thin public entrypoint that exports those report
generation types and functions. Implementation should stay split across focused
collection, Markdown rendering, visual HTML rendering, and type modules.

## Snapshot Collection

`collectProjectReportSnapshot` reads records through
`input.context.repositories`.

It must:

- load the project by id
- throw `NotFoundError` when the project does not exist, with message
  `Project was not found.` and details `{ id: input.projectId }`
- collect project target attachments for target `project/<project-id>`
- list tasks for the project
- list experiments for the project
- nest experiments under their task by `taskId`
- throw `ConflictError` when a project experiment references a task that is not
  in the project task list, with message
  `Project report could not be generated because experiment state is inconsistent.`
  and details `{ projectId, experimentId, taskId }`
- list measurements for each experiment
- list reviews for each experiment
- collect target attachments for each task, experiment, measurement, and review

Target attachments are:

- comments listed by target
- events listed by target
- artifacts listed by target
- reports listed by target

Report attachments are target-scoped and intentionally use
`reports.listForTarget` directly. They are not filtered by `report.projectId`.
If a report is attached to the target, it is visible report context for that
target.

The collector does not load notifications. Notifications are an inbox
primitive, not report source material.

The collector does not recursively collect attachments for comments, events,
artifacts, reports, or notifications. If those records need deeper context, the
Markdown body should point at the referenced record id or artifact URI.

The collector preserves repository ordering:

- tasks and experiments are repository-ordered ascending by creation time and id
- comments, events, artifacts, reports, measurements, and reviews are
  repository-ordered ascending by creation time and id

It does not create, update, move, delete, archive, assign, dismiss, mark
notifications read, review, measure, run commands, write files, or emit events.

## Markdown Rendering

`renderProjectReportMarkdown` is a pure renderer over a snapshot. It must not
read the database or depend on current time when `generatedAt` is absent.

The returned Markdown always ends with a single trailing newline.

The renderer uses this top-level shape:

```text
# Project Report: <project.name>

- Project: <project.id>
- Status: <project.status>
- Repository: <project.repositoryPath>
- Created: <project.metadata.createdAt>
- Created by: <actor-label>
- Generated: <generatedAt>              only when generatedAt is provided

## Goal

<project.goalMarkdown>

## Project Attachments

<target attachments>

## Tasks

<task sections or None.>
```

Actor labels use `displayName` when it is present; otherwise they use:

```text
<actorKind>/<actorId>
```

Target labels use:

```text
<targetKind>/<targetId>
```

Raw Markdown fields are embedded as-is. The renderer does not escape titles,
ids, paths, summaries, bodies, artifact URIs, or report bodies. Callers that
need machine-readable output should use the underlying records, not parse the
Markdown report.

## HTML Rendering

`renderProjectReportHtml` is a pure renderer over the same snapshot. It must
not read the database or depend on current time when `generatedAt` is absent.

The returned HTML always ends with a single trailing newline.

HTML rendering escapes record text before embedding it in the document. It is a
visual view for humans and LLM judges, not a machine-readable data API. ADR
0096 owns the visual report layout and content contract.

## Markdown Examples

An empty active project named `Empty Report Project` with id
`project_report_generation_empty`, repository path
`/tmp/report-generation-empty`, goal `Study empty report generation.`, created
by display name `Scott`, and created at `2026-05-13T12:00:00.000Z` renders
exactly:

```text
# Project Report: Empty Report Project

- Project: project_report_generation_empty
- Status: active
- Repository: /tmp/report-generation-empty
- Created: 2026-05-13T12:00:00.000Z
- Created by: Scott

## Goal

Study empty report generation.

## Project Attachments

Comments

None.

Events

None.

Artifacts

None.

Reports

None.

## Tasks

None.
```

A populated report should preserve record ids in attachment and evidence lines.
Representative lines:

```text
- 2026-05-13T12:07:00.000Z Researcher 1 (comment_1): Project comment body.
- 2026-05-13T12:08:00.000Z human/scott (event_1): Task moved into progress.
- measurement_1 r1 latency_ms: 42 ms
- review_1 r1 changes_requested by Reviewer 1
```

## Attachment Rendering

Every target attachment block uses these subsections in this order:

```text
Comments
Events
Artifacts
Reports
```

Empty subsections render `None.`.

Comment lines:

```text
- <createdAt> <actor-label> (<id>): <bodyMarkdown>
```

Event lines:

```text
- <createdAt> <actor-label> (<id>): <summaryMarkdown>
  <bodyMarkdown>                         only when bodyMarkdown is present
```

Artifact lines:

```text
- <title> (<id>) <uri>
  <summaryMarkdown>
  mediaType=<mediaType> byteSize=<byteSize> sha256=<sha256>
```

The metadata line is included only when at least one of `mediaType`,
`byteSize`, or `sha256` is present, and it includes only present fields in that
order.

Report lines:

```text
- <title> (<id>) generated by <actor-label>
  <bodyMarkdown>
```

## Task Rendering

Each task renders:

```text
### Task: <task.title> (<task.id>)

- Status: <task.status>
- Created: <task.metadata.createdAt>
- Created by: <actor-label>
- Assigned to: <actor-label>             only when assignedTo is present

<task.bodyMarkdown>

#### Task Attachments

<target attachments>

#### Experiments

<experiment sections or None.>
```

## Experiment Rendering

Each experiment renders:

```text
##### Experiment: <experiment.title> (<experiment.id>)

- Status: <experiment.status>
- Revision: <experiment.revisionNumber>
- Created: <experiment.metadata.createdAt>
- Created by: <actor-label>
- Assigned to: <actor-label>             only when assignedTo is present
- Base ref: <experiment.baseRef>          only when baseRef is present
- Branch: <experiment.branchName>         only when branchName is present
- Worktree: <experiment.worktreePath>     only when worktreePath is present

<experiment.summaryMarkdown>

###### Measurements

<measurement sections or None.>

###### Reviews

<review sections or None.>

###### Experiment Attachments

<target attachments>
```

Measurement lines:

```text
- <id> r<revisionNumber> <metricName>: <numericValue><space><unit>
  <summaryMarkdown>
  <detailsMarkdown>                      only when detailsMarkdown is present
```

When `unit` is absent, the numeric value is rendered without the extra space.

Review lines:

```text
- <id> r<revisionNumber> <decision> by <actor-label>
  <bodyMarkdown>
```

Measurements and reviews each have their own target attachments rendered under
their line only when any of their attachment arrays are non-empty. Those nested
attachment headings use:

```text
  Attachments:
```

followed by indented attachment subsections.

## Generate Convenience Function

`generateProjectReportMarkdown` calls `collectProjectReportSnapshot` and then
`renderProjectReportMarkdown`.

It returns Markdown only. It does not create a `ReportRecord`. A caller that
wants durable storage should pass the returned body to `createReportAction` or
the `situ reports create` CLI command.

## Tests

Add report generation tests covering:

- missing project returns `NotFoundError` with the documented message
- project experiment/task mismatches return `ConflictError` with the documented
  message
- snapshot collection includes project, task, experiment, measurement, review,
  and target attachments
- experiments are nested under their task
- notifications are not included
- rendering an empty project produces stable Markdown with `None.` task output
- rendering a populated snapshot includes project metadata, task body,
  experiment worktree fields, measurement details, review body, and attachment
  lines
- `generatedAt` is included only when provided
- `generateProjectReportMarkdown` produces the same output as collecting then
  rendering
- generation leaves every primitive table count unchanged

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not add report create side effects, report CLI commands, report file
writing, artifact writing, PDF generation, HTML rendering, command execution,
project/task/experiment movement, review decisions, measurements, comments,
events, notifications, scheduler behavior, agent runtime behavior, workers, or
leases in this ADR.

Do not create a parallel report schema or repository in `src/reports/`. Durable
report records stay in `@situ/reports`; this module only collects and renders.

## Consequences

Local agents get a deterministic way to summarize Situ records:

```text
collect snapshot
  -> render Markdown
  -> optionally create a report record through the existing report primitive
```

Report generation remains a human-like primitive action over visible records,
not a hidden workflow engine.
