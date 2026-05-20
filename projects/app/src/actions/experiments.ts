import type { ActorRef, SituId } from "@situ/common";
import type { EventRecord } from "@situ/events";
import type {
  AssignExperimentInput,
  CreateExperimentInput,
  ExperimentRecord,
  ListExperimentsInput,
  MoveExperimentInput,
  ReviseExperimentInput,
} from "@situ/experiments";

import type { AppActionContext } from "./context.js";
import { runAppTransaction } from "./context.js";

export type CreateExperimentActionInput = CreateExperimentInput & {
  readonly context: AppActionContext;
  readonly eventId?: SituId<"event">;
};

export type CreateExperimentActionResult = {
  readonly experiment: ExperimentRecord;
  readonly event: EventRecord;
};

export type CreateExperimentInContextInput = Omit<CreateExperimentActionInput, "context"> & {
  readonly context: AppActionContext;
};

/**
 * Creates an experiment and event inside the caller's context.
 */
export function createExperimentInContext(
  input: CreateExperimentInContextInput,
): CreateExperimentActionResult {
  const experiment = input.context.repositories.experiments.create({
    id: input.id,
    projectId: input.projectId,
    taskId: input.taskId,
    title: input.title,
    summaryMarkdown: input.summaryMarkdown,
    createdBy: input.createdBy,
    assignedTo: input.assignedTo,
    status: input.status,
    baseRef: input.baseRef,
    branchName: input.branchName,
    worktreePath: input.worktreePath,
    now: input.now,
  });
  const event = input.context.repositories.events.create({
    id: input.eventId,
    target: {
      targetKind: "experiment",
      targetId: experiment.id,
    },
    actor: experiment.createdBy,
    summaryMarkdown: "Created experiment",
    now: input.now,
  });

  return {
    experiment,
    event,
  };
}

export function createExperimentAction(
  input: CreateExperimentActionInput,
): CreateExperimentActionResult {
  return runAppTransaction({
    context: input.context,
    run: (context) =>
      createExperimentInContext({
        ...input,
        context,
      }),
  });
}

export type GetExperimentActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"experiment">;
};

export function getExperimentAction(input: GetExperimentActionInput): ExperimentRecord | undefined {
  return input.context.repositories.experiments.getById({
    id: input.id,
  });
}

export type ListExperimentsActionInput = ListExperimentsInput & {
  readonly context: AppActionContext;
};

export function listExperimentsAction(
  input: ListExperimentsActionInput,
): readonly ExperimentRecord[] {
  return input.context.repositories.experiments.list({
    projectId: input.projectId,
    taskId: input.taskId,
    status: input.status,
    assignedTo: input.assignedTo,
  });
}

export type MoveExperimentActionInput = MoveExperimentInput & {
  readonly context: AppActionContext;
  readonly actor: ActorRef;
  readonly eventId?: SituId<"event">;
};

export type MoveExperimentActionResult = {
  readonly experiment: ExperimentRecord;
  readonly event: EventRecord;
};

export type MoveExperimentInContextInput = Omit<MoveExperimentActionInput, "context"> & {
  readonly context: AppActionContext;
};

/**
 * Moves an experiment and creates an event inside the caller's context.
 */
export function moveExperimentInContext(
  input: MoveExperimentInContextInput,
): MoveExperimentActionResult {
  const experiment = input.context.repositories.experiments.move({
    id: input.id,
    status: input.status,
    now: input.now,
  });
  const event = input.context.repositories.events.create({
    id: input.eventId,
    target: {
      targetKind: "experiment",
      targetId: experiment.id,
    },
    actor: input.actor,
    summaryMarkdown: `Moved experiment to ${input.status}`,
    now: input.now,
  });

  return {
    experiment,
    event,
  };
}

export function moveExperimentAction(input: MoveExperimentActionInput): MoveExperimentActionResult {
  return runAppTransaction({
    context: input.context,
    run: (context) =>
      moveExperimentInContext({
        ...input,
        context,
      }),
  });
}

export type AssignExperimentActionInput = AssignExperimentInput & {
  readonly context: AppActionContext;
  readonly actor: ActorRef;
  readonly eventId?: SituId<"event">;
};

export type AssignExperimentActionResult = {
  readonly experiment: ExperimentRecord;
  readonly event: EventRecord;
};

export type AssignExperimentInContextInput = Omit<AssignExperimentActionInput, "context"> & {
  readonly context: AppActionContext;
};

/**
 * Assigns an experiment and creates an event inside the caller's context.
 */
export function assignExperimentInContext(
  input: AssignExperimentInContextInput,
): AssignExperimentActionResult {
  const experiment = input.context.repositories.experiments.assign({
    id: input.id,
    assignedTo: input.assignedTo,
    now: input.now,
  });
  const event = input.context.repositories.events.create({
    id: input.eventId,
    target: {
      targetKind: "experiment",
      targetId: experiment.id,
    },
    actor: input.actor,
    summaryMarkdown: assignmentSummary({
      assignedTo: input.assignedTo,
    }),
    now: input.now,
  });

  return {
    experiment,
    event,
  };
}

export function assignExperimentAction(
  input: AssignExperimentActionInput,
): AssignExperimentActionResult {
  return runAppTransaction({
    context: input.context,
    run: (context) =>
      assignExperimentInContext({
        ...input,
        context,
      }),
  });
}

export type ReviseExperimentActionInput = ReviseExperimentInput & {
  readonly context: AppActionContext;
  readonly actor: ActorRef;
  readonly eventId?: SituId<"event">;
};

export type ReviseExperimentActionResult = {
  readonly experiment: ExperimentRecord;
  readonly event: EventRecord;
};

export type ReviseExperimentInContextInput = Omit<ReviseExperimentActionInput, "context"> & {
  readonly context: AppActionContext;
};

/**
 * Revises an experiment and creates an event inside the caller's context.
 */
export function reviseExperimentInContext(
  input: ReviseExperimentInContextInput,
): ReviseExperimentActionResult {
  const experiment = input.context.repositories.experiments.revise({
    id: input.id,
    summaryMarkdown: input.summaryMarkdown,
    status: input.status,
    baseRef: input.baseRef,
    clearBaseRef: input.clearBaseRef,
    branchName: input.branchName,
    clearBranchName: input.clearBranchName,
    worktreePath: input.worktreePath,
    clearWorktreePath: input.clearWorktreePath,
    now: input.now,
  });
  const event = input.context.repositories.events.create({
    id: input.eventId,
    target: {
      targetKind: "experiment",
      targetId: experiment.id,
    },
    actor: input.actor,
    summaryMarkdown: `Revised experiment to revision ${experiment.revisionNumber}`,
    now: input.now,
  });

  return {
    experiment,
    event,
  };
}

export function reviseExperimentAction(
  input: ReviseExperimentActionInput,
): ReviseExperimentActionResult {
  return runAppTransaction({
    context: input.context,
    run: (context) =>
      reviseExperimentInContext({
        ...input,
        context,
      }),
  });
}

type AssignmentSummaryInput = {
  readonly assignedTo?: ActorRef;
};

function assignmentSummary(input: AssignmentSummaryInput): string {
  if (input.assignedTo === undefined) {
    return "Cleared experiment assignee";
  }

  return `Assigned experiment to ${input.assignedTo.displayName ?? input.assignedTo.actorId}`;
}
