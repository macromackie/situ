import {
  type ActorRef,
  type IsoTimestamp,
  type SituId,
  createId,
  createSyncMetadata,
  touchSyncMetadata,
} from "@situ/common";
import { ValidationError } from "@situ/errors";

import type { TaskRecord, TaskStatus } from "./types.js";

const taskStatuses = new Set<TaskStatus>([
  "triage",
  "backlog",
  "in_progress",
  "in_review",
  "done",
  "canceled",
]);

export type CreateTaskRecordInput = {
  readonly id?: SituId<"task">;
  readonly projectId: SituId<"project">;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly createdBy: ActorRef;
  readonly assignedTo?: ActorRef;
  readonly status?: TaskStatus;
  readonly now?: IsoTimestamp;
};

export type MoveTaskRecordInput = {
  readonly task: TaskRecord;
  readonly status: TaskStatus;
  readonly now?: IsoTimestamp;
};

export type AssignTaskRecordInput = {
  readonly task: TaskRecord;
  readonly assignedTo?: ActorRef;
  readonly now?: IsoTimestamp;
};

/**
 * Creates a task record.
 */
export function createTaskRecord(input: CreateTaskRecordInput): TaskRecord {
  return {
    id: input.id ?? createId({ prefix: "task" }),
    projectId: input.projectId,
    title: requireNonEmptyString({
      field: "title",
      value: input.title,
    }),
    bodyMarkdown: requireNonEmptyString({
      field: "bodyMarkdown",
      value: input.bodyMarkdown,
    }),
    status: requireTaskStatus({
      field: "status",
      status: input.status ?? "triage",
    }),
    assignedTo: normalizeOptionalActorRef({
      actor: input.assignedTo,
      field: "assignedTo",
    }),
    createdBy: normalizeActorRef({
      actor: input.createdBy,
      field: "createdBy",
    }),
    metadata: createSyncMetadata({ now: input.now }),
  };
}

/**
 * Returns a task record with a new status.
 */
export function moveTaskRecord(input: MoveTaskRecordInput): TaskRecord {
  return {
    ...input.task,
    status: requireTaskStatus({
      field: "status",
      status: input.status,
    }),
    metadata: touchSyncMetadata({
      metadata: input.task.metadata,
      now: input.now,
    }),
  };
}

/**
 * Returns a task record with a new assignee.
 */
export function assignTaskRecord(input: AssignTaskRecordInput): TaskRecord {
  return {
    ...input.task,
    assignedTo: normalizeOptionalActorRef({
      actor: input.assignedTo,
      field: "assignedTo",
    }),
    metadata: touchSyncMetadata({
      metadata: input.task.metadata,
      now: input.now,
    }),
  };
}

export type NormalizeAssignedToFilterInput = {
  readonly assignedTo: {
    readonly actorKind: ActorRef["actorKind"];
    readonly actorId: string;
  };
};

/**
 * Normalizes an assignee list filter.
 */
export function normalizeAssignedToFilter(
  input: NormalizeAssignedToFilterInput,
): Pick<ActorRef, "actorKind" | "actorId"> {
  return {
    actorKind: requireNonEmptyString({
      field: "assignedTo.actorKind",
      value: input.assignedTo.actorKind,
    }) as ActorRef["actorKind"],
    actorId: requireNonEmptyString({
      field: "assignedTo.actorId",
      value: input.assignedTo.actorId,
    }),
  };
}

export type NormalizeTaskStatusInput = {
  readonly field: string;
  readonly status: TaskStatus;
};

/**
 * Normalizes a task status input.
 */
export function normalizeTaskStatus(input: NormalizeTaskStatusInput): TaskStatus {
  return requireTaskStatus(input);
}

type NormalizeOptionalActorRefInput = {
  readonly actor?: ActorRef;
  readonly field: string;
};

function normalizeOptionalActorRef(input: NormalizeOptionalActorRefInput): ActorRef | undefined {
  if (input.actor === undefined) {
    return undefined;
  }

  return normalizeActorRef({
    actor: input.actor,
    field: input.field,
  });
}

type NormalizeActorRefInput = {
  readonly actor: ActorRef;
  readonly field: string;
};

function normalizeActorRef(input: NormalizeActorRefInput): ActorRef {
  const displayName = optionalNonEmptyString({
    field: `${input.field}.displayName`,
    value: input.actor.displayName,
  });

  return {
    actorKind: requireNonEmptyString({
      field: `${input.field}.actorKind`,
      value: input.actor.actorKind,
    }) as ActorRef["actorKind"],
    actorId: requireNonEmptyString({
      field: `${input.field}.actorId`,
      value: input.actor.actorId,
    }),
    displayName,
  };
}

type RequireNonEmptyStringInput = {
  readonly field: string;
  readonly value: string;
};

function requireNonEmptyString(input: RequireNonEmptyStringInput): string {
  const value = input.value.trim();

  if (value.length > 0) {
    return value;
  }

  throw new ValidationError({
    message: "Expected a non-empty string.",
    details: { field: input.field },
  });
}

type OptionalNonEmptyStringInput = {
  readonly field: string;
  readonly value?: string;
};

function optionalNonEmptyString(input: OptionalNonEmptyStringInput): string | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  return requireNonEmptyString({
    field: input.field,
    value: input.value,
  });
}

type RequireTaskStatusInput = {
  readonly field: string;
  readonly status: TaskStatus;
};

function requireTaskStatus(input: RequireTaskStatusInput): TaskStatus {
  if (taskStatuses.has(input.status)) {
    return input.status;
  }

  throw new ValidationError({
    message: "Expected a valid task status.",
    details: { field: input.field },
  });
}
