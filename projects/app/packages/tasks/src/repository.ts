import type { Database } from "bun:sqlite";

import type { ActorRef, IsoTimestamp, SituId } from "@situ/common";
import { ConflictError, NotFoundError, ValidationError } from "@situ/errors";

import {
  type CreateTaskRecordInput,
  assignTaskRecord,
  createTaskRecord,
  moveTaskRecord,
  normalizeAssignedToFilter,
  normalizeTaskStatus,
} from "./mutations.js";
import type { TaskRecord, TaskStatus } from "./types.js";

export type CreateTaskRepositoryInput = {
  readonly database: Database;
};

export type ListTasksInput = {
  readonly projectId?: SituId<"project">;
  readonly projectIds?: readonly SituId<"project">[];
  readonly status?: TaskStatus;
  readonly assignedTo?: {
    readonly actorKind: ActorRef["actorKind"];
    readonly actorId: string;
  };
};

export type CreateTaskInput = Omit<CreateTaskRecordInput, "id"> & {
  readonly id?: SituId<"task">;
};

export type MoveTaskInput = {
  readonly id: SituId<"task">;
  readonly status: TaskStatus;
  readonly now?: IsoTimestamp;
};

export type AssignTaskInput = {
  readonly id: SituId<"task">;
  readonly assignedTo?: ActorRef;
  readonly now?: IsoTimestamp;
};

export type TaskRepository = {
  readonly create: (input: CreateTaskInput) => TaskRecord;
  readonly getById: (input: { readonly id: SituId<"task"> }) => TaskRecord | undefined;
  readonly list: (input?: ListTasksInput) => readonly TaskRecord[];
  readonly move: (input: MoveTaskInput) => TaskRecord;
  readonly assign: (input: AssignTaskInput) => TaskRecord;
};

