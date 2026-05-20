import type { Database } from "bun:sqlite";

import type { ActorRef, SituId, TargetRef } from "@situ/common";
import { ConflictError, ValidationError } from "@situ/errors";

import { type CreateReportRecordInput, createReportRecord } from "./mutations.js";
import type { ReportRecord } from "./types.js";

export type CreateReportRepositoryInput = {
  readonly database: Database;
};

export type CreateReportInput = Omit<CreateReportRecordInput, "id"> & {
  readonly id?: SituId<"report">;
};

export type ListReportsForProjectInput = {
  readonly projectId: SituId<"project">;
};

export type ListReportsForTargetInput = {
  readonly target: TargetRef;
};

export type ListRecentReportsInput = {
  readonly limit?: number;
};

export type ReportRepository = {
  readonly create: (input: CreateReportInput) => ReportRecord;
  readonly getById: (input: { readonly id: SituId<"report"> }) => ReportRecord | undefined;
  readonly listAll: () => readonly ReportRecord[];
  readonly listForProject: (input: ListReportsForProjectInput) => readonly ReportRecord[];
  readonly listForTarget: (input: ListReportsForTargetInput) => readonly ReportRecord[];
  readonly listRecent: (input?: ListRecentReportsInput) => readonly ReportRecord[];
};

