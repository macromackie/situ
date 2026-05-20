import type { ActorRef, SituId, SyncMetadata, TargetRef } from "@situ/common";

export const artifactsPackageName = "artifacts" as const;
export type ArtifactsPackageName = typeof artifactsPackageName;

/**
 * Durable reference to evidence attached to a visible product record.
 */
export type ArtifactRecord = {
  readonly id: SituId<"artifact">;
  readonly target: TargetRef;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly uri: string;
  readonly mediaType?: string;
  readonly byteSize?: number;
  readonly sha256?: string;
  readonly createdBy: ActorRef;
  readonly metadata: SyncMetadata;
};
