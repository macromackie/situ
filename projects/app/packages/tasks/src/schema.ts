export const createTasksTableStatement = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('triage', 'backlog', 'in_progress', 'in_review', 'done', 'canceled')
  ),
  assigned_to_kind TEXT,
  assigned_to_id TEXT,
  assigned_to_display_name TEXT,
  created_by_kind TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (assigned_to_kind IS NULL AND assigned_to_id IS NULL AND assigned_to_display_name IS NULL)
    OR (assigned_to_kind IS NOT NULL AND assigned_to_id IS NOT NULL)
  )
);
`;

export const createTasksProjectIdIndexStatement = `
CREATE INDEX IF NOT EXISTS tasks_project_id_idx
  ON tasks (project_id);
`;

export const createTasksStatusIndexStatement = `
CREATE INDEX IF NOT EXISTS tasks_status_idx
  ON tasks (status);
`;

export const createTasksAssignedToIdIndexStatement = `
CREATE INDEX IF NOT EXISTS tasks_assigned_to_id_idx
  ON tasks (assigned_to_id);
`;

export const createTasksProjectStatusIndexStatement = `
CREATE INDEX IF NOT EXISTS tasks_project_status_idx
  ON tasks (project_id, status);
`;

export const tasksSchemaFragment = {
  packageName: "tasks",
  statements: [
    createTasksTableStatement,
    createTasksProjectIdIndexStatement,
    createTasksStatusIndexStatement,
    createTasksAssignedToIdIndexStatement,
    createTasksProjectStatusIndexStatement,
  ],
} as const;

export type TasksSchemaFragment = typeof tasksSchemaFragment;
