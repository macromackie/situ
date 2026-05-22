import type { ActorRef, IsoTimestamp, SituId, SyncMetadata, TargetRef } from "@situ/common";

export const livePackageName = "live" as const;
export type LivePackageName = typeof livePackageName;

export const liveTones = ["neutral", "good", "watch", "blocked", "done"] as const;
export const liveEdgeTones = ["neutral", "good", "watch", "blocked"] as const;
export const liveVisibilities = ["visible", "hidden"] as const;
export const liveMapNodeKinds = [
  "baseline",
  "branch",
  "verification",
  "finding",
  "blocker",
  "decision",
  "result",
] as const;
export const liveMapEdgeRelations = [
  "led_to",
  "depends_on",
  "blocked_by",
  "supersedes",
  "verifies",
] as const;
export const liveFocusModes = ["overview", "node", "comparison", "blocked"] as const;
export const liveMetricDirections = ["higher_is_better", "lower_is_better"] as const;

export type LiveTone = (typeof liveTones)[number];
export type LiveEdgeTone = (typeof liveEdgeTones)[number];
export type LiveVisibility = (typeof liveVisibilities)[number];
export type LiveMapNodeKind = (typeof liveMapNodeKinds)[number];
export type LiveMapEdgeRelation = (typeof liveMapEdgeRelations)[number];
export type LiveFocusMode = (typeof liveFocusModes)[number];
export type LiveMetricDirection = (typeof liveMetricDirections)[number];

export type LiveSignalRecord = {
  readonly id: SituId<"live_signal">;
  readonly projectId: SituId<"project">;
  readonly slot: string;
  readonly label: string;
  readonly value: string;
  readonly summary?: string;
  readonly tone: LiveTone;
  readonly refs: readonly TargetRef[];
  readonly visibility: LiveVisibility;
  readonly authoredBy: ActorRef;
  readonly metadata: SyncMetadata;
};

export type LiveMapNodeRecord = {
  readonly id: SituId<"live_node">;
  readonly projectId: SituId<"project">;
  readonly nodeKey: string;
  readonly kind: LiveMapNodeKind;
  readonly title: string;
  readonly summary: string;
  readonly tone: LiveTone;
  readonly occurredAt?: IsoTimestamp;
  readonly refs: readonly TargetRef[];
  readonly visibility: LiveVisibility;
  readonly authoredBy: ActorRef;
  readonly metadata: SyncMetadata;
};

export type LiveMapEdgeRecord = {
  readonly id: SituId<"live_edge">;
  readonly projectId: SituId<"project">;
  readonly edgeKey: string;
  readonly fromNodeKey: string;
  readonly toNodeKey: string;
  readonly relation: LiveMapEdgeRelation;
  readonly tone: LiveEdgeTone;
  readonly visibility: LiveVisibility;
  readonly authoredBy: ActorRef;
  readonly metadata: SyncMetadata;
};

export type LiveFocusRecord = {
  readonly id: SituId<"live_focus">;
  readonly projectId: SituId<"project">;
  readonly mode: LiveFocusMode;
  readonly primaryNodeKey?: string;
  readonly relatedNodeKeys: readonly string[];
  readonly summary?: string;
  readonly authoredBy: ActorRef;
  readonly metadata: SyncMetadata;
};

export type LiveNodeFact = {
  readonly label: string;
  readonly value: string;
  readonly tone?: LiveTone;
  readonly metricName?: string;
  readonly numericValue?: number;
  readonly unit?: string;
  readonly direction?: LiveMetricDirection;
};

export type LiveNodeDetailRecord = {
  readonly id: SituId<"live_detail">;
  readonly projectId: SituId<"project">;
  readonly nodeKey: string;
  readonly bodyMarkdown: string;
  readonly facts: readonly LiveNodeFact[];
  readonly refs: readonly TargetRef[];
  readonly authoredBy: ActorRef;
  readonly metadata: SyncMetadata;
};
