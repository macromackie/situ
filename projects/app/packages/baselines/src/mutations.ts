import {
  type ActorRef,
  type IsoTimestamp,
  type SituId,
  createId,
  createSyncMetadata,
  touchSyncMetadata,
} from "@situ/common";
import { ValidationError } from "@situ/errors";

import type { BaselineRecord, BaselineStatus } from "./types.js";

const baselineStatuses = new Set<BaselineStatus>(["active", "superseded", "abandoned"]);

export type CreateBaselineRecordInput = {
  readonly id?: SituId<"baseline">;
  readonly projectId: SituId<"project">;
  readonly taskId?: SituId<"task">;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly status?: BaselineStatus;
  readonly createdBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export type MoveBaselineRecordInput = {
  readonly baseline: BaselineRecord;
  readonly status: BaselineStatus;
  readonly now?: IsoTimestamp;
};

/**
 * Creates a baseline record.
 */
export function createBaselineRecord(input: CreateBaselineRecordInput): BaselineRecord {
  return {
    id: input.id ?? createId({ prefix: "baseline" }),
    projectId: input.projectId,
    taskId: input.taskId,
    title: requireNonEmptyString({
      field: "title",
      value: input.title,
    }),
    summaryMarkdown: requireNonEmptyString({
      field: "summaryMarkdown",
      value: input.summaryMarkdown,
    }),
    status: requireBaselineStatus({
      field: "status",
      status: input.status ?? "active",
    }),
    createdBy: normalizeActorRef({
      actor: input.createdBy,
      field: "createdBy",
    }),
    metadata: createSyncMetadata({ now: input.now }),
  };
}

/**
 * Returns a baseline record with a new status.
 */
export function moveBaselineRecord(input: MoveBaselineRecordInput): BaselineRecord {
  return {
    ...input.baseline,
    status: requireBaselineStatus({
      field: "status",
      status: input.status,
    }),
    metadata: touchSyncMetadata({
      metadata: input.baseline.metadata,
      now: input.now,
    }),
  };
}

export function normalizeBaselineStatus(input: {
  readonly field: string;
  readonly status: BaselineStatus;
}): BaselineStatus {
  return requireBaselineStatus(input);
}

function requireBaselineStatus(input: {
  readonly field: string;
  readonly status: BaselineStatus;
}): BaselineStatus {
  if (baselineStatuses.has(input.status)) {
    return input.status;
  }

  throw new ValidationError({
    message: "Expected a valid baseline status.",
    details: { field: input.field },
  });
}

function normalizeActorRef(input: { readonly actor: ActorRef; readonly field: string }): ActorRef {
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

function requireNonEmptyString(input: { readonly field: string; readonly value: string }): string {
  const value = input.value.trim();

  if (value.length > 0) {
    return value;
  }

  throw new ValidationError({
    message: "Expected a non-empty string.",
    details: { field: input.field },
  });
}

function optionalNonEmptyString(input: {
  readonly field: string;
  readonly value?: string;
}): string | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  return requireNonEmptyString({
    field: input.field,
    value: input.value,
  });
}
