import type { ActorRef, IsoTimestamp, SituId, TargetRef } from "@situ/common";
import type {
  CreateLiveFocusInput,
  CreateLiveMapEdgeInput,
  CreateLiveMapNodeInput,
  CreateLiveNodeDetailInput,
  CreateLiveSignalInput,
  LiveEdgeTone,
  LiveFocusMode,
  LiveFocusRecord,
  LiveMapEdgeRelation,
  LiveMapEdgeRecord,
  LiveMapNodeKind,
  LiveMapNodeRecord,
  LiveNodeDetailRecord,
  LiveNodeFact,
  LiveProjectRecords,
  LiveSignalRecord,
  LiveTone,
  LiveVisibility,
} from "@situ/live";

import { runAppTransaction, type AppActionContext } from "./context.js";

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

export type PublishLiveAttemptActionInput = {
  readonly context: AppActionContext;
  readonly projectId: SituId<"project">;
  readonly authoredBy: ActorRef;
  readonly now?: IsoTimestamp;
  readonly nodeKey: string;
  readonly kind: LiveMapNodeKind;
  readonly title: string;
  readonly summary: string;
  readonly tone: LiveTone;
  readonly occurredAt?: IsoTimestamp;
  readonly visibility?: LiveVisibility;
  readonly bodyMarkdown: string;
  readonly facts: readonly LiveNodeFact[];
  readonly refs: readonly TargetRef[];
  readonly edge?: {
    readonly edgeKey?: string;
    readonly fromNodeKey: string;
    readonly relation: LiveMapEdgeRelation;
    readonly tone?: LiveEdgeTone;
    readonly visibility?: LiveVisibility;
  };
  readonly focus?: {
    readonly mode: LiveFocusMode;
    readonly summary?: string;
    readonly relatedNodeKeys?: readonly string[];
  };
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

export type PublishLiveAttemptActionResult = {
  readonly node: LiveMapNodeRecord;
  readonly detail: LiveNodeDetailRecord;
  readonly edge?: LiveMapEdgeRecord;
  readonly focus?: LiveFocusRecord;
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

export function publishLiveAttemptAction(
  input: PublishLiveAttemptActionInput,
): PublishLiveAttemptActionResult {
  return runAppTransaction({
    context: input.context,
    run: (context) => {
      const node = context.repositories.live.createMapNode({
        projectId: input.projectId,
        nodeKey: input.nodeKey,
        kind: input.kind,
        title: input.title,
        summary: input.summary,
        tone: input.tone,
        occurredAt: input.occurredAt,
        refs: input.refs,
        visibility: input.visibility,
        authoredBy: input.authoredBy,
        now: input.now,
      });
      const detail = context.repositories.live.createNodeDetail({
        projectId: input.projectId,
        nodeKey: input.nodeKey,
        bodyMarkdown: input.bodyMarkdown,
        facts: input.facts,
        refs: input.refs,
        authoredBy: input.authoredBy,
        now: input.now,
      });
      const edge =
        input.edge === undefined
          ? undefined
          : context.repositories.live.createMapEdge({
              projectId: input.projectId,
              edgeKey: input.edge.edgeKey ?? `${input.edge.fromNodeKey}_to_${input.nodeKey}`,
              fromNodeKey: input.edge.fromNodeKey,
              toNodeKey: input.nodeKey,
              relation: input.edge.relation,
              tone: input.edge.tone ?? "neutral",
              visibility: input.edge.visibility,
              authoredBy: input.authoredBy,
              now: input.now,
            });
      const focus =
        input.focus === undefined
          ? undefined
          : context.repositories.live.createFocus({
              projectId: input.projectId,
              mode: input.focus.mode,
              primaryNodeKey: input.nodeKey,
              relatedNodeKeys: input.focus.relatedNodeKeys ?? [],
              summary: input.focus.summary,
              authoredBy: input.authoredBy,
              now: input.now,
            });

      return {
        node,
        detail,
        ...(edge === undefined ? {} : { edge }),
        ...(focus === undefined ? {} : { focus }),
      };
    },
  });
}

export function listLiveRecordsForProjectAction(input: {
  readonly context: AppActionContext;
  readonly projectId: SituId<"project">;
}): LiveProjectRecords {
  return input.context.repositories.live.listForProject({
    projectId: input.projectId,
  });
}
