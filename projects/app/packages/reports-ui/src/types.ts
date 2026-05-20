export type ImprovementDirection = "lower" | "higher";

export type StatusKind = "good" | "bad" | "warn" | "neutral";

export type ActorLabel = {
  readonly displayName: string;
  readonly role?: string;
};

export type MetricPoint = {
  readonly experimentOrdinal: number;
  readonly value: number;
  readonly origin: "baseline" | "experiment";
  readonly experimentId?: string;
  readonly experimentTitle?: string;
  readonly experimentStatus?: string;
  readonly actorLabel?: string;
};

export type MetricSeries = {
  readonly metricName: string;
  readonly unit?: string;
  readonly direction: ImprovementDirection;
  readonly points: readonly MetricPoint[];
  readonly baselineValue?: number;
  readonly bestValue?: number;
};

export type LineageNode = {
  readonly id: string;
  readonly kind: "initial" | "candidate" | "synthesis";
  readonly label: string;
  readonly subLabel: string;
  readonly status?: string;
  readonly actor?: string;
  readonly delta?: string;
  readonly branchName?: string;
};

export type LineageEdge = {
  readonly fromId: string;
  readonly toId: string;
  readonly label?: string;
  readonly kind?: "parent" | "cherry-pick";
};

export type SwimlaneMarkKind = "creation" | "assignment" | "measurement" | "review" | "event";

export type SwimlaneMark = {
  readonly atMs: number;
  readonly kind: SwimlaneMarkKind;
  readonly detail: string;
};

export type SwimlaneRow = {
  readonly actor: string;
  readonly marks: readonly SwimlaneMark[];
};

export type OutcomeRow = {
  readonly experimentId: string;
  readonly experimentTitle: string;
  readonly taskTitle: string;
  readonly status: string;
  readonly actor: string;
  readonly branchName?: string;
  readonly bestValue?: number;
  readonly bestValueUnit?: string;
  readonly deltaVsBaseline?: number;
};

export type MeasurementSummary = {
  readonly metricName: string;
  readonly value: number;
  readonly unit?: string;
  readonly revisionNumber?: number;
  readonly actor: string;
  readonly note?: string;
};

export type ReviewSummary = {
  readonly decision: string;
  readonly reviewer: string;
  readonly body: string;
};

export type AttachmentSummary = {
  readonly kind: "comment" | "event" | "artifact" | "report";
  readonly title?: string;
  readonly actor?: string;
  readonly body: string;
  readonly extra?: string;
};

export type ContentsItem = {
  readonly id: string;
  readonly label: string;
};

export type DateLine = {
  readonly openedAt?: string;
  readonly openedAtLabel?: string;
  readonly openedBy?: string;
  readonly generatedAt?: string;
  readonly generatedAtLabel?: string;
};
