export const createMeasurementsTableStatement = `
CREATE TABLE IF NOT EXISTS measurements (
  id TEXT PRIMARY KEY,
  baseline_id TEXT REFERENCES baselines(id) ON DELETE CASCADE,
  experiment_id TEXT REFERENCES experiments(id) ON DELETE CASCADE,
  revision_number INTEGER CHECK (
    revision_number IS NULL
    OR (
      revision_number >= 1
      AND revision_number = CAST(revision_number AS INTEGER)
    )
  ),
  metric_name TEXT NOT NULL,
  numeric_value REAL NOT NULL,
  unit TEXT,
  summary_markdown TEXT NOT NULL,
  details_markdown TEXT,
  measured_by_kind TEXT NOT NULL,
  measured_by_id TEXT NOT NULL,
  measured_by_display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (
      baseline_id IS NOT NULL
      AND experiment_id IS NULL
      AND revision_number IS NULL
    )
    OR (
      baseline_id IS NULL
      AND experiment_id IS NOT NULL
      AND revision_number IS NOT NULL
    )
  )
);
`;

export const createMeasurementsBaselineIdIndexStatement = `
CREATE INDEX IF NOT EXISTS measurements_baseline_id_idx
  ON measurements (baseline_id);
`;

export const createMeasurementsExperimentIdIndexStatement = `
CREATE INDEX IF NOT EXISTS measurements_experiment_id_idx
  ON measurements (experiment_id);
`;

export const createMeasurementsExperimentRevisionIndexStatement = `
CREATE INDEX IF NOT EXISTS measurements_experiment_revision_idx
  ON measurements (experiment_id, revision_number);
`;

export const createMeasurementsMetricNameIndexStatement = `
CREATE INDEX IF NOT EXISTS measurements_metric_name_idx
  ON measurements (metric_name);
`;

export const createMeasurementsCreatedAtIndexStatement = `
CREATE INDEX IF NOT EXISTS measurements_created_at_idx
  ON measurements (created_at);
`;

export const measurementsSchemaFragment = {
  packageName: "measurements",
  statements: [
    createMeasurementsTableStatement,
    createMeasurementsBaselineIdIndexStatement,
    createMeasurementsExperimentIdIndexStatement,
    createMeasurementsExperimentRevisionIndexStatement,
    createMeasurementsMetricNameIndexStatement,
    createMeasurementsCreatedAtIndexStatement,
  ],
} as const;

export type MeasurementsSchemaFragment = typeof measurementsSchemaFragment;
