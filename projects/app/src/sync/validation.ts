import {
  createSyncMetadata,
  type ActorKind,
  type ActorRef,
  type SituId,
  type TargetKind,
  type TargetRef,
} from "@situ/common";
import { ValidationError } from "@situ/errors";
import type { BaselineStatus } from "@situ/baselines";
import type { ExperimentStatus } from "@situ/experiments";
import type { ReviewDecision } from "@situ/reviews";
import type { TaskStatus } from "@situ/tasks";

import type {
  ArchiveProjectMutationArgs,
  AssignTaskMutationArgs,
  AssignExperimentMutationArgs,
  CreateArtifactMutationArgs,
  CreateBaselineMutationArgs,
  CreateCommentMutationArgs,
  CreateEventMutationArgs,
  CreateExperimentMutationArgs,
  CreateMeasurementMutationArgs,
  CreateNotificationMutationArgs,
  CreateProjectMutationArgs,
  CreateReportMutationArgs,
  CreateReviewMutationArgs,
  CreateTaskMutationArgs,
  DismissNotificationMutationArgs,
  JsonValue,
  MoveExperimentMutationArgs,
  MoveBaselineMutationArgs,
  MoveTaskMutationArgs,
  ReadNotificationMutationArgs,
  ReplicacheMutation,
  ReplicachePullRequest,
  ReplicachePushRequest,
  ReviseExperimentMutationArgs,
} from "./types.js";

const actorKinds = new Set<ActorKind>(["human", "local_agent", "system"]);
const targetKinds = new Set<TargetKind>([
  "project",
  "task",
  "comment",
  "event",
  "notification",
  "baseline",
  "experiment",
  "measurement",
  "artifact",
  "review",
  "report",
]);
const taskStatuses = new Set<TaskStatus>([
  "triage",
  "backlog",
  "in_progress",
  "in_review",
  "done",
  "canceled",
]);
const experimentStatuses = new Set<ExperimentStatus>([
  "planned",
  "running",
  "ready_for_review",
  "accepted",
  "rejected",
  "abandoned",
]);
const baselineStatuses = new Set<BaselineStatus>(["active", "superseded", "abandoned"]);
const reviewDecisions = new Set<ReviewDecision>([
  "approved",
  "changes_requested",
  "rejected",
  "commented",
]);
const sha256Pattern = /^[0-9a-f]{64}$/;

export function validateReplicachePushRequest(input: {
  readonly value: unknown;
}): ReplicachePushRequest {
  const value = requireObject({
    field: "body",
    value: input.value,
  });
  const pushVersion = value.pushVersion;

  if (pushVersion !== 1) {
    throw new ValidationError({
      message: "Expected Replicache pushVersion 1.",
      details: { field: "pushVersion" },
    });
  }

  const mutations = value.mutations;

  if (!Array.isArray(mutations)) {
    throw new ValidationError({
      message: "Expected Replicache mutations array.",
      details: { field: "mutations" },
    });
  }

  return {
    pushVersion,
    clientGroupID: requireNonEmptyString({
      field: "clientGroupID",
      value: value.clientGroupID,
    }),
    mutations: mutations.map((mutation, index) =>
      validateReplicacheMutation({
        mutation,
        index,
      }),
    ),
    profileID: requireNonEmptyString({
      field: "profileID",
      value: value.profileID,
    }),
    schemaVersion: requireNonEmptyString({
      field: "schemaVersion",
      value: value.schemaVersion,
    }),
  };
}

export function parseReplicachePushRequest(value: unknown): ReplicachePushRequest {
  return validateReplicachePushRequest({ value });
}

export function validateReplicachePullRequest(input: {
  readonly value: unknown;
}): ReplicachePullRequest {
  const value = requireObject({
    field: "body",
    value: input.value,
  });
  const pullVersion = value.pullVersion;

  if (pullVersion !== 1) {
    throw new ValidationError({
      message: "Expected Replicache pullVersion 1.",
      details: { field: "pullVersion" },
    });
  }

  return {
    pullVersion,
    clientGroupID: requireNonEmptyString({
      field: "clientGroupID",
      value: value.clientGroupID,
    }),
    cookie: requireJsonValue({
      field: "cookie",
      value: value.cookie,
    }),
    profileID: requireNonEmptyString({
      field: "profileID",
      value: value.profileID,
    }),
    schemaVersion: requireNonEmptyString({
      field: "schemaVersion",
      value: value.schemaVersion,
    }),
  };
}

