import type { Database } from "bun:sqlite";

import type { ActorRef, IsoTimestamp, SituId } from "@situ/common";
import { ConflictError, NotFoundError } from "@situ/errors";

import {
  type CreateBaselineRecordInput,
  createBaselineRecord,
  moveBaselineRecord,
  normalizeBaselineStatus,
} from "./mutations.js";
import type { BaselineRecord, BaselineStatus } from "./types.js";

export type CreateBaselineRepositoryInput = {
  readonly database: Database;
};

export type CreateBaselineInput = Omit<CreateBaselineRecordInput, "id"> & {
  readonly id?: SituId<"baseline">;
};

export type ListBaselinesInput = {
  readonly projectId?: SituId<"project">;
  readonly taskId?: SituId<"task">;
  readonly status?: BaselineStatus;
};

export type MoveBaselineInput = {
  readonly id: SituId<"baseline">;
  readonly status: BaselineStatus;
  readonly now?: IsoTimestamp;
};

export type BaselineRepository = {
  readonly create: (input: CreateBaselineInput) => BaselineRecord;
  readonly getById: (input: { readonly id: SituId<"baseline"> }) => BaselineRecord | undefined;
  readonly list: (input?: ListBaselinesInput) => readonly BaselineRecord[];
  readonly move: (input: MoveBaselineInput) => BaselineRecord;
};

type BaselineRow = {
  readonly id: string;
  readonly project_id: string;
  readonly task_id: string | null;
  readonly title: string;
  readonly summary_markdown: string;
  readonly status: BaselineStatus;
  readonly created_by_kind: ActorRef["actorKind"];
  readonly created_by_id: string;
  readonly created_by_display_name: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

/**
 * Creates a SQLite-backed baseline repository.
 */
export function createBaselineRepository(input: CreateBaselineRepositoryInput): BaselineRepository {
  return {
    create: (createInput) =>
      createBaseline({
        database: input.database,
        input: createInput,
      }),
    getById: (getInput) =>
      getBaselineById({
        database: input.database,
        id: getInput.id,
      }),
    list: (listInput) =>
      listBaselines({
        database: input.database,
        input: listInput,
      }),
    move: (moveInput) =>
      moveBaseline({
        database: input.database,
        input: moveInput,
      }),
  };
}

function createBaseline(input: {
  readonly database: Database;
  readonly input: CreateBaselineInput;
}): BaselineRecord {
  const baseline = createBaselineRecord(input.input);

  try {
    input.database
      .query(
        `
INSERT INTO baselines (
  id,
  project_id,
  task_id,
  title,
  summary_markdown,
  status,
  created_by_kind,
  created_by_id,
  created_by_display_name,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        baseline.id,
        baseline.projectId,
        baseline.taskId ?? null,
        baseline.title,
        baseline.summaryMarkdown,
        baseline.status,
        baseline.createdBy.actorKind,
        baseline.createdBy.actorId,
        baseline.createdBy.displayName ?? null,
        baseline.metadata.createdAt,
        baseline.metadata.updatedAt,
      );
  } catch (error) {
    if (isCreateConflictError(error)) {
      throw new ConflictError({
        message: "Baseline could not be created because it conflicts with existing state.",
        details: {
          id: baseline.id,
          projectId: baseline.projectId,
          taskId: baseline.taskId,
        },
      });
    }

    throw error;
  }

  return getPersistedBaseline({
    database: input.database,
    id: baseline.id,
  });
}

function getBaselineById(input: {
  readonly database: Database;
  readonly id: SituId<"baseline">;
}): BaselineRecord | undefined {
  const row = input.database
    .query<BaselineRow, [string]>("SELECT * FROM baselines WHERE id = ?")
    .get(input.id);

  if (row === null) {
    return undefined;
  }

  return baselineFromRow({ row });
}

function listBaselines(input: {
  readonly database: Database;
  readonly input?: ListBaselinesInput;
}): readonly BaselineRecord[] {
  const query = buildListQuery({ input: input.input });
  const rows = input.database.query<BaselineRow, string[]>(query.sql).all(...query.args);

  return rows.map((row) => baselineFromRow({ row }));
}

type ListQuery = {
  readonly sql: string;
  readonly args: string[];
};

function buildListQuery(input: { readonly input?: ListBaselinesInput }): ListQuery {
  const clauses: string[] = [];
  const args: string[] = [];

  if (input.input?.projectId !== undefined) {
    clauses.push("project_id = ?");
    args.push(input.input.projectId);
  }

  if (input.input?.taskId !== undefined) {
    clauses.push("task_id = ?");
    args.push(input.input.taskId);
  }

  if (input.input?.status !== undefined) {
    clauses.push("status = ?");
    args.push(
      normalizeBaselineStatus({
        field: "status",
        status: input.input.status,
      }),
    );
  }

  const whereClause = (() => {
    if (clauses.length === 0) {
      return "";
    }

    return ` WHERE ${clauses.join(" AND ")}`;
  })();

  return {
    sql: `SELECT * FROM baselines${whereClause} ORDER BY created_at ASC, id ASC`,
    args,
  };
}

function moveBaseline(input: {
  readonly database: Database;
  readonly input: MoveBaselineInput;
}): BaselineRecord {
  const existingBaseline = requireExistingBaseline({
    database: input.database,
    id: input.input.id,
  });
  const movedBaseline = moveBaselineRecord({
    baseline: existingBaseline,
    status: input.input.status,
    now: input.input.now,
  });

  input.database
    .query("UPDATE baselines SET status = ?, updated_at = ? WHERE id = ?")
    .run(movedBaseline.status, movedBaseline.metadata.updatedAt, movedBaseline.id);

  return getPersistedBaseline({
    database: input.database,
    id: movedBaseline.id,
  });
}

function requireExistingBaseline(input: {
  readonly database: Database;
  readonly id: SituId<"baseline">;
}): BaselineRecord {
  const baseline = getBaselineById(input);

  if (baseline !== undefined) {
    return baseline;
  }

  throw new NotFoundError({
    message: "Baseline was not found.",
    details: { id: input.id },
  });
}

function getPersistedBaseline(input: {
  readonly database: Database;
  readonly id: SituId<"baseline">;
}): BaselineRecord {
  const baseline = getBaselineById(input);

  if (baseline !== undefined) {
    return baseline;
  }

  throw new Error("Baseline was not found after persistence.");
}

function baselineFromRow(input: { readonly row: BaselineRow }): BaselineRecord {
  return {
    id: input.row.id as SituId<"baseline">,
    projectId: input.row.project_id as SituId<"project">,
    taskId: input.row.task_id === null ? undefined : (input.row.task_id as SituId<"task">),
    title: input.row.title,
    summaryMarkdown: input.row.summary_markdown,
    status: input.row.status,
    createdBy: {
      actorKind: input.row.created_by_kind,
      actorId: input.row.created_by_id,
      displayName: input.row.created_by_display_name ?? undefined,
    },
    metadata: {
      createdAt: input.row.created_at,
      updatedAt: input.row.updated_at,
    },
  };
}

function isCreateConflictError(error: unknown): boolean {
  return isDuplicateBaselineIdError(error) || isForeignKeyConstraintError(error);
}

function isDuplicateBaselineIdError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" &&
    error.message === "UNIQUE constraint failed: baselines.id"
  );
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_FOREIGNKEY";
}
