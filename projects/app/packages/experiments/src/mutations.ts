import {
  type ActorRef,
  type IsoTimestamp,
  type SituId,
  createId,
  createSyncMetadata,
  touchSyncMetadata,
} from "@situ/common";
import { ValidationError } from "@situ/errors";

import type { ExperimentRecord, ExperimentStatus } from "./types.js";

const experimentStatuses = new Set<ExperimentStatus>([
  "planned",
  "running",
  "ready_for_review",
  "accepted",
  "rejected",
  "abandoned",
]);

export type CreateExperimentRecordInput = {
  readonly id?: SituId<"experiment">;
  readonly projectId: SituId<"project">;
  readonly taskId: SituId<"task">;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly createdBy: ActorRef;
  readonly assignedTo?: ActorRef;
  readonly status?: ExperimentStatus;
  readonly baseRef?: string;
  readonly branchName?: string;
  readonly worktreePath?: string;
  readonly now?: IsoTimestamp;
};

export type MoveExperimentRecordInput = {
  readonly experiment: ExperimentRecord;
  readonly status: ExperimentStatus;
  readonly now?: IsoTimestamp;
};

export type AssignExperimentRecordInput = {
  readonly experiment: ExperimentRecord;
  readonly assignedTo?: ActorRef;
  readonly now?: IsoTimestamp;
};

export type ReviseExperimentRecordInput = {
  readonly experiment: ExperimentRecord;
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

/**
 * Creates an experiment record.
 */
export function createExperimentRecord(input: CreateExperimentRecordInput): ExperimentRecord {
  return {
    id: input.id ?? createId({ prefix: "experiment" }),
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
    status: requireExperimentStatus({
      field: "status",
      status: input.status ?? "planned",
    }),
    revisionNumber: 1,
    baseRef: optionalNonEmptyString({
      field: "baseRef",
      value: input.baseRef,
    }),
    branchName: optionalNonEmptyString({
      field: "branchName",
      value: input.branchName,
    }),
    worktreePath: optionalNonEmptyString({
      field: "worktreePath",
      value: input.worktreePath,
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
 * Returns an experiment record with a new status.
 */
export function moveExperimentRecord(input: MoveExperimentRecordInput): ExperimentRecord {
  return {
    ...input.experiment,
    status: requireExperimentStatus({
      field: "status",
      status: input.status,
    }),
    metadata: touchSyncMetadata({
      metadata: input.experiment.metadata,
      now: input.now,
    }),
  };
}

/**
 * Returns an experiment record with a new assignee.
 */
export function assignExperimentRecord(input: AssignExperimentRecordInput): ExperimentRecord {
  return {
    ...input.experiment,
    assignedTo: normalizeOptionalActorRef({
      actor: input.assignedTo,
      field: "assignedTo",
    }),
    metadata: touchSyncMetadata({
      metadata: input.experiment.metadata,
      now: input.now,
    }),
  };
}

/**
 * Returns an experiment record with the latest revision fields.
 */
export function reviseExperimentRecord(input: ReviseExperimentRecordInput): ExperimentRecord {
  validateRevisionChange(input);

  return {
    ...input.experiment,
    summaryMarkdown:
      input.summaryMarkdown === undefined
        ? input.experiment.summaryMarkdown
        : requireNonEmptyString({
            field: "summaryMarkdown",
            value: input.summaryMarkdown,
          }),
    status:
      input.status === undefined
        ? input.experiment.status
        : requireExperimentStatus({
            field: "status",
            status: input.status,
          }),
    revisionNumber: input.experiment.revisionNumber + 1,
    baseRef: resolveRevisionOptionalString({
      field: "baseRef",
      existingValue: input.experiment.baseRef,
      replacementValue: input.baseRef,
      clear: input.clearBaseRef,
    }),
    branchName: resolveRevisionOptionalString({
      field: "branchName",
      existingValue: input.experiment.branchName,
      replacementValue: input.branchName,
      clear: input.clearBranchName,
    }),
    worktreePath: resolveRevisionOptionalString({
      field: "worktreePath",
      existingValue: input.experiment.worktreePath,
      replacementValue: input.worktreePath,
      clear: input.clearWorktreePath,
    }),
    metadata: touchSyncMetadata({
      metadata: input.experiment.metadata,
      now: input.now,
    }),
  };
}

function validateRevisionChange(input: ReviseExperimentRecordInput): void {
  assertNoClearAndReplacement({
    field: "baseRef",
    replacementValue: input.baseRef,
    clear: input.clearBaseRef,
  });
  assertNoClearAndReplacement({
    field: "branchName",
    replacementValue: input.branchName,
    clear: input.clearBranchName,
  });
  assertNoClearAndReplacement({
    field: "worktreePath",
    replacementValue: input.worktreePath,
    clear: input.clearWorktreePath,
  });

  if (
    input.summaryMarkdown !== undefined ||
    input.status !== undefined ||
    input.baseRef !== undefined ||
    input.branchName !== undefined ||
    input.worktreePath !== undefined ||
    input.clearBaseRef === true ||
    input.clearBranchName === true ||
    input.clearWorktreePath === true
  ) {
    return;
  }

  throw new ValidationError({
    message: "Expected at least one revision change.",
    details: { field: "revision" },
  });
}

type AssertNoClearAndReplacementInput = {
  readonly field: string;
  readonly replacementValue?: string;
  readonly clear?: boolean;
};

function assertNoClearAndReplacement(input: AssertNoClearAndReplacementInput): void {
  if (input.clear === true && input.replacementValue !== undefined) {
    throw new ValidationError({
      message: "Expected either a replacement value or a clear flag, not both.",
      details: { field: input.field },
    });
  }
}

type ResolveRevisionOptionalStringInput = {
  readonly field: string;
  readonly existingValue?: string;
  readonly replacementValue?: string;
  readonly clear?: boolean;
};

function resolveRevisionOptionalString(
  input: ResolveRevisionOptionalStringInput,
): string | undefined {
  if (input.clear === true) {
    return undefined;
  }

  if (input.replacementValue !== undefined) {
    return requireNonEmptyString({
      field: input.field,
      value: input.replacementValue,
    });
  }

  return input.existingValue;
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

export type NormalizeExperimentStatusInput = {
  readonly field: string;
  readonly status: ExperimentStatus;
};

/**
 * Normalizes an experiment status input.
 */
export function normalizeExperimentStatus(input: NormalizeExperimentStatusInput): ExperimentStatus {
  return requireExperimentStatus(input);
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

type RequireExperimentStatusInput = {
  readonly field: string;
  readonly status: ExperimentStatus;
};

function requireExperimentStatus(input: RequireExperimentStatusInput): ExperimentStatus {
  if (experimentStatuses.has(input.status)) {
    return input.status;
  }

  throw new ValidationError({
    message: "Expected a valid experiment status.",
    details: { field: input.field },
  });
}
