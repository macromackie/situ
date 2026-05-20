import type { ActorRef, SituId, SyncMetadata, TargetRef } from "@situ/common";

export const commentsPackageName = "comments" as const;
export type CommentsPackageName = typeof commentsPackageName;

/**
 * Markdown note attached to a visible product record.
 */
export type CommentRecord = {
  readonly id: SituId<"comment">;
  readonly target: TargetRef;
  readonly bodyMarkdown: string;
  readonly author: ActorRef;
  readonly metadata: SyncMetadata;
};
