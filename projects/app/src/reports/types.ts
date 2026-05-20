import type { ArtifactRecord } from "@situ/artifacts";
import type { BaselineRecord } from "@situ/baselines";
import type { CommentRecord } from "@situ/comments";
import type { IsoTimestamp, SituId } from "@situ/common";
import type { EventRecord } from "@situ/events";
import type { ExperimentRecord } from "@situ/experiments";
import type { MeasurementRecord } from "@situ/measurements";
import type { ProjectRecord } from "@situ/projects";
import type { ReportRecord } from "@situ/reports";
import type { ReviewRecord } from "@situ/reviews";
import type { TaskRecord } from "@situ/tasks";

import type { AppActionContext } from "../actions/context.js";

/**
 * Visible records attached directly to one product target.
 */
export type ReportTargetAttachments = {
  readonly comments: readonly CommentRecord[];
  readonly events: readonly EventRecord[];
  readonly artifacts: readonly ArtifactRecord[];
  readonly reports: readonly ReportRecord[];
};

/**
 * Collected project state used by deterministic report rendering.
 */
export type ProjectReportSnapshot = {
  readonly project: ProjectRecord;
  readonly target: ReportTargetAttachments;
  readonly baselines: readonly ProjectReportBaselineSnapshot[];
  readonly tasks: readonly ProjectReportTaskSnapshot[];
};

/**
 * Collected baseline state and evidence.
 */
export type ProjectReportBaselineSnapshot = {
  readonly baseline: BaselineRecord;
  readonly target: ReportTargetAttachments;
  readonly measurements: readonly ProjectReportMeasurementSnapshot[];
};

/**
 * Collected task state and nested experiments.
 */
export type ProjectReportTaskSnapshot = {
  readonly task: TaskRecord;
  readonly target: ReportTargetAttachments;
  readonly experiments: readonly ProjectReportExperimentSnapshot[];
};

/**
 * Collected experiment state and evidence.
 */
export type ProjectReportExperimentSnapshot = {
  readonly experiment: ExperimentRecord;
  readonly target: ReportTargetAttachments;
  readonly measurements: readonly ProjectReportMeasurementSnapshot[];
  readonly reviews: readonly ProjectReportReviewSnapshot[];
};

/**
 * Collected measurement state and direct attachments.
 */
export type ProjectReportMeasurementSnapshot = {
  readonly measurement: MeasurementRecord;
  readonly target: ReportTargetAttachments;
};

/**
 * Collected review state and direct attachments.
 */
export type ProjectReportReviewSnapshot = {
  readonly review: ReviewRecord;
  readonly target: ReportTargetAttachments;
};

export type CollectProjectReportSnapshotInput = {
  readonly context: AppActionContext;
  readonly projectId: SituId<"project">;
};

export type RenderProjectReportMarkdownInput = {
  readonly snapshot: ProjectReportSnapshot;
  readonly generatedAt?: IsoTimestamp;
};

export type RenderProjectReportHtmlInput = {
  readonly snapshot: ProjectReportSnapshot;
  readonly generatedAt?: IsoTimestamp;
};

export type GenerateProjectReportMarkdownInput = CollectProjectReportSnapshotInput & {
  readonly generatedAt?: IsoTimestamp;
};

export type GenerateProjectReportHtmlInput = CollectProjectReportSnapshotInput & {
  readonly generatedAt?: IsoTimestamp;
};
