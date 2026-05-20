export const createProjectsTableStatement = `
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
`;

export const createProjectsRepositoryPathIndexStatement = `
CREATE INDEX IF NOT EXISTS projects_repository_path_idx
  ON projects (repository_path);
`;

export const createProjectsStatusIndexStatement = `
CREATE INDEX IF NOT EXISTS projects_status_idx
  ON projects (status);
`;

export const projectsSchemaFragment = {
  packageName: "projects",
  statements: [
    createProjectsTableStatement,
    createProjectsRepositoryPathIndexStatement,
    createProjectsStatusIndexStatement,
  ],
} as const;

export type ProjectsSchemaFragment = typeof projectsSchemaFragment;
