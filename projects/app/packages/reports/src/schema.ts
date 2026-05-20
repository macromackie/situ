export const createReportsTableStatement = `
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  generated_by_kind TEXT NOT NULL,
  generated_by_id TEXT NOT NULL,
  generated_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const createReportsProjectIdIndexStatement = `
CREATE INDEX IF NOT EXISTS reports_project_id_idx
  ON reports (project_id);
`;

export const createReportsTargetIndexStatement = `
CREATE INDEX IF NOT EXISTS reports_target_idx
  ON reports (target_kind, target_id);
`;

export const createReportsGeneratedByIndexStatement = `
CREATE INDEX IF NOT EXISTS reports_generated_by_idx
  ON reports (generated_by_kind, generated_by_id);
`;

export const createReportsCreatedAtIndexStatement = `
CREATE INDEX IF NOT EXISTS reports_created_at_idx
  ON reports (created_at);
`;

export const reportsSchemaFragment = {
  packageName: "reports",
  statements: [
    createReportsTableStatement,
    createReportsProjectIdIndexStatement,
    createReportsTargetIndexStatement,
    createReportsGeneratedByIndexStatement,
    createReportsCreatedAtIndexStatement,
  ],
} as const;

export type ReportsSchemaFragment = typeof reportsSchemaFragment;
