export const createExperimentsTableStatement = `
CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary_markdown TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'planned',
      'running',
      'ready_for_review',
      'accepted',
      'rejected',
      'abandoned'
    )
  ),
  revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
  base_ref TEXT,
  branch_name TEXT,
  worktree_path TEXT,
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

export const createExperimentsProjectIdIndexStatement = `
CREATE INDEX IF NOT EXISTS experiments_project_id_idx
  ON experiments (project_id);
`;

export const createExperimentsTaskIdIndexStatement = `
CREATE INDEX IF NOT EXISTS experiments_task_id_idx
  ON experiments (task_id);
`;

export const createExperimentsStatusIndexStatement = `
CREATE INDEX IF NOT EXISTS experiments_status_idx
  ON experiments (status);
`;

export const createExperimentsAssignedToIdIndexStatement = `
CREATE INDEX IF NOT EXISTS experiments_assigned_to_id_idx
  ON experiments (assigned_to_id);
`;

export const createExperimentsTaskStatusIndexStatement = `
CREATE INDEX IF NOT EXISTS experiments_task_status_idx
  ON experiments (task_id, status);
`;

export const experimentsSchemaFragment = {
  packageName: "experiments",
  statements: [
    createExperimentsTableStatement,
    createExperimentsProjectIdIndexStatement,
    createExperimentsTaskIdIndexStatement,
    createExperimentsStatusIndexStatement,
    createExperimentsAssignedToIdIndexStatement,
    createExperimentsTaskStatusIndexStatement,
  ],
} as const;

export type ExperimentsSchemaFragment = typeof experimentsSchemaFragment;
