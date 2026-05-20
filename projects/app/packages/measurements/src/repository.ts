import type { Database } from "bun:sqlite";

import type { ActorRef, SituId } from "@situ/common";
import { ConflictError, ValidationError } from "@situ/errors";

import { type CreateMeasurementRecordInput, createMeasurementRecord } from "./mutations.js";
import type { MeasurementRecord } from "./types.js";

const defaultRecentMeasurementsLimit = 50;
const maxRecentMeasurementsLimit = 500;

export type CreateMeasurementRepositoryInput = {
  readonly database: Database;
};

export type CreateMeasurementInput = Omit<CreateMeasurementRecordInput, "id"> & {
  readonly id?: SituId<"measurement">;
};

export type ListMeasurementsForExperimentInput = {
  readonly experimentId: SituId<"experiment">;
  readonly revisionNumber?: number;
  readonly metricName?: string;
};

export type ListMeasurementsForBaselineInput = {
  readonly baselineId: SituId<"baseline">;
  readonly metricName?: string;
};

export type ListRecentMeasurementsInput = {
  readonly limit?: number;
};

export type MeasurementRepository = {
  readonly create: (input: CreateMeasurementInput) => MeasurementRecord;
  readonly getById: (input: {
    readonly id: SituId<"measurement">;
  }) => MeasurementRecord | undefined;
  readonly listForExperiment: (
    input: ListMeasurementsForExperimentInput,
  ) => readonly MeasurementRecord[];
  readonly listForBaseline: (
    input: ListMeasurementsForBaselineInput,
  ) => readonly MeasurementRecord[];
  readonly listAll: () => readonly MeasurementRecord[];
  readonly listRecent: (input?: ListRecentMeasurementsInput) => readonly MeasurementRecord[];
};

