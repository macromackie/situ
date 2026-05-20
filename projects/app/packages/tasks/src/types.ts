import type { ActorRef, SituId, SyncMetadata } from "@situ/common";

export const tasksPackageName = "tasks" as const;
export type TasksPackageName = typeof tasksPackageName;

export type TaskStatus = "triage" | "backlog" | "in_progress" | "in_review" | "done" | "canceled";

/**
 * Visible work item used for agent handoffs.
 */
export type TaskRecord = {
  readonly id: SituId<"task">;
  readonly projectId: SituId<"project">;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly status: TaskStatus;
  readonly assignedTo?: ActorRef;
  readonly createdBy: ActorRef;
  readonly metadata: SyncMetadata;
};
