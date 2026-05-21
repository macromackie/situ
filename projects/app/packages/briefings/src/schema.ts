export const createBriefingsTableStatement = `
CREATE TABLE IF NOT EXISTS briefings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  stage TEXT NOT NULL,
  assessment TEXT NOT NULL,
  headline_markdown TEXT NOT NULL,
  blocks_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  authored_by_kind TEXT NOT NULL,
  authored_by_id TEXT NOT NULL,
  authored_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const createBriefingsProjectIdIndexStatement = `
CREATE INDEX IF NOT EXISTS briefings_project_id_idx
  ON briefings (project_id);
`;

export const createBriefingsAuthoredByIndexStatement = `
CREATE INDEX IF NOT EXISTS briefings_authored_by_idx
  ON briefings (authored_by_kind, authored_by_id);
`;

export const createBriefingsCreatedAtIndexStatement = `
CREATE INDEX IF NOT EXISTS briefings_created_at_idx
  ON briefings (created_at);
`;

export const briefingsSchemaFragment = {
  packageName: "briefings",
  statements: [
    createBriefingsTableStatement,
    createBriefingsProjectIdIndexStatement,
    createBriefingsAuthoredByIndexStatement,
    createBriefingsCreatedAtIndexStatement,
  ],
} as const;

export type BriefingsSchemaFragment = typeof briefingsSchemaFragment;