type MeasurementRow = {
  readonly id: string;
  readonly baseline_id: string | null;
  readonly experiment_id: string | null;
  readonly revision_number: number | null;
  readonly metric_name: string;
  readonly numeric_value: number;
  readonly unit: string | null;
  readonly summary_markdown: string;
  readonly details_markdown: string | null;
  readonly measured_by_kind: ActorRef["actorKind"];
  readonly measured_by_id: string;
  readonly measured_by_display_name: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

/**
 * Creates a SQLite-backed measurement repository.
 */
export function createMeasurementRepository(
  input: CreateMeasurementRepositoryInput,
): MeasurementRepository {
  return {
    create: (createInput) =>
      createMeasurement({
        database: input.database,
        input: createInput,
      }),
    getById: (getInput) =>
      getMeasurementById({
        database: input.database,
        id: getInput.id,
      }),
    listForExperiment: (listInput) =>
      listMeasurementsForExperiment({
        database: input.database,
        input: listInput,
      }),
    listForBaseline: (listInput) =>
      listMeasurementsForBaseline({
        database: input.database,
        input: listInput,
      }),
    listAll: () =>
      listAllMeasurements({
        database: input.database,
      }),
    listRecent: (listInput) =>
      listRecentMeasurements({
        database: input.database,
        input: listInput,
      }),
  };
}

type CreateMeasurementRepositoryMethodInput = {
  readonly database: Database;
  readonly input: CreateMeasurementInput;
};

function createMeasurement(input: CreateMeasurementRepositoryMethodInput): MeasurementRecord {
  const measurement = createMeasurementRecord(input.input);

  try {
    input.database
      .query(
        `
INSERT INTO measurements (
  id,
  baseline_id,
  experiment_id,
  revision_number,
  metric_name,
  numeric_value,
  unit,
  summary_markdown,
  details_markdown,
  measured_by_kind,
  measured_by_id,
  measured_by_display_name,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        measurement.id,
        measurement.baselineId ?? null,
        measurement.experimentId ?? null,
        measurement.revisionNumber ?? null,
        measurement.metricName,
        measurement.numericValue,
        measurement.unit ?? null,
        measurement.summaryMarkdown,
        measurement.detailsMarkdown ?? null,
        measurement.measuredBy.actorKind,
        measurement.measuredBy.actorId,
        measurement.measuredBy.displayName ?? null,
        measurement.metadata.createdAt,
        measurement.metadata.updatedAt,
      );
  } catch (error) {
    if (isCreateConflictError(error)) {
      throw new ConflictError({
        message: "Measurement could not be created because it conflicts with existing state.",
        details: {
          id: measurement.id,
          baselineId: measurement.baselineId,
          experimentId: measurement.experimentId,
        },
      });
    }

    throw error;
  }

  return getPersistedMeasurement({
    database: input.database,
    id: measurement.id,
  });
}

type GetMeasurementByIdInput = {
  readonly database: Database;
  readonly id: SituId<"measurement">;
};

function getMeasurementById(input: GetMeasurementByIdInput): MeasurementRecord | undefined {
  const row = input.database
    .query<MeasurementRow, [string]>("SELECT * FROM measurements WHERE id = ?")
    .get(input.id);

  if (row === null) {
    return undefined;
  }

  return measurementFromRow({ row });
}

type ListMeasurementsForExperimentRepositoryInput = {
  readonly database: Database;
  readonly input: ListMeasurementsForExperimentInput;
};

function listMeasurementsForExperiment(
  input: ListMeasurementsForExperimentRepositoryInput,
): readonly MeasurementRecord[] {
  const query = buildListMeasurementsForExperimentQuery({ input: input.input });
  const rows = input.database.query<MeasurementRow, QueryArg[]>(query.sql).all(...query.args);

  return rows.map((row) => measurementFromRow({ row }));
}

type ListMeasurementsForBaselineRepositoryInput = {
  readonly database: Database;
  readonly input: ListMeasurementsForBaselineInput;
};

function listMeasurementsForBaseline(
  input: ListMeasurementsForBaselineRepositoryInput,
): readonly MeasurementRecord[] {
  const query = buildListMeasurementsForBaselineQuery({ input: input.input });
  const rows = input.database.query<MeasurementRow, QueryArg[]>(query.sql).all(...query.args);

  return rows.map((row) => measurementFromRow({ row }));
}

type ListAllMeasurementsRepositoryInput = {
  readonly database: Database;
};

function listAllMeasurements(
  input: ListAllMeasurementsRepositoryInput,
): readonly MeasurementRecord[] {
  const rows = input.database
    .query<MeasurementRow, []>(
      `
SELECT *
FROM measurements
ORDER BY created_at ASC, id ASC
`,
    )
    .all();

  return rows.map((row) => measurementFromRow({ row }));
}

type QueryArg = string | number;

type ListMeasurementsForExperimentQuery = {
  readonly sql: string;
  readonly args: QueryArg[];
};

type ListMeasurementsForBaselineQuery = {
  readonly sql: string;
  readonly args: QueryArg[];
};

type BuildListMeasurementsForExperimentQueryInput = {
  readonly input: ListMeasurementsForExperimentInput;
};

function buildListMeasurementsForExperimentQuery(
  input: BuildListMeasurementsForExperimentQueryInput,
): ListMeasurementsForExperimentQuery {
  const clauses = ["experiment_id = ?"];
  const args: QueryArg[] = [input.input.experimentId];

  if (input.input.revisionNumber !== undefined) {
    clauses.push("revision_number = ?");
    args.push(
      normalizeRevisionNumberFilter({
        revisionNumber: input.input.revisionNumber,
      }),
    );
  }

  if (input.input.metricName !== undefined) {
    clauses.push("metric_name = ?");
    args.push(
      normalizeMetricNameFilter({
        metricName: input.input.metricName,
      }),
    );
  }

  return {
    sql: `
SELECT *
FROM measurements
WHERE ${clauses.join(" AND ")}
ORDER BY created_at ASC, id ASC
`,
    args,
  };
}

type BuildListMeasurementsForBaselineQueryInput = {
  readonly input: ListMeasurementsForBaselineInput;
};

function buildListMeasurementsForBaselineQuery(
  input: BuildListMeasurementsForBaselineQueryInput,
): ListMeasurementsForBaselineQuery {
  const clauses = ["baseline_id = ?"];
  const args: QueryArg[] = [input.input.baselineId];

  if (input.input.metricName !== undefined) {
    clauses.push("metric_name = ?");
    args.push(
      normalizeMetricNameFilter({
        metricName: input.input.metricName,
      }),
    );
  }

  return {
    sql: `
SELECT *
FROM measurements
WHERE ${clauses.join(" AND ")}
ORDER BY created_at ASC, id ASC
`,
    args,
  };
}

type ListRecentMeasurementsRepositoryInput = {
  readonly database: Database;
  readonly input?: ListRecentMeasurementsInput;
};

function listRecentMeasurements(
  input: ListRecentMeasurementsRepositoryInput,
): readonly MeasurementRecord[] {
  const limit = normalizeRecentMeasurementsLimit({
    limit: input.input?.limit,
  });
  const rows = input.database
    .query<MeasurementRow, [number]>(
      `
SELECT *
FROM measurements
ORDER BY created_at DESC, id DESC
LIMIT ?
`,
    )
    .all(limit);

  return rows.map((row) => measurementFromRow({ row }));
}

type NormalizeRevisionNumberFilterInput = {
  readonly revisionNumber: number;
};

function normalizeRevisionNumberFilter(input: NormalizeRevisionNumberFilterInput): number {
  if (Number.isInteger(input.revisionNumber) && input.revisionNumber > 0) {
    return input.revisionNumber;
  }

  throw new ValidationError({
    message: "Expected a positive integer revision number.",
    details: { field: "revisionNumber" },
  });
}

type NormalizeMetricNameFilterInput = {
  readonly metricName: string;
};

function normalizeMetricNameFilter(input: NormalizeMetricNameFilterInput): string {
  const metricName = input.metricName.trim();

  if (metricName.length > 0) {
    return metricName;
  }

  throw new ValidationError({
    message: "Expected a non-empty metric name.",
    details: { field: "metricName" },
  });
}

type NormalizeRecentMeasurementsLimitInput = {
  readonly limit?: number;
};

function normalizeRecentMeasurementsLimit(input: NormalizeRecentMeasurementsLimitInput): number {
  if (input.limit === undefined) {
    return defaultRecentMeasurementsLimit;
  }

  if (!Number.isFinite(input.limit) || !Number.isInteger(input.limit) || input.limit <= 0) {
    throw new ValidationError({
      message: "Expected a positive integer measurement limit.",
      details: { field: "limit" },
    });
  }

  return Math.min(input.limit, maxRecentMeasurementsLimit);
}

type GetPersistedMeasurementInput = {
  readonly database: Database;
  readonly id: SituId<"measurement">;
};

function getPersistedMeasurement(input: GetPersistedMeasurementInput): MeasurementRecord {
  const measurement = getMeasurementById(input);

  if (measurement !== undefined) {
    return measurement;
  }

  throw new Error("Measurement was not found after persistence.");
}

type MeasurementFromRowInput = {
  readonly row: MeasurementRow;
};

function measurementFromRow(input: MeasurementFromRowInput): MeasurementRecord {
  return {
    id: input.row.id as SituId<"measurement">,
    baselineId: optionalBaselineIdFromRow(input.row.baseline_id),
    experimentId: optionalExperimentIdFromRow(input.row.experiment_id),
    revisionNumber: input.row.revision_number ?? undefined,
    metricName: input.row.metric_name,
    numericValue: input.row.numeric_value,
    unit: input.row.unit ?? undefined,
    summaryMarkdown: input.row.summary_markdown,
    detailsMarkdown: input.row.details_markdown ?? undefined,
    measuredBy: {
      actorKind: input.row.measured_by_kind,
      actorId: input.row.measured_by_id,
      displayName: input.row.measured_by_display_name ?? undefined,
    },
    metadata: {
      createdAt: input.row.created_at,
      updatedAt: input.row.updated_at,
    },
  };
}

function optionalBaselineIdFromRow(value: string | null): SituId<"baseline"> | undefined {
  if (value === null) {
    return undefined;
  }

  return value as SituId<"baseline">;
}

function optionalExperimentIdFromRow(value: string | null): SituId<"experiment"> | undefined {
  if (value === null) {
    return undefined;
  }

  return value as SituId<"experiment">;
}

function isCreateConflictError(error: unknown): boolean {
  return isDuplicateMeasurementIdError(error) || isForeignKeyConstraintError(error);
}

function isDuplicateMeasurementIdError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" &&
    error.message === "UNIQUE constraint failed: measurements.id"
  );
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_FOREIGNKEY";
}
