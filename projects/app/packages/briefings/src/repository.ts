import type { Database } from "bun:sqlite";

import type { ActorRef, SituId, TargetRef } from "@situ/common";
import { ConflictError, InternalError, ValidationError } from "@situ/errors";

import { type CreateBriefingRecordInput, createBriefingRecord } from "./mutations.js";
import type { BriefingAssessment, BriefingBlock, BriefingRecord, BriefingStage } from "./types.js";

export type CreateBriefingRepositoryInput = {
  readonly database: Database;
};

export type CreateBriefingInput = Omit<CreateBriefingRecordInput, "id"> & {
  readonly id?: SituId<"briefing">;
};

export type ListBriefingsForProjectInput = {
  readonly projectId: SituId<"project">;
};

export type ListRecentBriefingsInput = {
  readonly limit?: number;
};

export type BriefingRepository = {
  readonly create: (input: CreateBriefingInput) => BriefingRecord;
  readonly getById: (input: { readonly id: SituId<"briefing"> }) => BriefingRecord | undefined;
  readonly listAll: () => readonly BriefingRecord[];
  readonly listForProject: (input: ListBriefingsForProjectInput) => readonly BriefingRecord[];
  readonly listRecent: (input?: ListRecentBriefingsInput) => readonly BriefingRecord[];
};

