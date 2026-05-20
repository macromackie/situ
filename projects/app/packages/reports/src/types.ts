import type { ActorRef, SituId, SyncMetadata, TargetRef } from "@situ/common";

export const reportsPackageName = "reports" as const;
export type ReportsPackageName = typeof reportsPackageName;

/**
 * Durable written output attached to a product record.
 */
export type ReportRecord = {
  readonly id: SituId<"report">;
  readonly projectId: SituId<"project">;
  readonly target: TargetRef;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly generatedBy: ActorRef;
  readonly metadata: SyncMetadata;
};
