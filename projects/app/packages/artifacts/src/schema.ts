export const createArtifactsTableStatement = `
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary_markdown TEXT NOT NULL,
  uri TEXT NOT NULL,
  media_type TEXT,
  byte_size INTEGER CHECK (
    byte_size IS NULL
    OR (byte_size >= 0 AND byte_size = CAST(byte_size AS INTEGER))
  ),
  sha256 TEXT,
  created_by_kind TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const createArtifactsTargetIndexStatement = `
CREATE INDEX IF NOT EXISTS artifacts_target_idx
  ON artifacts (target_kind, target_id);
`;

export const createArtifactsCreatedByIndexStatement = `
CREATE INDEX IF NOT EXISTS artifacts_created_by_idx
  ON artifacts (created_by_kind, created_by_id);
`;

export const createArtifactsCreatedAtIndexStatement = `
CREATE INDEX IF NOT EXISTS artifacts_created_at_idx
  ON artifacts (created_at);
`;

export const artifactsSchemaFragment = {
  packageName: "artifacts",
  statements: [
    createArtifactsTableStatement,
    createArtifactsTargetIndexStatement,
    createArtifactsCreatedByIndexStatement,
    createArtifactsCreatedAtIndexStatement,
  ],
} as const;

export type ArtifactsSchemaFragment = typeof artifactsSchemaFragment;
