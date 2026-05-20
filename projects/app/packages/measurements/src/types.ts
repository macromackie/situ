import type { ActorRef, SituId, SyncMetadata } from "@situ/common";

export const measurementsPackageName = "measurements" as const;
export type MeasurementsPackageName = typeof measurementsPackageName;

/**
 * Append-only numeric evidence for a baseline or experiment revision.
 */
export type MeasurementRecord = {
  readonly id: SituId<"measurement">;
  readonly baselineId?: SituId<"baseline">;
  readonly experimentId?: SituId<"experiment">;
  readonly revisionNumber?: number;
  readonly metricName: string;
  readonly numericValue: number;
  readonly unit?: string;
  readonly summaryMarkdown: string;
  readonly detailsMarkdown?: string;
  readonly measuredBy: ActorRef;
  readonly metadata: SyncMetadata;
};
