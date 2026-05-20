export const createReviewsTableStatement = `
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL CHECK (
    revision_number >= 1
    AND revision_number = CAST(revision_number AS INTEGER)
  ),
  decision TEXT NOT NULL CHECK (
    decision IN ('approved', 'changes_requested', 'rejected', 'commented')
  ),
  body_markdown TEXT NOT NULL,
  reviewer_kind TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  reviewer_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const createReviewsExperimentIdIndexStatement = `
CREATE INDEX IF NOT EXISTS reviews_experiment_id_idx
  ON reviews (experiment_id);
`;

export const createReviewsExperimentRevisionIndexStatement = `
CREATE INDEX IF NOT EXISTS reviews_experiment_revision_idx
  ON reviews (experiment_id, revision_number);
`;

export const createReviewsDecisionIndexStatement = `
CREATE INDEX IF NOT EXISTS reviews_decision_idx
  ON reviews (decision);
`;

export const createReviewsReviewerIndexStatement = `
CREATE INDEX IF NOT EXISTS reviews_reviewer_idx
  ON reviews (reviewer_kind, reviewer_id);
`;

export const createReviewsCreatedAtIndexStatement = `
CREATE INDEX IF NOT EXISTS reviews_created_at_idx
  ON reviews (created_at);
`;

export const reviewsSchemaFragment = {
  packageName: "reviews",
  statements: [
    createReviewsTableStatement,
    createReviewsExperimentIdIndexStatement,
    createReviewsExperimentRevisionIndexStatement,
    createReviewsDecisionIndexStatement,
    createReviewsReviewerIndexStatement,
    createReviewsCreatedAtIndexStatement,
  ],
} as const;

export type ReviewsSchemaFragment = typeof reviewsSchemaFragment;