export function parseReplicachePullRequest(value: unknown): ReplicachePullRequest {
  return validateReplicachePullRequest({ value });
}

function validateReplicacheMutation(input: {
  readonly mutation: unknown;
  readonly index: number;
}): ReplicacheMutation {
  const mutation = requireObject({
    field: `mutations.${input.index}`,
    value: input.mutation,
  });

  return {
    clientID: requireNonEmptyString({
      field: `mutations.${input.index}.clientID`,
      value: mutation.clientID,
    }),
    id: requirePositiveSafeInteger({
      field: `mutations.${input.index}.id`,
      value: mutation.id,
    }),
    name: requireNonEmptyString({
      field: `mutations.${input.index}.name`,
      value: mutation.name,
    }),
    args: mutation.args,
    timestamp: requireFiniteNumber({
      field: `mutations.${input.index}.timestamp`,
      value: mutation.timestamp,
    }),
  };
}

function validateCreateProjectMutationArgs(input: {
  readonly args: unknown;
}): CreateProjectMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: optionalSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"project"> | undefined,
    eventId: optionalSituId({
      field: "args.eventId",
      value: args.eventId,
    }) as SituId<"event"> | undefined,
    name: requireNonEmptyString({
      field: "args.name",
      value: args.name,
    }),
    repositoryPath: requireNonEmptyString({
      field: "args.repositoryPath",
      value: args.repositoryPath,
    }),
    goalMarkdown: requireNonEmptyString({
      field: "args.goalMarkdown",
      value: args.goalMarkdown,
    }),
    createdBy: requireActorRef({
      field: "args.createdBy",
      value: args.createdBy,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseCreateProjectMutationArgs(args: unknown): CreateProjectMutationArgs {
  return validateCreateProjectMutationArgs({ args });
}

function validateCreateTaskMutationArgs(input: { readonly args: unknown }): CreateTaskMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: optionalSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"task"> | undefined,
    eventId: optionalSituId({
      field: "args.eventId",
      value: args.eventId,
    }) as SituId<"event"> | undefined,
    projectId: requireSituId({
      field: "args.projectId",
      value: args.projectId,
    }) as SituId<"project">,
    title: requireNonEmptyString({
      field: "args.title",
      value: args.title,
    }),
    bodyMarkdown: requireNonEmptyString({
      field: "args.bodyMarkdown",
      value: args.bodyMarkdown,
    }),
    status: optionalTaskStatus({
      field: "args.status",
      value: args.status,
    }),
    createdBy: requireActorRef({
      field: "args.createdBy",
      value: args.createdBy,
    }),
    assignedTo: optionalActorRef({
      field: "args.assignedTo",
      value: args.assignedTo,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseCreateTaskMutationArgs(args: unknown): CreateTaskMutationArgs {
  return validateCreateTaskMutationArgs({ args });
}

function validateMoveTaskMutationArgs(input: { readonly args: unknown }): MoveTaskMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"task">,
    eventId: optionalSituId({
      field: "args.eventId",
      value: args.eventId,
    }) as SituId<"event"> | undefined,
    status: requireTaskStatus({
      field: "args.status",
      value: args.status,
    }),
    actor: requireActorRef({
      field: "args.actor",
      value: args.actor,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseMoveTaskMutationArgs(args: unknown): MoveTaskMutationArgs {
  return validateMoveTaskMutationArgs({ args });
}

function validateArchiveProjectMutationArgs(input: {
  readonly args: unknown;
}): ArchiveProjectMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"project">,
    eventId: optionalSituId({
      field: "args.eventId",
      value: args.eventId,
    }) as SituId<"event"> | undefined,
    actor: requireActorRef({
      field: "args.actor",
      value: args.actor,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseArchiveProjectMutationArgs(args: unknown): ArchiveProjectMutationArgs {
  return validateArchiveProjectMutationArgs({ args });
}

function validateAssignTaskMutationArgs(input: { readonly args: unknown }): AssignTaskMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"task">,
    eventId: optionalSituId({
      field: "args.eventId",
      value: args.eventId,
    }) as SituId<"event"> | undefined,
    actor: requireActorRef({
      field: "args.actor",
      value: args.actor,
    }),
    assignedTo: optionalActorRef({
      field: "args.assignedTo",
      value: args.assignedTo,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseAssignTaskMutationArgs(args: unknown): AssignTaskMutationArgs {
  return validateAssignTaskMutationArgs({ args });
}

function validateCreateCommentMutationArgs(input: {
  readonly args: unknown;
}): CreateCommentMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"comment">,
    target: requireTargetRef({
      field: "args.target",
      value: args.target,
    }),
    bodyMarkdown: requireNonEmptyString({
      field: "args.bodyMarkdown",
      value: args.bodyMarkdown,
    }),
    author: requireActorRef({
      field: "args.author",
      value: args.author,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseCreateCommentMutationArgs(args: unknown): CreateCommentMutationArgs {
  return validateCreateCommentMutationArgs({ args });
}

function validateCreateNotificationMutationArgs(input: {
  readonly args: unknown;
}): CreateNotificationMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"notification">,
    recipient: requireNotificationRecipient({
      field: "args.recipient",
      value: args.recipient,
    }),
    target: requireTargetRef({
      field: "args.target",
      value: args.target,
    }),
    createdBy: requireActorRef({
      field: "args.createdBy",
      value: args.createdBy,
    }),
    summaryMarkdown: requireNonEmptyString({
      field: "args.summaryMarkdown",
      value: args.summaryMarkdown,
    }),
    bodyMarkdown: optionalNonEmptyString({
      field: "args.bodyMarkdown",
      value: args.bodyMarkdown,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseCreateNotificationMutationArgs(args: unknown): CreateNotificationMutationArgs {
  return validateCreateNotificationMutationArgs({ args });
}

function validateCreateEventMutationArgs(input: {
  readonly args: unknown;
}): CreateEventMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"event">,
    target: requireTargetRef({
      field: "args.target",
      value: args.target,
    }),
    actor: requireActorRef({
      field: "args.actor",
      value: args.actor,
    }),
    summaryMarkdown: requireNonEmptyString({
      field: "args.summaryMarkdown",
      value: args.summaryMarkdown,
    }),
    bodyMarkdown: optionalNonEmptyString({
      field: "args.bodyMarkdown",
      value: args.bodyMarkdown,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseCreateEventMutationArgs(args: unknown): CreateEventMutationArgs {
  return validateCreateEventMutationArgs({ args });
}

function validateReadNotificationMutationArgs(input: {
  readonly args: unknown;
}): ReadNotificationMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"notification">,
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseReadNotificationMutationArgs(args: unknown): ReadNotificationMutationArgs {
  return validateReadNotificationMutationArgs({ args });
}

function validateDismissNotificationMutationArgs(input: {
  readonly args: unknown;
}): DismissNotificationMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"notification">,
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseDismissNotificationMutationArgs(
  args: unknown,
): DismissNotificationMutationArgs {
  return validateDismissNotificationMutationArgs({ args });
}

function validateCreateExperimentMutationArgs(input: {
  readonly args: unknown;
}): CreateExperimentMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"experiment">,
    eventId: optionalSituId({
      field: "args.eventId",
      value: args.eventId,
    }) as SituId<"event"> | undefined,
    projectId: requireSituId({
      field: "args.projectId",
      value: args.projectId,
    }) as SituId<"project">,
    taskId: requireSituId({
      field: "args.taskId",
      value: args.taskId,
    }) as SituId<"task">,
    title: requireNonEmptyString({
      field: "args.title",
      value: args.title,
    }),
    summaryMarkdown: requireNonEmptyString({
      field: "args.summaryMarkdown",
      value: args.summaryMarkdown,
    }),
    createdBy: requireActorRef({
      field: "args.createdBy",
      value: args.createdBy,
    }),
    assignedTo: optionalActorRef({
      field: "args.assignedTo",
      value: args.assignedTo,
    }),
    status: optionalExperimentStatus({
      field: "args.status",
      value: args.status,
    }),
    baseRef: optionalNonEmptyString({
      field: "args.baseRef",
      value: args.baseRef,
    }),
    branchName: optionalNonEmptyString({
      field: "args.branchName",
      value: args.branchName,
    }),
    worktreePath: optionalNonEmptyString({
      field: "args.worktreePath",
      value: args.worktreePath,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseCreateExperimentMutationArgs(args: unknown): CreateExperimentMutationArgs {
  return validateCreateExperimentMutationArgs({ args });
}

function validateMoveExperimentMutationArgs(input: {
  readonly args: unknown;
}): MoveExperimentMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"experiment">,
    eventId: optionalSituId({
      field: "args.eventId",
      value: args.eventId,
    }) as SituId<"event"> | undefined,
    status: requireExperimentStatus({
      field: "args.status",
      value: args.status,
    }),
    actor: requireActorRef({
      field: "args.actor",
      value: args.actor,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseMoveExperimentMutationArgs(args: unknown): MoveExperimentMutationArgs {
  return validateMoveExperimentMutationArgs({ args });
}

function validateAssignExperimentMutationArgs(input: {
  readonly args: unknown;
}): AssignExperimentMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"experiment">,
    eventId: optionalSituId({
      field: "args.eventId",
      value: args.eventId,
    }) as SituId<"event"> | undefined,
    actor: requireActorRef({
      field: "args.actor",
      value: args.actor,
    }),
    assignedTo: optionalActorRef({
      field: "args.assignedTo",
      value: args.assignedTo,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseAssignExperimentMutationArgs(args: unknown): AssignExperimentMutationArgs {
  return validateAssignExperimentMutationArgs({ args });
}

function validateReviseExperimentMutationArgs(input: {
  readonly args: unknown;
}): ReviseExperimentMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"experiment">,
    eventId: optionalSituId({
      field: "args.eventId",
      value: args.eventId,
    }) as SituId<"event"> | undefined,
    summaryMarkdown: optionalNonEmptyString({
      field: "args.summaryMarkdown",
      value: args.summaryMarkdown,
    }),
    status: optionalExperimentStatus({
      field: "args.status",
      value: args.status,
    }),
    baseRef: optionalNonEmptyString({
      field: "args.baseRef",
      value: args.baseRef,
    }),
    clearBaseRef: optionalBoolean({
      field: "args.clearBaseRef",
      value: args.clearBaseRef,
    }),
    branchName: optionalNonEmptyString({
      field: "args.branchName",
      value: args.branchName,
    }),
    clearBranchName: optionalBoolean({
      field: "args.clearBranchName",
      value: args.clearBranchName,
    }),
    worktreePath: optionalNonEmptyString({
      field: "args.worktreePath",
      value: args.worktreePath,
    }),
    clearWorktreePath: optionalBoolean({
      field: "args.clearWorktreePath",
      value: args.clearWorktreePath,
    }),
    actor: requireActorRef({
      field: "args.actor",
      value: args.actor,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseReviseExperimentMutationArgs(args: unknown): ReviseExperimentMutationArgs {
  return validateReviseExperimentMutationArgs({ args });
}

function validateCreateBaselineMutationArgs(input: {
  readonly args: unknown;
}): CreateBaselineMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"baseline">,
    eventId: optionalSituId({
      field: "args.eventId",
      value: args.eventId,
    }) as SituId<"event"> | undefined,
    projectId: requireSituId({
      field: "args.projectId",
      value: args.projectId,
    }) as SituId<"project">,
    taskId: optionalSituId({
      field: "args.taskId",
      value: args.taskId,
    }) as SituId<"task"> | undefined,
    title: requireNonEmptyString({
      field: "args.title",
      value: args.title,
    }),
    summaryMarkdown: requireNonEmptyString({
      field: "args.summaryMarkdown",
      value: args.summaryMarkdown,
    }),
    createdBy: requireActorRef({
      field: "args.createdBy",
      value: args.createdBy,
    }),
    status: optionalBaselineStatus({
      field: "args.status",
      value: args.status,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseCreateBaselineMutationArgs(args: unknown): CreateBaselineMutationArgs {
  return validateCreateBaselineMutationArgs({ args });
}

function validateMoveBaselineMutationArgs(input: {
  readonly args: unknown;
}): MoveBaselineMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"baseline">,
    eventId: optionalSituId({
      field: "args.eventId",
      value: args.eventId,
    }) as SituId<"event"> | undefined,
    status: requireBaselineStatus({
      field: "args.status",
      value: args.status,
    }),
    actor: requireActorRef({
      field: "args.actor",
      value: args.actor,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseMoveBaselineMutationArgs(args: unknown): MoveBaselineMutationArgs {
  return validateMoveBaselineMutationArgs({ args });
}

function validateCreateMeasurementMutationArgs(input: {
  readonly args: unknown;
}): CreateMeasurementMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });
  const target = requireMeasurementTarget({
    args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"measurement">,
    baselineId: target.baselineId,
    experimentId: target.experimentId,
    revisionNumber: target.revisionNumber,
    metricName: requireNonEmptyString({
      field: "args.metricName",
      value: args.metricName,
    }),
    numericValue: requireFiniteNumber({
      field: "args.numericValue",
      value: args.numericValue,
    }),
    unit: optionalNonEmptyString({
      field: "args.unit",
      value: args.unit,
    }),
    summaryMarkdown: requireNonEmptyString({
      field: "args.summaryMarkdown",
      value: args.summaryMarkdown,
    }),
    detailsMarkdown: optionalNonEmptyString({
      field: "args.detailsMarkdown",
      value: args.detailsMarkdown,
    }),
    measuredBy: requireActorRef({
      field: "args.measuredBy",
      value: args.measuredBy,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseCreateMeasurementMutationArgs(args: unknown): CreateMeasurementMutationArgs {
  return validateCreateMeasurementMutationArgs({ args });
}

function requireMeasurementTarget(input: { readonly args: Readonly<Record<string, unknown>> }): {
  readonly baselineId?: SituId<"baseline">;
  readonly experimentId?: SituId<"experiment">;
  readonly revisionNumber?: number;
} {
  const hasBaselineId = input.args.baselineId !== undefined;
  const hasExperimentId = input.args.experimentId !== undefined;
  const hasRevisionNumber = input.args.revisionNumber !== undefined;

  if (hasBaselineId && !hasExperimentId && !hasRevisionNumber) {
    return {
      baselineId: requireSituId({
        field: "args.baselineId",
        value: input.args.baselineId,
      }) as SituId<"baseline">,
    };
  }

  if (!hasBaselineId && hasExperimentId && hasRevisionNumber) {
    return {
      experimentId: requireSituId({
        field: "args.experimentId",
        value: input.args.experimentId,
      }) as SituId<"experiment">,
      revisionNumber: requirePositiveSafeInteger({
        field: "args.revisionNumber",
        value: input.args.revisionNumber,
      }),
    };
  }

  throw new ValidationError({
    message: "Expected exactly one measurement target.",
    details: {
      baselineId: input.args.baselineId,
      experimentId: input.args.experimentId,
      revisionNumber: input.args.revisionNumber,
    },
  });
}

function validateCreateArtifactMutationArgs(input: {
  readonly args: unknown;
}): CreateArtifactMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"artifact">,
    target: requireTargetRef({
      field: "args.target",
      value: args.target,
    }),
    title: requireNonEmptyString({
      field: "args.title",
      value: args.title,
    }),
    summaryMarkdown: requireNonEmptyString({
      field: "args.summaryMarkdown",
      value: args.summaryMarkdown,
    }),
    uri: requireNonEmptyString({
      field: "args.uri",
      value: args.uri,
    }),
    mediaType: optionalNonEmptyString({
      field: "args.mediaType",
      value: args.mediaType,
    }),
    byteSize: optionalNonNegativeSafeInteger({
      field: "args.byteSize",
      value: args.byteSize,
    }),
    sha256: optionalSha256({
      field: "args.sha256",
      value: args.sha256,
    }),
    createdBy: requireActorRef({
      field: "args.createdBy",
      value: args.createdBy,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseCreateArtifactMutationArgs(args: unknown): CreateArtifactMutationArgs {
  return validateCreateArtifactMutationArgs({ args });
}

function validateCreateReportMutationArgs(input: {
  readonly args: unknown;
}): CreateReportMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"report">,
    projectId: requireSituId({
      field: "args.projectId",
      value: args.projectId,
    }) as SituId<"project">,
    target: requireTargetRef({
      field: "args.target",
      value: args.target,
    }),
    title: requireNonEmptyString({
      field: "args.title",
      value: args.title,
    }),
    bodyMarkdown: requireNonEmptyString({
      field: "args.bodyMarkdown",
      value: args.bodyMarkdown,
    }),
    generatedBy: requireActorRef({
      field: "args.generatedBy",
      value: args.generatedBy,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseCreateReportMutationArgs(args: unknown): CreateReportMutationArgs {
  return validateCreateReportMutationArgs({ args });
}

function validateCreateReviewMutationArgs(input: {
  readonly args: unknown;
}): CreateReviewMutationArgs {
  const args = requireObject({
    field: "args",
    value: input.args,
  });

  return {
    id: requireSituId({
      field: "args.id",
      value: args.id,
    }) as SituId<"review">,
    experimentId: requireSituId({
      field: "args.experimentId",
      value: args.experimentId,
    }) as SituId<"experiment">,
    revisionNumber: requirePositiveSafeInteger({
      field: "args.revisionNumber",
      value: args.revisionNumber,
    }),
    decision: requireReviewDecision({
      field: "args.decision",
      value: args.decision,
    }),
    bodyMarkdown: requireNonEmptyString({
      field: "args.bodyMarkdown",
      value: args.bodyMarkdown,
    }),
    reviewer: requireActorRef({
      field: "args.reviewer",
      value: args.reviewer,
    }),
    now: optionalIsoTimestamp({
      field: "args.now",
      value: args.now,
    }),
  };
}

export function parseCreateReviewMutationArgs(args: unknown): CreateReviewMutationArgs {
  return validateCreateReviewMutationArgs({ args });
}

function requireObject(input: {
  readonly field: string;
  readonly value: unknown;
}): Readonly<Record<string, unknown>> {
  if (typeof input.value === "object" && input.value !== null && !Array.isArray(input.value)) {
    return input.value as Readonly<Record<string, unknown>>;
  }

  throw new ValidationError({
    message: "Expected an object.",
    details: { field: input.field },
  });
}

function requireNonEmptyString(input: { readonly field: string; readonly value: unknown }): string {
  if (typeof input.value === "string") {
    const value = input.value.trim();

    if (value.length > 0) {
      return value;
    }
  }

  throw new ValidationError({
    message: "Expected a non-empty string.",
    details: { field: input.field },
  });
}

function requirePositiveSafeInteger(input: {
  readonly field: string;
  readonly value: unknown;
}): number {
  if (typeof input.value === "number" && Number.isSafeInteger(input.value) && input.value > 0) {
    return input.value;
  }

  throw new ValidationError({
    message: "Expected a positive safe integer.",
    details: { field: input.field },
  });
}

function requireFiniteNumber(input: { readonly field: string; readonly value: unknown }): number {
  if (typeof input.value === "number" && Number.isFinite(input.value)) {
    return input.value;
  }

  throw new ValidationError({
    message: "Expected a finite number.",
    details: { field: input.field },
  });
}

function optionalNonNegativeSafeInteger(input: {
  readonly field: string;
  readonly value: unknown;
}): number | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  if (typeof input.value === "number" && Number.isSafeInteger(input.value) && input.value >= 0) {
    return input.value;
  }

  throw new ValidationError({
    message: "Expected a non-negative safe integer.",
    details: { field: input.field },
  });
}

function requireJsonValue(input: { readonly field: string; readonly value: unknown }): JsonValue {
  if (isJsonValue(input.value)) {
    return input.value;
  }

  throw new ValidationError({
    message: "Expected a JSON value.",
    details: { field: input.field },
  });
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }

  if (isJsonObjectRecord(value)) {
    return Object.values(value).every((item) => isJsonValue(item));
  }

  return false;
}

function isJsonObjectRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function requireSituId(input: { readonly field: string; readonly value: unknown }): SituId {
  return requireNonEmptyString(input) as SituId;
}

function optionalSituId(input: {
  readonly field: string;
  readonly value: unknown;
}): SituId | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  return requireSituId(input);
}

function requireActorRef(input: { readonly field: string; readonly value: unknown }): ActorRef {
  const actor = requireObject(input);
  const actorKind = requireNonEmptyString({
    field: `${input.field}.actorKind`,
    value: actor.actorKind,
  }) as ActorKind;

  if (!actorKinds.has(actorKind)) {
    throw new ValidationError({
      message: "Expected a valid actor kind.",
      details: { field: `${input.field}.actorKind` },
    });
  }

  return {
    actorKind,
    actorId: requireNonEmptyString({
      field: `${input.field}.actorId`,
      value: actor.actorId,
    }),
    displayName: optionalNonEmptyString({
      field: `${input.field}.displayName`,
      value: actor.displayName,
    }),
  };
}

function requireNotificationRecipient(input: { readonly field: string; readonly value: unknown }): {
  readonly recipientId: string;
  readonly displayName?: string;
} {
  const recipient = requireObject(input);

  return {
    recipientId: requireNonEmptyString({
      field: `${input.field}.recipientId`,
      value: recipient.recipientId,
    }),
    displayName: optionalNonEmptyString({
      field: `${input.field}.displayName`,
      value: recipient.displayName,
    }),
  };
}

function optionalActorRef(input: {
  readonly field: string;
  readonly value: unknown;
}): ActorRef | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  return requireActorRef(input);
}

function requireTargetRef(input: { readonly field: string; readonly value: unknown }): TargetRef {
  const target = requireObject(input);
  const targetKind = requireNonEmptyString({
    field: `${input.field}.targetKind`,
    value: target.targetKind,
  }) as TargetKind;

  if (!targetKinds.has(targetKind)) {
    throw new ValidationError({
      message: "Expected a valid target kind.",
      details: { field: `${input.field}.targetKind` },
    });
  }

  return {
    targetKind,
    targetId: requireSituId({
      field: `${input.field}.targetId`,
      value: target.targetId,
    }) as TargetRef["targetId"],
  };
}

function optionalNonEmptyString(input: {
  readonly field: string;
  readonly value: unknown;
}): string | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  return requireNonEmptyString(input);
}

function optionalSha256(input: {
  readonly field: string;
  readonly value: unknown;
}): string | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  const value = requireNonEmptyString(input);

  if (sha256Pattern.test(value)) {
    return value;
  }

  throw new ValidationError({
    message: "Expected a lowercase SHA-256 hex digest.",
    details: { field: input.field },
  });
}

function optionalBoolean(input: {
  readonly field: string;
  readonly value: unknown;
}): boolean | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  if (typeof input.value === "boolean") {
    return input.value;
  }

  throw new ValidationError({
    message: "Expected a boolean.",
    details: { field: input.field },
  });
}

function requireTaskStatus(input: { readonly field: string; readonly value: unknown }): TaskStatus {
  const status = requireNonEmptyString(input) as TaskStatus;

  if (taskStatuses.has(status)) {
    return status;
  }

  throw new ValidationError({
    message: "Expected a valid task status.",
    details: { field: input.field },
  });
}

function optionalTaskStatus(input: {
  readonly field: string;
  readonly value: unknown;
}): TaskStatus | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  return requireTaskStatus(input);
}

function requireExperimentStatus(input: {
  readonly field: string;
  readonly value: unknown;
}): ExperimentStatus {
  const status = requireNonEmptyString(input) as ExperimentStatus;

  if (experimentStatuses.has(status)) {
    return status;
  }

  throw new ValidationError({
    message: "Expected a valid experiment status.",
    details: { field: input.field },
  });
}

function optionalExperimentStatus(input: {
  readonly field: string;
  readonly value: unknown;
}): ExperimentStatus | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  return requireExperimentStatus(input);
}

function requireBaselineStatus(input: {
  readonly field: string;
  readonly value: unknown;
}): BaselineStatus {
  const status = requireNonEmptyString(input) as BaselineStatus;

  if (baselineStatuses.has(status)) {
    return status;
  }

  throw new ValidationError({
    message: "Expected a valid baseline status.",
    details: { field: input.field },
  });
}

function optionalBaselineStatus(input: {
  readonly field: string;
  readonly value: unknown;
}): BaselineStatus | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  return requireBaselineStatus(input);
}

function requireReviewDecision(input: {
  readonly field: string;
  readonly value: unknown;
}): ReviewDecision {
  const decision = requireNonEmptyString(input) as ReviewDecision;

  if (reviewDecisions.has(decision)) {
    return decision;
  }

  throw new ValidationError({
    message: "Expected a valid review decision.",
    details: { field: input.field },
  });
}

function optionalIsoTimestamp(input: {
  readonly field: string;
  readonly value: unknown;
}): string | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  const timestamp = requireNonEmptyString(input);

  return createSyncMetadata({
    now: timestamp,
  }).createdAt;
}