type BriefingRow = {
  readonly id: string;
  readonly project_id: string;
  readonly title: string;
  readonly stage: BriefingStage;
  readonly assessment: BriefingAssessment;
  readonly headline_markdown: string;
  readonly blocks_json: string;
  readonly evidence_refs_json: string;
  readonly authored_by_kind: ActorRef["actorKind"];
  readonly authored_by_id: string;
  readonly authored_by_display_name: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

/**
 * Creates a SQLite-backed briefing repository.
 */
export function createBriefingRepository(input: CreateBriefingRepositoryInput): BriefingRepository {
  return {
    create: (createInput) => createBriefing({ database: input.database, input: createInput }),
    getById: (getInput) => getBriefingById({ database: input.database, id: getInput.id }),
    listAll: () => listAllBriefings({ database: input.database }),
    listForProject: (listInput) =>
      listBriefingsForProject({ database: input.database, input: listInput }),
    listRecent: (listInput) => listRecentBriefings({ database: input.database, input: listInput }),
  };
}

type CreateBriefingRepositoryMethodInput = {
  readonly database: Database;
  readonly input: CreateBriefingInput;
};

function createBriefing(input: CreateBriefingRepositoryMethodInput): BriefingRecord {
  const briefing = createBriefingRecord(input.input);

  try {
    input.database
      .query(
        `
INSERT INTO briefings (
  id,
  project_id,
  title,
  stage,
  assessment,
  headline_markdown,
  blocks_json,
  evidence_refs_json,
  authored_by_kind,
  authored_by_id,
  authored_by_display_name,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        briefing.id,
        briefing.projectId,
        briefing.title,
        briefing.stage,
        briefing.assessment,
        briefing.headlineMarkdown,
        JSON.stringify(briefing.blocks),
        JSON.stringify(briefing.evidenceRefs),
        briefing.authoredBy.actorKind,
        briefing.authoredBy.actorId,
        briefing.authoredBy.displayName ?? null,
        briefing.metadata.createdAt,
        briefing.metadata.updatedAt,
      );
  } catch (error) {
    if (isSqlitePrimaryKeyConstraintError(error)) {
      throw new ConflictError({
        message: "Briefing already exists.",
        details: { id: briefing.id },
      });
    }

    if (isSqliteForeignKeyConstraintError(error)) {
      throw new ConflictError({
        message: "Briefing project does not exist.",
        details: { projectId: briefing.projectId },
      });
    }

    throw error;
  }

  return getPersistedBriefing({
    database: input.database,
    id: briefing.id,
  });
}

type GetBriefingByIdInput = {
  readonly database: Database;
  readonly id: SituId<"briefing">;
};

function getBriefingById(input: GetBriefingByIdInput): BriefingRecord | undefined {
  const row = input.database
    .query<BriefingRow, [string]>("SELECT * FROM briefings WHERE id = ?")
    .get(input.id);

  if (row === null) {
    return undefined;
  }

  return briefingFromRow({ row });
}

type ListAllBriefingsRepositoryInput = {
  readonly database: Database;
};

function listAllBriefings(input: ListAllBriefingsRepositoryInput): readonly BriefingRecord[] {
  const rows = input.database
    .query<BriefingRow, []>(
      `
SELECT *
FROM briefings
ORDER BY created_at ASC, id ASC
`,
    )
    .all();

  return rows.map((row) => briefingFromRow({ row }));
}

type ListBriefingsForProjectRepositoryInput = {
  readonly database: Database;
  readonly input: ListBriefingsForProjectInput;
};

function listBriefingsForProject(
  input: ListBriefingsForProjectRepositoryInput,
): readonly BriefingRecord[] {
  const rows = input.database
    .query<BriefingRow, [string]>(
      `
SELECT *
FROM briefings
WHERE project_id = ?
ORDER BY created_at ASC, id ASC
`,
    )
    .all(input.input.projectId);

  return rows.map((row) => briefingFromRow({ row }));
}

type ListRecentBriefingsRepositoryInput = {
  readonly database: Database;
  readonly input?: ListRecentBriefingsInput;
};

function listRecentBriefings(input: ListRecentBriefingsRepositoryInput): readonly BriefingRecord[] {
  const limit = normalizeRecentBriefingsLimit({
    limit: input.input === undefined ? undefined : input.input.limit,
  });
  const rows = input.database
    .query<BriefingRow, [number]>(
      `
SELECT *
FROM briefings
ORDER BY created_at DESC, id DESC
LIMIT ?
`,
    )
    .all(limit);

  return rows.map((row) => briefingFromRow({ row }));
}

type NormalizeRecentBriefingsLimitInput = {
  readonly limit?: number;
};

function normalizeRecentBriefingsLimit(input: NormalizeRecentBriefingsLimitInput): number {
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

type GetPersistedBriefingInput = {
  readonly database: Database;
  readonly id: SituId<"briefing">;
};

function getPersistedBriefing(input: GetPersistedBriefingInput): BriefingRecord {
  const briefing = getBriefingById(input);

  if (briefing !== undefined) {
    return briefing;
  }

  throw new Error("Briefing was not found after persistence.");
}

type BriefingFromRowInput = {
  readonly row: BriefingRow;
};

function briefingFromRow(input: BriefingFromRowInput): BriefingRecord {
  return {
    id: input.row.id as SituId<"briefing">,
    projectId: input.row.project_id as SituId<"project">,
    title: input.row.title,
    stage: input.row.stage,
    assessment: input.row.assessment,
    headlineMarkdown: input.row.headline_markdown,
    blocks: parseJsonField<readonly BriefingBlock[]>({
      field: "blocks_json",
      value: input.row.blocks_json,
    }),
    evidenceRefs: parseJsonField<readonly TargetRef[]>({
      field: "evidence_refs_json",
      value: input.row.evidence_refs_json,
    }),
    authoredBy: {
      actorKind: input.row.authored_by_kind,
      actorId: input.row.authored_by_id,
      displayName: input.row.authored_by_display_name ?? undefined,
    },
    metadata: {
      createdAt: input.row.created_at,
      updatedAt: input.row.updated_at,
    },
  };
}

function parseJsonField<TValue>(input: { readonly field: string; readonly value: string }): TValue {
  try {
    return JSON.parse(input.value) as TValue;
  } catch (error) {
    throw new InternalError({
      message: "Persisted briefing JSON was invalid.",
      details: {
        field: input.field,
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function isSqlitePrimaryKeyConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" &&
    error.message.includes("briefings.id")
  );
}

function isSqliteForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_FOREIGNKEY";
}
