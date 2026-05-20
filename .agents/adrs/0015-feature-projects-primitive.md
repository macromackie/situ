---
status: active
category: feature
created: 2026-05-13
---

# 0015. Feature: Projects Primitive

## Context

Situ needs a small durable record that says what repository is being improved
and what the current research goal is. This record is the top-level container
for tasks, experiments, reviews, measurements, artifacts, reports, events, and
notifications.

Projects should feel like a human-readable Linear project, not a hidden runtime
workflow. A local agent can read a project, understand the goal, and then work
through ordinary visible records.

## Decision

The `@situ/projects` primitive package owns project records, project schema,
project repository functions, and project-local mutation helpers.

The app database composes the project schema fragment. App actions will later
compose project repository calls with events, tasks, and notifications.

## Record Shape

A project record is:

```ts
export type ProjectStatus = "active" | "archived";

export type ProjectRecord = {
  readonly id: SituId<"project">;
  readonly name: string;
  readonly repositoryPath: string;
  readonly goalMarkdown: string;
  readonly status: ProjectStatus;
  readonly createdBy: ActorRef;
  readonly metadata: SyncMetadata;
};
```

Field meaning:

- `id`: Situ-owned project id
- `name`: short human-readable label
- `repositoryPath`: absolute path to the repository being improved
- `goalMarkdown`: Markdown description of the autoresearch goal
- `status`: whether the project is active or archived
- `createdBy`: visible attribution for the actor that created the project
- `metadata`: shared creation/update timestamps

`repositoryPath` must be absolute. `name` and `goalMarkdown` must be non-empty
after trimming whitespace. The stored values should use the trimmed `name` and
trimmed `goalMarkdown`.

## Schema

The project schema fragment creates a `projects` table:

```sql
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repository_path TEXT NOT NULL,
  goal_markdown TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  created_by_kind TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

It also creates these indexes:

```sql
CREATE INDEX IF NOT EXISTS projects_repository_path_idx
  ON projects (repository_path);

CREATE INDEX IF NOT EXISTS projects_status_idx
  ON projects (status);
```

The package schema fragment must expose those statements as one SQL statement
per `statements` entry.

The exact export name is:

```ts
export const projectsSchemaFragment = {
  packageName: "projects",
  statements: [
    createProjectsTableStatement,
    createProjectsRepositoryPathIndexStatement,
    createProjectsStatusIndexStatement,
  ],
} as const;
```

## Mutation Helpers

The package exports pure record helpers:

```ts
export type CreateProjectRecordInput = {
  readonly id?: SituId<"project">;
  readonly name: string;
  readonly repositoryPath: string;
  readonly goalMarkdown: string;
  readonly createdBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export type ArchiveProjectRecordInput = {
  readonly project: ProjectRecord;
  readonly now?: IsoTimestamp;
};

export function createProjectRecord(input: CreateProjectRecordInput): ProjectRecord;

export function archiveProjectRecord(input: ArchiveProjectRecordInput): ProjectRecord;
```

`createProjectRecord` generates a project id when one is not provided, validates
the record fields, sets `status` to `active`, and sets `createdAt` and
`updatedAt` to the same timestamp.

Generated ids use `createId({ prefix: "project" })` from `@situ/common`.
Default timestamps use `createSyncMetadata()` from `@situ/common`. Provided
`now` values are passed to `createSyncMetadata({ now })` or
`touchSyncMetadata({ metadata, now })` so they are validated and normalized.

`repositoryPath` is trimmed before validation and storage. Absolute path
validation uses Node's `path.isAbsolute`. Do not resolve relative paths into
absolute paths inside the project primitive.

`createdBy.actorKind` and `createdBy.actorId` must be non-empty strings after
trimming. `displayName`, when provided, must be non-empty after trimming. Stored
actor fields use trimmed values.

`archiveProjectRecord` preserves all fields except `status` and `updatedAt`.
Archiving an already archived project is allowed and returns an archived project
with a fresh `updatedAt`.

Validation failures throw `ValidationError`.

## Repository

The package exports a SQLite repository:

```ts
export type CreateProjectRepositoryInput = {
  readonly database: Database;
};

export type ListProjectsInput = {
  readonly status?: ProjectStatus;
};

export type CreateProjectInput = Omit<CreateProjectRecordInput, "id"> & {
  readonly id?: SituId<"project">;
};

export type ArchiveProjectInput = {
  readonly id: SituId<"project">;
  readonly now?: IsoTimestamp;
};

export type ProjectRepository = {
  readonly create: (input: CreateProjectInput) => ProjectRecord;
  readonly getById: (input: { readonly id: SituId<"project"> }) => ProjectRecord | undefined;
  readonly list: (input?: ListProjectsInput) => readonly ProjectRecord[];
  readonly archive: (input: ArchiveProjectInput) => ProjectRecord;
};

export function createProjectRepository(input: CreateProjectRepositoryInput): ProjectRepository;
```

The repository accepts a `Database` from the caller. It must not open its own
database connection.

`create` inserts the project and returns the stored record.

If `create` receives a duplicate id, it should throw `ConflictError`.

`getById` returns `undefined` when a project does not exist.

`list` returns projects ordered by `created_at ASC, id ASC`. When `status` is
provided, it filters by status.

`archive` throws `NotFoundError` when the project does not exist. Otherwise it
stores and returns the archived record.

Repository row mapping is:

- `id` maps to `ProjectRecord.id`
- `name` maps to `ProjectRecord.name`
- `repository_path` maps to `ProjectRecord.repositoryPath`
- `goal_markdown` maps to `ProjectRecord.goalMarkdown`
- `status` maps to `ProjectRecord.status`
- `created_by_kind` maps to `ProjectRecord.createdBy.actorKind`
- `created_by_id` maps to `ProjectRecord.createdBy.actorId`
- `created_by_display_name` maps to `ProjectRecord.createdBy.displayName`
- `created_at` maps to `ProjectRecord.metadata.createdAt`
- `updated_at` maps to `ProjectRecord.metadata.updatedAt`

When `createdBy.displayName` is `undefined`, the repository stores SQL `NULL`.
When reading SQL `NULL`, the repository returns `displayName: undefined`.

Repository methods should return the mapped persisted row shape. `archive`
updates the row and then returns the mapped archived record.

## Boundaries

Do not add task, experiment, notification, or event behavior to the projects
package. Cross-primitive behavior belongs in app actions.

Do not add workflow statuses beyond `active` and `archived` unless a later ADR
decides that projects need richer lifecycle state.

Do not store agent runtime sessions, provider threads, workers, leases, or
scheduler state on projects.

## Consequences

The project primitive gives the rest of the app one obvious parent record while
remaining small enough for agents to inspect and change directly.

Later ADRs can add app actions and CLI commands that create projects through
this repository and then emit events or notifications around them.