type TaskRow = {
  readonly id: string;
  readonly project_id: string;
  readonly title: string;
  readonly body_markdown: string;
  readonly status: TaskStatus;
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
 * Creates a SQLite-backed task repository.
 */
export function createTaskRepository(input: CreateTaskRepositoryInput): TaskRepository {
  return {
    create: (createInput) => createTask({ database: input.database, input: createInput }),
    getById: (getInput) => getTaskById({ database: input.database, id: getInput.id }),
    list: (listInput) => listTasks({ database: input.database, input: listInput }),
    move: (moveInput) => moveTask({ database: input.database, input: moveInput }),
    assign: (assignInput) => assignTask({ database: input.database, input: assignInput }),
  };
}

type CreateTaskRepositoryMethodInput = {
  readonly database: Database;
  readonly input: CreateTaskInput;
};

function createTask(input: CreateTaskRepositoryMethodInput): TaskRecord {
  const task = createTaskRecord(input.input);

  try {
    input.database
      .query(
        `
INSERT INTO tasks (
  id,
  project_id,
  title,
  body_markdown,
  status,
  assigned_to_kind,
  assigned_to_id,
  assigned_to_display_name,
  created_by_kind,
  created_by_id,
  created_by_display_name,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        task.id,
        task.projectId,
        task.title,
        task.bodyMarkdown,
        task.status,
        task.assignedTo?.actorKind ?? null,
        task.assignedTo?.actorId ?? null,
        task.assignedTo?.displayName ?? null,
        task.createdBy.actorKind,
        task.createdBy.actorId,
        task.createdBy.displayName ?? null,
        task.metadata.createdAt,
        task.metadata.updatedAt,
      );
  } catch (error) {
    if (isSqliteConstraintError(error)) {
      throw new ConflictError({
        message: "Task could not be created because it conflicts with existing state.",
        details: { id: task.id, projectId: task.projectId },
      });
    }

    throw error;
  }

  return getPersistedTask({
    database: input.database,
    id: task.id,
  });
}

type GetTaskByIdInput = {
  readonly database: Database;
  readonly id: SituId<"task">;
};

function getTaskById(input: GetTaskByIdInput): TaskRecord | undefined {
  const row = input.database
    .query<TaskRow, [string]>("SELECT * FROM tasks WHERE id = ?")
    .get(input.id);

  if (row === null) {
    return undefined;
  }

  return taskFromRow({ row });
}

type ListTasksRepositoryInput = {
  readonly database: Database;
  readonly input?: ListTasksInput;
};

function listTasks(input: ListTasksRepositoryInput): readonly TaskRecord[] {
  validateListTasksInput({ input: input.input });

  if (input.input?.projectIds !== undefined && input.input.projectIds.length === 0) {
    return [];
  }

  const query = buildListQuery({ input: input.input });
  const rows = input.database.query<TaskRow, string[]>(query.sql).all(...query.args);

  return rows.map((row) => taskFromRow({ row }));
}

type ListQuery = {
  readonly sql: string;
  readonly args: string[];
};

type BuildListQueryInput = {
  readonly input?: ListTasksInput;
};

function validateListTasksInput(input: BuildListQueryInput): void {
  if (input.input?.projectId !== undefined && input.input.projectIds !== undefined) {
    throw new ValidationError({
      message: "Task list accepts either projectId or projectIds, not both.",
      details: {
        projectId: input.input.projectId,
        projectIds: input.input.projectIds,
      },
    });
  }
}

function buildListQuery(input: BuildListQueryInput): ListQuery {
  const clauses: string[] = [];
  const args: string[] = [];

  if (input.input?.projectId !== undefined) {
    clauses.push("project_id = ?");
    args.push(input.input.projectId);
  }

  if (input.input?.projectIds !== undefined) {
    clauses.push(`project_id IN (${input.input.projectIds.map(() => "?").join(", ")})`);
    args.push(...input.input.projectIds);
  }

  if (input.input?.status !== undefined) {
    clauses.push("status = ?");
    args.push(
      normalizeTaskStatus({
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
    sql: `SELECT * FROM tasks${whereClause} ORDER BY created_at ASC, id ASC`,
    args,
  };
}

type MoveTaskRepositoryInput = {
  readonly database: Database;
  readonly input: MoveTaskInput;
};

function moveTask(input: MoveTaskRepositoryInput): TaskRecord {
  const existingTask = requireExistingTask({
    database: input.database,
    id: input.input.id,
  });
  const movedTask = moveTaskRecord({
    task: existingTask,
    status: input.input.status,
    now: input.input.now,
  });

  input.database
    .query("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?")
    .run(movedTask.status, movedTask.metadata.updatedAt, movedTask.id);

  return getPersistedTask({
    database: input.database,
    id: movedTask.id,
  });
}

type AssignTaskRepositoryInput = {
  readonly database: Database;
  readonly input: AssignTaskInput;
};

function assignTask(input: AssignTaskRepositoryInput): TaskRecord {
  const existingTask = requireExistingTask({
    database: input.database,
    id: input.input.id,
  });
  const assignedTask = assignTaskRecord({
    task: existingTask,
    assignedTo: input.input.assignedTo,
    now: input.input.now,
  });

  input.database
    .query(
      `
UPDATE tasks
SET
  assigned_to_kind = ?,
  assigned_to_id = ?,
  assigned_to_display_name = ?,
  updated_at = ?
WHERE id = ?
`,
    )
    .run(
      assignedTask.assignedTo?.actorKind ?? null,
      assignedTask.assignedTo?.actorId ?? null,
      assignedTask.assignedTo?.displayName ?? null,
      assignedTask.metadata.updatedAt,
      assignedTask.id,
    );

  return getPersistedTask({
    database: input.database,
    id: assignedTask.id,
  });
}

type RequireExistingTaskInput = {
  readonly database: Database;
  readonly id: SituId<"task">;
};

function requireExistingTask(input: RequireExistingTaskInput): TaskRecord {
  const task = getTaskById(input);

  if (task !== undefined) {
    return task;
  }

  throw new NotFoundError({
    message: "Task was not found.",
    details: { id: input.id },
  });
}

type GetPersistedTaskInput = {
  readonly database: Database;
  readonly id: SituId<"task">;
};

function getPersistedTask(input: GetPersistedTaskInput): TaskRecord {
  return requireExistingTask(input);
}

type TaskFromRowInput = {
  readonly row: TaskRow;
};

function taskFromRow(input: TaskFromRowInput): TaskRecord {
  return {
    id: input.row.id as SituId<"task">,
    projectId: input.row.project_id as SituId<"project">,
    title: input.row.title,
    bodyMarkdown: input.row.body_markdown,
    status: input.row.status,
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

function isSqliteConstraintError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && String(error.code).startsWith("SQLITE_CONSTRAINT")
  );
}
