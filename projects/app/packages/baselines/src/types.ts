import type { ActorRef, SituId, SyncMetadata } from "@situ/common";

export const baselinesPackageName = "baselines" as const;
export type BaselinesPackageName = typeof baselinesPackageName;

export type BaselineStatus = "active" | "superseded" | "abandoned";

/**
 * Durable reference point for comparing autoresearch candidates.
 */
export type BaselineRecord = {
  readonly id: SituId<"baseline">;
  readonly projectId: SituId<"project">;
  readonly taskId?: SituId<"task">;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly status: BaselineStatus;
  readonly createdBy: ActorRef;
  readonly metadata: SyncMetadata;
};
