export const createBaselinesTableStatement = `
CREATE TABLE IF NOT EXISTS baselines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary_markdown TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('active', 'superseded', 'abandoned')
  ),
  created_by_kind TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const createBaselinesProjectIdIndexStatement = `
CREATE INDEX IF NOT EXISTS baselines_project_id_idx
  ON baselines (project_id);
`;

export const createBaselinesTaskIdIndexStatement = `
CREATE INDEX IF NOT EXISTS baselines_task_id_idx
  ON baselines (task_id);
`;

export const createBaselinesStatusIndexStatement = `
CREATE INDEX IF NOT EXISTS baselines_status_idx
  ON baselines (status);
`;

export const createBaselinesProjectStatusIndexStatement = `
CREATE INDEX IF NOT EXISTS baselines_project_status_idx
  ON baselines (project_id, status);
`;

export const baselinesSchemaFragment = {
  packageName: "baselines",
  statements: [
    createBaselinesTableStatement,
    createBaselinesProjectIdIndexStatement,
    createBaselinesTaskIdIndexStatement,
    createBaselinesStatusIndexStatement,
    createBaselinesProjectStatusIndexStatement,
  ],
} as const;

export type BaselinesSchemaFragment = typeof baselinesSchemaFragment;
