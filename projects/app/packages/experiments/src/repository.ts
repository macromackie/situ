import type { Database } from "bun:sqlite";

import type { ActorRef, IsoTimestamp, SituId } from "@situ/common";
import { ConflictError, NotFoundError } from "@situ/errors";

import {
  type CreateExperimentRecordInput,
  assignExperimentRecord,
  createExperimentRecord,
  moveExperimentRecord,
  normalizeAssignedToFilter,
  normalizeExperimentStatus,
  reviseExperimentRecord,
} from "./mutations.js";
import type { ExperimentRecord, ExperimentStatus } from "./types.js";

export type CreateExperimentRepositoryInput = {
  readonly database: Database;
};

export type ListExperimentsInput = {
  readonly projectId?: SituId<"project">;
  readonly taskId?: SituId<"task">;
  readonly status?: ExperimentStatus;
  readonly assignedTo?: {
    readonly actorKind: ActorRef["actorKind"];
    readonly actorId: string;
  };
};

export type CreateExperimentInput = Omit<CreateExperimentRecordInput, "id"> & {
  readonly id?: SituId<"experiment">;
};

export type MoveExperimentInput = {
  readonly id: SituId<"experiment">;
  readonly status: ExperimentStatus;
  readonly now?: IsoTimestamp;
};

export type AssignExperimentInput = {
  readonly id: SituId<"experiment">;
  readonly assignedTo?: ActorRef;
  readonly now?: IsoTimestamp;
};

export type ReviseExperimentInput = {
  readonly id: SituId<"experiment">;
  readonly summaryMarkdown?: string;
  readonly status?: ExperimentStatus;
  readonly baseRef?: string;
  readonly clearBaseRef?: boolean;
  readonly branchName?: string;
  readonly clearBranchName?: boolean;
  readonly worktreePath?: string;
  readonly clearWorktreePath?: boolean;
  readonly now?: IsoTimestamp;
};

export type ExperimentRepository = {
  readonly create: (input: CreateExperimentInput) => ExperimentRecord;
  readonly getById: (input: { readonly id: SituId<"experiment"> }) => ExperimentRecord | undefined;
  readonly list: (input?: ListExperimentsInput) => readonly ExperimentRecord[];
  readonly move: (input: MoveExperimentInput) => ExperimentRecord;
  readonly assign: (input: AssignExperimentInput) => ExperimentRecord;
  readonly revise: (input: ReviseExperimentInput) => ExperimentRecord;
};