type ReportRow = {
  readonly id: string;
  readonly project_id: string;
  readonly target_kind: TargetRef["targetKind"];
  readonly target_id: string;
  readonly title: string;
  readonly body_markdown: string;
  readonly generated_by_kind: ActorRef["actorKind"];
  readonly generated_by_id: string;
  readonly generated_by_display_name: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

/**
 * Creates a SQLite-backed report repository.
 */
export function createReportRepository(input: CreateReportRepositoryInput): ReportRepository {
  return {
    create: (createInput) => createReport({ database: input.database, input: createInput }),
    getById: (getInput) => getReportById({ database: input.database, id: getInput.id }),
    listAll: () => listAllReports({ database: input.database }),
    listForProject: (listInput) =>
      listReportsForProject({ database: input.database, input: listInput }),
    listForTarget: (listInput) =>
      listReportsForTarget({ database: input.database, input: listInput }),
    listRecent: (listInput) => listRecentReports({ database: input.database, input: listInput }),
  };
}

type CreateReportRepositoryMethodInput = {
  readonly database: Database;
  readonly input: CreateReportInput;
};

function createReport(input: CreateReportRepositoryMethodInput): ReportRecord {
  const report = createReportRecord(input.input);

  try {
    input.database
      .query(
        `
INSERT INTO reports (
  id,
  project_id,
  target_kind,
  target_id,
  title,
  body_markdown,
  generated_by_kind,
  generated_by_id,
  generated_by_display_name,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        report.id,
        report.projectId,
        report.target.targetKind,
        report.target.targetId,
        report.title,
        report.bodyMarkdown,
        report.generatedBy.actorKind,
        report.generatedBy.actorId,
        report.generatedBy.displayName ?? null,
        report.metadata.createdAt,
        report.metadata.updatedAt,
      );
  } catch (error) {
    if (isSqlitePrimaryKeyConstraintError(error)) {
      throw new ConflictError({
        message: "Report already exists.",
        details: { id: report.id },
      });
    }

    if (isSqliteForeignKeyConstraintError(error)) {
      throw new ConflictError({
        message: "Report project does not exist.",
        details: { projectId: report.projectId },
      });
    }

    throw error;
  }

  return getPersistedReport({
    database: input.database,
    id: report.id,
  });
}

type GetReportByIdInput = {
  readonly database: Database;
  readonly id: SituId<"report">;
};

function getReportById(input: GetReportByIdInput): ReportRecord | undefined {
  const row = input.database
    .query<ReportRow, [string]>("SELECT * FROM reports WHERE id = ?")
    .get(input.id);

  if (row === null) {
    return undefined;
  }

  return reportFromRow({ row });
}

type ListAllReportsRepositoryInput = {
  readonly database: Database;
};

function listAllReports(input: ListAllReportsRepositoryInput): readonly ReportRecord[] {
  const rows = input.database
    .query<ReportRow, []>(
      `
SELECT *
FROM reports
ORDER BY created_at ASC, id ASC
`,
    )
    .all();

  return rows.map((row) => reportFromRow({ row }));
}

type ListReportsForProjectRepositoryInput = {
  readonly database: Database;
  readonly input: ListReportsForProjectInput;
};

function listReportsForProject(
  input: ListReportsForProjectRepositoryInput,
): readonly ReportRecord[] {
  const rows = input.database
    .query<ReportRow, [string]>(
      `
SELECT *
FROM reports
WHERE project_id = ?
ORDER BY created_at ASC, id ASC
`,
    )
    .all(input.input.projectId);

  return rows.map((row) => reportFromRow({ row }));
}

type ListReportsForTargetRepositoryInput = {
  readonly database: Database;
  readonly input: ListReportsForTargetInput;
};

function listReportsForTarget(input: ListReportsForTargetRepositoryInput): readonly ReportRecord[] {
  const rows = input.database
    .query<ReportRow, [string, string]>(
      `
SELECT *
FROM reports
WHERE target_kind = ? AND target_id = ?
ORDER BY created_at ASC, id ASC
`,
    )
    .all(input.input.target.targetKind, input.input.target.targetId);

  return rows.map((row) => reportFromRow({ row }));
}

type ListRecentReportsRepositoryInput = {
  readonly database: Database;
  readonly input?: ListRecentReportsInput;
};

function listRecentReports(input: ListRecentReportsRepositoryInput): readonly ReportRecord[] {
  const limit = normalizeRecentReportsLimit({
    limit: input.input === undefined ? undefined : input.input.limit,
  });
  const rows = input.database
    .query<ReportRow, [number]>(
      `
SELECT *
FROM reports
ORDER BY created_at DESC, id DESC
LIMIT ?
`,
    )
    .all(limit);

  return rows.map((row) => reportFromRow({ row }));
}

type NormalizeRecentReportsLimitInput = {
  readonly limit?: number;
};

function normalizeRecentReportsLimit(input: NormalizeRecentReportsLimitInput): number {
  if (input.limit === undefined) {
    return 50;
  }

  if (
    typeof input.limit !== "number" ||
    !Number.isFinite(input.limit) ||
    !Number.isInteger(input.limit) ||
    input.limit <= 0
  ) {
    throw new ValidationError({
      message: "Expected a positive integer limit.",
      details: { field: "limit" },
    });
  }

  return Math.min(input.limit, 500);
}

type GetPersistedReportInput = {
  readonly database: Database;
  readonly id: SituId<"report">;
};

function getPersistedReport(input: GetPersistedReportInput): ReportRecord {
  const report = getReportById(input);

  if (report !== undefined) {
    return report;
  }

  throw new Error("Report was not found after persistence.");
}

type ReportFromRowInput = {
  readonly row: ReportRow;
};

function reportFromRow(input: ReportFromRowInput): ReportRecord {
  return {
    id: input.row.id as SituId<"report">,
    projectId: input.row.project_id as SituId<"project">,
    target: {
      targetKind: input.row.target_kind,
      targetId: input.row.target_id as TargetRef["targetId"],
    },
    title: input.row.title,
    bodyMarkdown: input.row.body_markdown,
    generatedBy: {
      actorKind: input.row.generated_by_kind,
      actorId: input.row.generated_by_id,
      displayName: input.row.generated_by_display_name ?? undefined,
    },
    metadata: {
      createdAt: input.row.created_at,
      updatedAt: input.row.updated_at,
    },
  };
}

function isSqlitePrimaryKeyConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" &&
    error.message.includes("reports.id")
  );
}

function isSqliteForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_FOREIGNKEY";
}
