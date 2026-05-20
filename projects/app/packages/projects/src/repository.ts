import type { Database } from "bun:sqlite";

import type { IsoTimestamp, SituId } from "@situ/common";
import { ConflictError, NotFoundError } from "@situ/errors";

import {
  type CreateProjectRecordInput,
  archiveProjectRecord,
  createProjectRecord,
} from "./mutations.js";
import type { ProjectRecord, ProjectStatus } from "./types.js";

export type CreateProjectRepositoryInput = {
  readonly database: Database;
};

export type ListProjectsInput = {
  readonly status?: ProjectStatus;
  readonly repositoryPath?: string;
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

type ProjectRow = {
  readonly id: string;
  readonly name: string;
  readonly repository_path: string;
  readonly goal_markdown: string;
  readonly status: ProjectStatus;
  readonly created_by_kind: ProjectRecord["createdBy"]["actorKind"];
  readonly created_by_id: string;
  readonly created_by_display_name: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

/**
 * Creates a SQLite-backed project repository.
 */
export function createProjectRepository(input: CreateProjectRepositoryInput): ProjectRepository {
  return {
    create: (createInput) => createProject({ database: input.database, input: createInput }),
    getById: (getInput) => getProjectById({ database: input.database, id: getInput.id }),
    list: (listInput) => listProjects({ database: input.database, input: listInput }),
    archive: (archiveInput) => archiveProject({ database: input.database, input: archiveInput }),
  };
}

type CreateProjectRepositoryMethodInput = {
  readonly database: Database;
  readonly input: CreateProjectInput;
};

function createProject(input: CreateProjectRepositoryMethodInput): ProjectRecord {
  const project = createProjectRecord(input.input);

  try {
    input.database
      .query(
        `
INSERT INTO projects (
  id,
  name,
  repository_path,
  goal_markdown,
  status,
  created_by_kind,
  created_by_id,
  created_by_display_name,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        project.id,
        project.name,
        project.repositoryPath,
        project.goalMarkdown,
        project.status,
        project.createdBy.actorKind,
        project.createdBy.actorId,
        project.createdBy.displayName ?? null,
        project.metadata.createdAt,
        project.metadata.updatedAt,
      );
  } catch (error) {
    if (isSqliteConstraintError(error)) {
      throw new ConflictError({
        message: "Project already exists.",
        details: { id: project.id },
      });
    }

    throw error;
  }

  return getPersistedProject({
    database: input.database,
    id: project.id,
  });
}

type GetProjectByIdInput = {
  readonly database: Database;
  readonly id: SituId<"project">;
};

function getProjectById(input: GetProjectByIdInput): ProjectRecord | undefined {
  const row = input.database
    .query<ProjectRow, [string]>("SELECT * FROM projects WHERE id = ?")
    .get(input.id);

  if (row === null) {
    return undefined;
  }

  return projectFromRow({ row });
}

type ListProjectsRepositoryInput = {
  readonly database: Database;
  readonly input?: ListProjectsInput;
};

function listProjects(input: ListProjectsRepositoryInput): readonly ProjectRecord[] {
  const where: string[] = [];
  const values: string[] = [];

  if (input.input?.status !== undefined) {
    where.push("status = ?");
    values.push(input.input.status);
  }

  if (input.input?.repositoryPath !== undefined) {
    where.push("repository_path = ?");
    values.push(input.input.repositoryPath);
  }

  const whereClause = where.length === 0 ? "" : ` WHERE ${where.join(" AND ")}`;
  const rows = input.database
    .query<ProjectRow, string[]>(
      `SELECT * FROM projects${whereClause} ORDER BY created_at ASC, id ASC`,
    )
    .all(...values);

  return rows.map((row) => projectFromRow({ row }));
}

type ArchiveProjectRepositoryInput = {
  readonly database: Database;
  readonly input: ArchiveProjectInput;
};

function archiveProject(input: ArchiveProjectRepositoryInput): ProjectRecord {
  const existingProject = getProjectById({
    database: input.database,
    id: input.input.id,
  });

  if (existingProject === undefined) {
    throw new NotFoundError({
      message: "Project was not found.",
      details: { id: input.input.id },
    });
  }

  const archivedProject = archiveProjectRecord({
    project: existingProject,
    now: input.input.now,
  });

  input.database
    .query("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?")
    .run(archivedProject.status, archivedProject.metadata.updatedAt, archivedProject.id);

  return getPersistedProject({
    database: input.database,
    id: archivedProject.id,
  });
}

type GetPersistedProjectInput = {
  readonly database: Database;
  readonly id: SituId<"project">;
};

function getPersistedProject(input: GetPersistedProjectInput): ProjectRecord {
  const project = getProjectById(input);

  if (project !== undefined) {
    return project;
  }

  throw new NotFoundError({
    message: "Project was not found after persistence.",
    details: { id: input.id },
  });
}

type ProjectFromRowInput = {
  readonly row: ProjectRow;
};

function projectFromRow(input: ProjectFromRowInput): ProjectRecord {
  return {
    id: input.row.id as SituId<"project">,
    name: input.row.name,
    repositoryPath: input.row.repository_path,
    goalMarkdown: input.row.goal_markdown,
    status: input.row.status,
    createdBy: {
      actorKind: input.row.created_by_kind,
      actorId: input.row.created_by_id,
      displayName: input.row.created_by_display_name ?? undefined,
    },
    metadata: {
      createdAt: input.row.created_at,
      updatedAt: input.row.updated_at,
    },
  };
}

function isSqliteConstraintError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && String(error.code).startsWith("SQLITE_CONSTRAINT")
  );
}
