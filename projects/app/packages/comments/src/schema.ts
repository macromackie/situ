export const createCommentsTableStatement = `
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  author_kind TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const createCommentsTargetIndexStatement = `
CREATE INDEX IF NOT EXISTS comments_target_idx
  ON comments (target_kind, target_id);
`;

export const createCommentsAuthorIdIndexStatement = `
CREATE INDEX IF NOT EXISTS comments_author_id_idx
  ON comments (author_id);
`;

export const commentsSchemaFragment = {
  packageName: "comments",
  statements: [
    createCommentsTableStatement,
    createCommentsTargetIndexStatement,
    createCommentsAuthorIdIndexStatement,
  ],
} as const;

export type CommentsSchemaFragment = typeof commentsSchemaFragment;
