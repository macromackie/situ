import type { SituId } from "@situ/common";
import type {
  CreateLiveFocusInput,
  CreateLiveMapEdgeInput,
  CreateLiveMapNodeInput,
  CreateLiveNodeDetailInput,
  CreateLiveSignalInput,
  LiveFocusRecord,
  LiveMapEdgeRecord,
  LiveMapNodeRecord,
  LiveNodeDetailRecord,
  LiveProjectRecords,
  LiveSignalRecord,
} from "@situ/live";

import type { AppActionContext } from "./context.js";

export type CreateLiveSignalActionInput = CreateLiveSignalInput & {
  readonly context: AppActionContext;
};

export type CreateLiveMapNodeActionInput = CreateLiveMapNodeInput & {
  readonly context: AppActionContext;
};

export type CreateLiveMapEdgeActionInput = CreateLiveMapEdgeInput & {
  readonly context: AppActionContext;
};

export type CreateLiveFocusActionInput = CreateLiveFocusInput & {
  readonly context: AppActionContext;
};

export type CreateLiveNodeDetailActionInput = CreateLiveNodeDetailInput & {
  readonly context: AppActionContext;
};

export type CreateLiveSignalActionResult = {
  readonly signal: LiveSignalRecord;
};

export type CreateLiveMapNodeActionResult = {
  readonly node: LiveMapNodeRecord;
};

export type CreateLiveMapEdgeActionResult = {
  readonly edge: LiveMapEdgeRecord;
};

export type CreateLiveFocusActionResult = {
  readonly focus: LiveFocusRecord;
};

export type CreateLiveNodeDetailActionResult = {
  readonly detail: LiveNodeDetailRecord;
};

export function createLiveSignalAction(
  input: CreateLiveSignalActionInput,
): CreateLiveSignalActionResult {
  return {
    signal: input.context.repositories.live.createSignal(input),
  };
}

export function createLiveMapNodeAction(
  input: CreateLiveMapNodeActionInput,
): CreateLiveMapNodeActionResult {
  return {
    node: input.context.repositories.live.createMapNode(input),
  };
}

export function createLiveMapEdgeAction(
  input: CreateLiveMapEdgeActionInput,
): CreateLiveMapEdgeActionResult {
  return {
    edge: input.context.repositories.live.createMapEdge(input),
  };
}

export function createLiveFocusAction(
  input: CreateLiveFocusActionInput,
): CreateLiveFocusActionResult {
  return {
    focus: input.context.repositories.live.createFocus(input),
  };
}

export function createLiveNodeDetailAction(
  input: CreateLiveNodeDetailActionInput,
): CreateLiveNodeDetailActionResult {
  return {
    detail: input.context.repositories.live.createNodeDetail(input),
  };
}

export function listLiveRecordsForProjectAction(input: {
  readonly context: AppActionContext;
  readonly projectId: SituId<"project">;
}): LiveProjectRecords {
  return input.context.repositories.live.listForProject({
    projectId: input.projectId,
  });
}
