import type { BaselineRecord, CreateBaselineInput, ListBaselinesInput } from "@situ/baselines";
import type { ActorRef, IsoTimestamp, SituId } from "@situ/common";
import type { EventRecord } from "@situ/events";

import type { AppActionContext } from "./context.js";
import { runAppTransaction } from "./context.js";

export type CreateBaselineActionInput = CreateBaselineInput & {
  readonly context: AppActionContext;
  readonly eventId?: SituId<"event">;
};

export type CreateBaselineActionResult = {
  readonly baseline: BaselineRecord;
  readonly event: EventRecord;
};

export type CreateBaselineInContextInput = Omit<CreateBaselineActionInput, "context"> & {
  readonly context: AppActionContext;
};

/**
 * Creates a baseline and event inside the caller's context.
 */
export function createBaselineInContext(
  input: CreateBaselineInContextInput,
): CreateBaselineActionResult {
  const baseline = input.context.repositories.baselines.create({
    id: input.id,
    projectId: input.projectId,
    taskId: input.taskId,
    title: input.title,
    summaryMarkdown: input.summaryMarkdown,
    status: input.status,
    createdBy: input.createdBy,
    now: input.now,
  });
  const event = input.context.repositories.events.create({
    id: input.eventId,
    target: {
      targetKind: "baseline",
      targetId: baseline.id,
    },
    actor: baseline.createdBy,
    summaryMarkdown: "Created baseline",
    now: input.now,
  });

  return {
    baseline,
    event,
  };
}

export function createBaselineAction(input: CreateBaselineActionInput): CreateBaselineActionResult {
  return runAppTransaction({
    context: input.context,
    run: (context) =>
      createBaselineInContext({
        ...input,
        context,
      }),
  });
}

export type GetBaselineActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"baseline">;
};

export function getBaselineAction(input: GetBaselineActionInput): BaselineRecord | undefined {
  return input.context.repositories.baselines.getById({
    id: input.id,
  });
}

export type ListBaselinesActionInput = ListBaselinesInput & {
  readonly context: AppActionContext;
};

export function listBaselinesAction(input: ListBaselinesActionInput): readonly BaselineRecord[] {
  return input.context.repositories.baselines.list({
    projectId: input.projectId,
    taskId: input.taskId,
    status: input.status,
  });
}

export type MoveBaselineActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"baseline">;
  readonly status: BaselineRecord["status"];
  readonly actor: ActorRef;
  readonly eventId?: SituId<"event">;
  readonly now?: IsoTimestamp;
};

export type MoveBaselineActionResult = {
  readonly baseline: BaselineRecord;
  readonly event: EventRecord;
};

export type MoveBaselineInContextInput = Omit<MoveBaselineActionInput, "context"> & {
  readonly context: AppActionContext;
};

/**
 * Moves a baseline and creates an event inside the caller's context.
 */
export function moveBaselineInContext(input: MoveBaselineInContextInput): MoveBaselineActionResult {
  const baseline = input.context.repositories.baselines.move({
    id: input.id,
    status: input.status,
    now: input.now,
  });
  const event = input.context.repositories.events.create({
    id: input.eventId,
    target: {
      targetKind: "baseline",
      targetId: baseline.id,
    },
    actor: input.actor,
    summaryMarkdown: `Moved baseline to ${input.status}`,
    now: input.now,
  });

  return {
    baseline,
    event,
  };
}

export function moveBaselineAction(input: MoveBaselineActionInput): MoveBaselineActionResult {
  return runAppTransaction({
    context: input.context,
    run: (context) =>
      moveBaselineInContext({
        ...input,
        context,
      }),
  });
}
