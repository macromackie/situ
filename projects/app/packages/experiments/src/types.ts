import type { ActorRef, SituId, SyncMetadata } from "@situ/common";

export const experimentsPackageName = "experiments" as const;
export type ExperimentsPackageName = typeof experimentsPackageName;

export type ExperimentStatus =
  | "planned"
  | "running"
  | "ready_for_review"
  | "accepted"
  | "rejected"
  | "abandoned";

export type ExperimentRecord = {
  readonly id: SituId<"experiment">;
  readonly projectId: SituId<"project">;
  readonly taskId: SituId<"task">;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly status: ExperimentStatus;
  readonly revisionNumber: number;
  readonly baseRef?: string;
  readonly branchName?: string;
  readonly worktreePath?: string;
  readonly assignedTo?: ActorRef;
  readonly createdBy: ActorRef;
  readonly metadata: SyncMetadata;
};
