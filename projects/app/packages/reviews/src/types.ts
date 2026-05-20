import type { ActorRef, SituId, SyncMetadata } from "@situ/common";

export const reviewsPackageName = "reviews" as const;
export type ReviewsPackageName = typeof reviewsPackageName;

export type ReviewDecision = "approved" | "changes_requested" | "rejected" | "commented";

export type ReviewRecord = {
  readonly id: SituId<"review">;
  readonly experimentId: SituId<"experiment">;
  readonly revisionNumber: number;
  readonly decision: ReviewDecision;
  readonly bodyMarkdown: string;
  readonly reviewer: ActorRef;
  readonly metadata: SyncMetadata;
};
