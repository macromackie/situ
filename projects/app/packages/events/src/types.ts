import type { ActorRef, SituId, SyncMetadata, TargetRef } from "@situ/common";

export const eventsPackageName = "events" as const;
export type EventsPackageName = typeof eventsPackageName;

/**
 * Append-only timeline entry for a visible product record.
 */
export type EventRecord = {
  readonly id: SituId<"event">;
  readonly target: TargetRef;
  readonly actor: ActorRef;
  readonly summaryMarkdown: string;
  readonly bodyMarkdown?: string;
  readonly metadata: SyncMetadata;
};