type ExperimentRow = {
  readonly id: string;
  readonly project_id: string;
  readonly task_id: string;
  readonly title: string;
  readonly summary_markdown: string;
  readonly status: ExperimentStatus;
  readonly revision_number: number;
  readonly base_ref: string | null;
  readonly branch_name: string | null;
  readonly worktree_path: string | null;
  readonly assigned_to_kind: ActorRef["actorKind"] | null;
  readonly assigned_to_id: string | null;
  readonly assigned_to_display_name: string | null;
  readonly created_by_kind: ActorRef["actorKind"];
  readonly created_by_id: string;
  readonly created_by_display_name: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

/**
 * Creates a SQLite-backed experiment repository.
 */
export function createExperimentRepository(
  input: CreateExperimentRepositoryInput,
): ExperimentRepository {
  return {
    create: (createInput) =>
      createExperiment({
        database: input.database,
        input: createInput,
      }),
    getById: (getInput) =>
      getExperimentById({
        database: input.database,
        id: getInput.id,
      }),
    list: (listInput) =>
      listExperiments({
        database: input.database,
        input: listInput,
      }),
    move: (moveInput) =>
      moveExperiment({
        database: input.database,
        input: moveInput,
      }),
    assign: (assignInput) =>
      assignExperiment({
        database: input.database,
        input: assignInput,
      }),
    revise: (reviseInput) =>
      reviseExperiment({
        database: input.database,
        input: reviseInput,
      }),
  };
}

type CreateExperimentRepositoryMethodInput = {
  readonly database: Database;
  readonly input: CreateExperimentInput;
};

function createExperiment(input: CreateExperimentRepositoryMethodInput): ExperimentRecord {
  const experiment = createExperimentRecord(input.input);

  try {
    input.database
      .query(
        `
INSERT INTO experiments (
  id,
  project_id,
  task_id,
  title,
  summary_markdown,
  status,
  revision_number,
  base_ref,
  branch_name,
  worktree_path,
  assigned_to_kind,
  assigned_to_id,
  assigned_to_display_name,
  created_by_kind,
  created_by_id,
  created_by_display_name,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        experiment.id,
        experiment.projectId,
        experiment.taskId,
        experiment.title,
        experiment.summaryMarkdown,
        experiment.status,
        experiment.revisionNumber,
        experiment.baseRef ?? null,
        experiment.branchName ?? null,
        experiment.worktreePath ?? null,
        experiment.assignedTo?.actorKind ?? null,
        experiment.assignedTo?.actorId ?? null,
        experiment.assignedTo?.displayName ?? null,
        experiment.createdBy.actorKind,
        experiment.createdBy.actorId,
        experiment.createdBy.displayName ?? null,
        experiment.metadata.createdAt,
        experiment.metadata.updatedAt,
      );
  } catch (error) {
    if (isCreateConflictError(error)) {
      throw new ConflictError({
        message: "Experiment could not be created because it conflicts with existing state.",
        details: {
          id: experiment.id,
          projectId: experiment.projectId,
          taskId: experiment.taskId,
        },
      });
    }

    throw error;
  }

  return getPersistedExperiment({
    database: input.database,
    id: experiment.id,
  });
}

type GetExperimentByIdInput = {
  readonly database: Database;
  readonly id: SituId<"experiment">;
};

function getExperimentById(input: GetExperimentByIdInput): ExperimentRecord | undefined {
  const row = input.database
    .query<ExperimentRow, [string]>("SELECT * FROM experiments WHERE id = ?")
    .get(input.id);

  if (row === null) {
    return undefined;
  }

  return experimentFromRow({ row });
}

type ListExperimentsRepositoryInput = {
  readonly database: Database;
  readonly input?: ListExperimentsInput;
};

function listExperiments(input: ListExperimentsRepositoryInput): readonly ExperimentRecord[] {
  const query = buildListQuery({ input: input.input });
  const rows = input.database.query<ExperimentRow, string[]>(query.sql).all(...query.args);

  return rows.map((row) => experimentFromRow({ row }));
}

type ListQuery = {
  readonly sql: string;
  readonly args: string[];
};

type BuildListQueryInput = {
  readonly input?: ListExperimentsInput;
};

function buildListQuery(input: BuildListQueryInput): ListQuery {
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
      normalizeExperimentStatus({
        field: "status",
        status: input.input.status,
      }),
    );
  }

  if (input.input?.assignedTo !== undefined) {
    const assignedTo = normalizeAssignedToFilter({
      assignedTo: input.input.assignedTo,
    });

    clauses.push("assigned_to_kind = ?");
    args.push(assignedTo.actorKind);
    clauses.push("assigned_to_id = ?");
    args.push(assignedTo.actorId);
  }

  const whereClause = (() => {
    if (clauses.length === 0) {
      return "";
    }

    return ` WHERE ${clauses.join(" AND ")}`;
  })();

  return {
    sql: `SELECT * FROM experiments${whereClause} ORDER BY created_at ASC, id ASC`,
    args,
  };
}

type MoveExperimentRepositoryInput = {
  readonly database: Database;
  readonly input: MoveExperimentInput;
};

function moveExperiment(input: MoveExperimentRepositoryInput): ExperimentRecord {
  const existingExperiment = requireExistingExperiment({
    database: input.database,
    id: input.input.id,
  });
  const movedExperiment = moveExperimentRecord({
    experiment: existingExperiment,
    status: input.input.status,
    now: input.input.now,
  });

  input.database
    .query("UPDATE experiments SET status = ?, updated_at = ? WHERE id = ?")
    .run(movedExperiment.status, movedExperiment.metadata.updatedAt, movedExperiment.id);

  return getPersistedExperiment({
    database: input.database,
    id: movedExperiment.id,
  });
}

type AssignExperimentRepositoryInput = {
  readonly database: Database;
  readonly input: AssignExperimentInput;
};

function assignExperiment(input: AssignExperimentRepositoryInput): ExperimentRecord {
  const existingExperiment = requireExistingExperiment({
    database: input.database,
    id: input.input.id,
  });
  const assignedExperiment = assignExperimentRecord({
    experiment: existingExperiment,
    assignedTo: input.input.assignedTo,
    now: input.input.now,
  });

  input.database
    .query(
      `
UPDATE experiments
SET
  assigned_to_kind = ?,
  assigned_to_id = ?,
  assigned_to_display_name = ?,
  updated_at = ?
WHERE id = ?
`,
    )
    .run(
      assignedExperiment.assignedTo?.actorKind ?? null,
      assignedExperiment.assignedTo?.actorId ?? null,
      assignedExperiment.assignedTo?.displayName ?? null,
      assignedExperiment.metadata.updatedAt,
      assignedExperiment.id,
    );

  return getPersistedExperiment({
    database: input.database,
    id: assignedExperiment.id,
  });
}

type ReviseExperimentRepositoryInput = {
  readonly database: Database;
  readonly input: ReviseExperimentInput;
};

function reviseExperiment(input: ReviseExperimentRepositoryInput): ExperimentRecord {
  const existingExperiment = requireExistingExperiment({
    database: input.database,
    id: input.input.id,
  });
  const revisedExperiment = reviseExperimentRecord({
    experiment: existingExperiment,
    summaryMarkdown: input.input.summaryMarkdown,
    status: input.input.status,
    baseRef: input.input.baseRef,
    clearBaseRef: input.input.clearBaseRef,
    branchName: input.input.branchName,
    clearBranchName: input.input.clearBranchName,
    worktreePath: input.input.worktreePath,
    clearWorktreePath: input.input.clearWorktreePath,
    now: input.input.now,
  });

  input.database
    .query(
      `
UPDATE experiments
SET
  summary_markdown = ?,
  status = ?,
  revision_number = ?,
  base_ref = ?,
  branch_name = ?,
  worktree_path = ?,
  updated_at = ?
WHERE id = ?
`,
    )
    .run(
      revisedExperiment.summaryMarkdown,
      revisedExperiment.status,
      revisedExperiment.revisionNumber,
      revisedExperiment.baseRef ?? null,
      revisedExperiment.branchName ?? null,
      revisedExperiment.worktreePath ?? null,
      revisedExperiment.metadata.updatedAt,
      revisedExperiment.id,
    );

  return getPersistedExperiment({
    database: input.database,
    id: revisedExperiment.id,
  });
}

type RequireExistingExperimentInput = {
  readonly database: Database;
  readonly id: SituId<"experiment">;
};

function requireExistingExperiment(input: RequireExistingExperimentInput): ExperimentRecord {
  const experiment = getExperimentById(input);

  if (experiment !== undefined) {
    return experiment;
  }

  throw new NotFoundError({
    message: "Experiment was not found.",
    details: { id: input.id },
  });
}

type GetPersistedExperimentInput = {
  readonly database: Database;
  readonly id: SituId<"experiment">;
};

function getPersistedExperiment(input: GetPersistedExperimentInput): ExperimentRecord {
  return requireExistingExperiment(input);
}

type ExperimentFromRowInput = {
  readonly row: ExperimentRow;
};

function experimentFromRow(input: ExperimentFromRowInput): ExperimentRecord {
  return {
    id: input.row.id as SituId<"experiment">,
    projectId: input.row.project_id as SituId<"project">,
    taskId: input.row.task_id as SituId<"task">,
    title: input.row.title,
    summaryMarkdown: input.row.summary_markdown,
    status: input.row.status,
    revisionNumber: input.row.revision_number,
    baseRef: input.row.base_ref ?? undefined,
    branchName: input.row.branch_name ?? undefined,
    worktreePath: input.row.worktree_path ?? undefined,
    assignedTo: actorFromColumns({
      actorKind: input.row.assigned_to_kind,
      actorId: input.row.assigned_to_id,
      displayName: input.row.assigned_to_display_name,
    }),
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

type ActorFromColumnsInput = {
  readonly actorKind: ActorRef["actorKind"] | null;
  readonly actorId: string | null;
  readonly displayName: string | null;
};

function actorFromColumns(input: ActorFromColumnsInput): ActorRef | undefined {
  if (input.actorKind === null || input.actorId === null) {
    return undefined;
  }

  return {
    actorKind: input.actorKind,
    actorId: input.actorId,
    displayName: input.displayName ?? undefined,
  };
}

function isCreateConflictError(error: unknown): boolean {
  return isDuplicateExperimentIdError(error) || isForeignKeyConstraintError(error);
}

function isDuplicateExperimentIdError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" &&
    error.message === "UNIQUE constraint failed: experiments.id"
  );
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_FOREIGNKEY";
}
