import type { ArtifactRecord } from "@situ/artifacts";
import type { BaselineRecord } from "@situ/baselines";
import type { BriefingRecord } from "@situ/briefings";
import type { CommentRecord } from "@situ/comments";
import type { ActorRef, TargetKind, TargetRef } from "@situ/common";
import type { EventRecord } from "@situ/events";
import type { ExperimentRecord } from "@situ/experiments";
import type {
  LiveFocusRecord,
  LiveMapEdgeRecord,
  LiveMapNodeRecord,
  LiveNodeDetailRecord,
  LiveSignalRecord,
  LiveTone,
} from "@situ/live";
import type { MeasurementRecord } from "@situ/measurements";
import type { NotificationRecord } from "@situ/notifications";
import type { ProjectRecord } from "@situ/projects";
import type { ReportRecord } from "@situ/reports";
import type { ReviewRecord } from "@situ/reviews";
import type { TaskRecord } from "@situ/tasks";

import {
  deriveSnapshotModel,
  type SnapshotDerivedModel,
} from "../reports/mdx/snapshot-to-props.js";
import type { ProjectReportSnapshot, ReportTargetAttachments } from "../reports/types.js";

export type ClientRecords = {
  readonly projects: readonly ProjectRecord[];
  readonly tasks: readonly TaskRecord[];
  readonly baselines: readonly BaselineRecord[];
  readonly experiments: readonly ExperimentRecord[];
  readonly measurements: readonly MeasurementRecord[];
  readonly reviews: readonly ReviewRecord[];
  readonly artifacts: readonly ArtifactRecord[];
  readonly reports: readonly ReportRecord[];
  readonly briefings: readonly BriefingRecord[];
  readonly liveSignals: readonly LiveSignalRecord[];
  readonly liveMapNodes: readonly LiveMapNodeRecord[];
  readonly liveMapEdges: readonly LiveMapEdgeRecord[];
  readonly liveFocuses: readonly LiveFocusRecord[];
  readonly liveNodeDetails: readonly LiveNodeDetailRecord[];
  readonly comments: readonly CommentRecord[];
  readonly events: readonly EventRecord[];
  readonly notifications: readonly NotificationRecord[];
};

export type ProjectIndexModel = {
  readonly activeProjects: readonly ProjectRecord[];
  readonly archivedProjects: readonly ProjectRecord[];
  readonly allProjects: readonly ProjectRecord[];
};

export type ProjectOverviewModel =
  | {
      readonly kind: "empty";
      readonly activeProjects: readonly ProjectRecord[];
      readonly allProjects: readonly ProjectRecord[];
      readonly requestedProjectId?: string;
      readonly missingRequestedProject: boolean;
    }
  | {
      readonly kind: "project";
      readonly activeProjects: readonly ProjectRecord[];
      readonly allProjects: readonly ProjectRecord[];
      readonly requestedProjectId?: string;
      readonly missingRequestedProject: boolean;
      readonly project: ProjectRecord;
      readonly snapshot: ProjectReportSnapshot;
      readonly derived: SnapshotDerivedModel;
      readonly records: ProjectOverviewRecords;
      readonly status: ProjectStatusSummary;
      readonly verification: ProjectVerification;
      readonly latestReport?: ReportRecord;
      readonly latestBriefing?: BriefingRecord;
      readonly activity: readonly ProjectActivityItem[];
      readonly presentation: ProjectPresentationModel;
    };

export type ProjectOverviewRecords = {
  readonly tasks: readonly TaskRecord[];
  readonly baselines: readonly BaselineRecord[];
  readonly experiments: readonly ExperimentRecord[];
  readonly measurements: readonly MeasurementRecord[];
  readonly reviews: readonly ReviewRecord[];
  readonly artifacts: readonly ArtifactRecord[];
  readonly reports: readonly ReportRecord[];
  readonly briefings: readonly BriefingRecord[];
  readonly liveSignals: readonly LiveSignalRecord[];
  readonly liveMapNodes: readonly LiveMapNodeRecord[];
  readonly liveMapEdges: readonly LiveMapEdgeRecord[];
  readonly liveFocuses: readonly LiveFocusRecord[];
  readonly liveNodeDetails: readonly LiveNodeDetailRecord[];
  readonly comments: readonly CommentRecord[];
  readonly events: readonly EventRecord[];
  readonly notifications: readonly NotificationRecord[];
};

export type ProjectPresentationModel = {
  readonly signals: readonly CurrentSignal[];
  readonly map: {
    readonly nodes: readonly CurrentMapNode[];
    readonly edges: readonly CurrentMapEdge[];
    readonly focus?: CurrentFocus;
    readonly detailsByNodeKey: ReadonlyMap<string, LiveNodeDetailRecord>;
  };
};

export type CurrentSignal = {
  readonly id: string;
  readonly slot: string;
  readonly label: string;
  readonly value: string;
  readonly summary?: string;
  readonly tone: LiveTone;
  readonly refs: readonly TargetRef[];
  readonly source: "record" | "derived";
};

export type CurrentMapNode = LiveMapNodeRecord;
export type CurrentMapEdge = LiveMapEdgeRecord;
export type CurrentFocus = LiveFocusRecord;

export type ProjectStatusSummary = {
  readonly label: string;
  readonly tone: "good" | "warning" | "bad" | "neutral";
  readonly isIdle: boolean;
  readonly work: {
    readonly pending: number;
    readonly running: number;
    readonly review: number;
    readonly attention: number;
    readonly completed: number;
  };
  readonly tasks: Record<TaskRecord["status"], number>;
  readonly experiments: Record<ExperimentRecord["status"], number>;
  readonly notifications: {
    readonly unread: number;
    readonly read: number;
    readonly dismissed: number;
  };
};

export type ProjectVerification = {
  readonly ok: boolean;
  readonly checks: readonly ProjectVerificationCheck[];
};

export type ProjectVerificationCheck = {
  readonly name:
    | "has-project"
    | "no-active-tasks"
    | "no-active-experiments"
    | "accepted-experiments-reviewed"
    | "accepted-experiments-have-evidence"
    | "final-report-present";
  readonly label: string;
  readonly ok: boolean;
  readonly summary: string;
  readonly blockingRecords: readonly ProjectBlockingRecord[];
};

export type ProjectBlockingRecord = {
  readonly targetKind: TargetKind;
  readonly targetId: string;
  readonly reason: string;
};

export type ProjectActivityItem = {
  readonly id: string;
  readonly kind:
    | "report"
    | "comment"
    | "event"
    | "measurement"
    | "review"
    | "artifact"
    | "briefing"
    | "notification";
  readonly title: string;
  readonly body?: string;
  readonly actor?: string;
  readonly targetLabel: string;
  readonly createdAt: string;
  readonly tone: "good" | "warning" | "bad" | "neutral";
};

export function buildProjectIndexModel(input: {
  readonly records: ClientRecords;
}): ProjectIndexModel {
  const allProjects = sortRecords(input.records.projects);
  return {
    activeProjects: allProjects.filter((project) => project.status === "active"),
    archivedProjects: allProjects.filter((project) => project.status !== "active"),
    allProjects,
  };
}

export function buildProjectOverviewModel(input: {
  readonly records: ClientRecords;
  readonly requestedProjectId?: string;
}): ProjectOverviewModel {
  const allProjects = sortRecords(input.records.projects);
  const activeProjects = allProjects.filter((project) => project.status === "active");
  const project = selectProject({
    projects: allProjects,
    requestedProjectId: input.requestedProjectId,
  });
  const missingRequestedProject =
    input.requestedProjectId !== undefined &&
    !allProjects.some((candidate) => candidate.id === input.requestedProjectId);

  if (project === undefined) {
    return {
      kind: "empty",
      activeProjects,
      allProjects,
      requestedProjectId: input.requestedProjectId,
      missingRequestedProject,
    };
  }

  const projectRecords = filterProjectRecords({
    records: input.records,
    project,
  });
  const snapshot = buildProjectReportSnapshot({
    records: input.records,
    project,
    projectRecords,
  });
  const derived = deriveSnapshotModel(snapshot);
  const status = deriveProjectStatusSummary({ records: projectRecords });
  const verification = deriveProjectVerification({
    project,
    records: projectRecords,
  });
  const latestReport = selectLatestProjectReport({
    project,
    reports: projectRecords.reports,
  });
  const latestBriefing = selectLatestProjectBriefing({
    project,
    briefings: projectRecords.briefings,
  });
  const activity = collectActivityItems({
    project,
    records: projectRecords,
  });
  const presentation = buildProjectPresentation({
    derived,
    latestBriefing,
    records: projectRecords,
    status,
    verification,
  });

  return {
    kind: "project",
    activeProjects,
    allProjects,
    requestedProjectId: input.requestedProjectId,
    missingRequestedProject,
    project,
    snapshot,
    derived,
    records: projectRecords,
    status,
    verification,
    latestReport,
    latestBriefing,
    activity,
    presentation,
  };
}

function buildProjectPresentation(input: {
  readonly derived: SnapshotDerivedModel;
  readonly latestBriefing?: BriefingRecord;
  readonly records: ProjectOverviewRecords;
  readonly status: ProjectStatusSummary;
  readonly verification: ProjectVerification;
}): ProjectPresentationModel {
  const recordSignals = currentRecordsByKey(input.records.liveSignals, (signal) => signal.slot)
    .filter((signal) => signal.visibility === "visible")
    .map(
      (signal): CurrentSignal => ({
        id: signal.id,
        slot: signal.slot,
        label: signal.label,
        value: signal.value,
        summary: signal.summary,
        tone: signal.tone,
        refs: signal.refs,
        source: "record",
      }),
    );

  const nodes = currentRecordsByKey(input.records.liveMapNodes, (node) => node.nodeKey)
    .filter((node) => node.visibility === "visible")
    .sort(compareMapNodesAsc);
  const nodeKeySet = new Set(nodes.map((node) => node.nodeKey));
  const edges = currentRecordsByKey(input.records.liveMapEdges, (edge) => edge.edgeKey)
    .filter(
      (edge) =>
        edge.visibility === "visible" &&
        nodeKeySet.has(edge.fromNodeKey) &&
        nodeKeySet.has(edge.toNodeKey),
    )
    .sort(compareRecordsAsc);
  const focus = latestRecord(input.records.liveFocuses);
  const detailsByNodeKey = new Map<string, LiveNodeDetailRecord>();

  for (const detail of currentRecordsByKey(
    input.records.liveNodeDetails,
    (candidate) => candidate.nodeKey,
  )) {
    if (nodeKeySet.has(detail.nodeKey)) {
      detailsByNodeKey.set(detail.nodeKey, detail);
    }
  }

  return {
    signals:
      recordSignals.length === 0
        ? fallbackPresentationSignals({
            derived: input.derived,
            latestBriefing: input.latestBriefing,
            status: input.status,
            verification: input.verification,
          })
        : recordSignals,
    map: {
      nodes,
      edges,
      focus,
      detailsByNodeKey,
    },
  };
}

function selectProject(input: {
  readonly projects: readonly ProjectRecord[];
  readonly requestedProjectId?: string;
}): ProjectRecord | undefined {
  if (input.requestedProjectId === undefined) {
    return undefined;
  }

  return input.projects.find((project) => project.id === input.requestedProjectId);
}

function filterProjectRecords(input: {
  readonly records: ClientRecords;
  readonly project: ProjectRecord;
}): ProjectOverviewRecords {
  const tasks = sortRecords(
    input.records.tasks.filter((task) => task.projectId === input.project.id),
  );
  const baselines = sortRecords(
    input.records.baselines.filter((baseline) => baseline.projectId === input.project.id),
  );
  const experiments = sortRecords(
    input.records.experiments.filter((experiment) => experiment.projectId === input.project.id),
  );
  const baselineIdSet = new Set(baselines.map((baseline) => baseline.id));
  const experimentIdSet = new Set(experiments.map((experiment) => experiment.id));
  const measurements = sortRecords(
    input.records.measurements.filter(
      (measurement) =>
        (measurement.baselineId !== undefined && baselineIdSet.has(measurement.baselineId)) ||
        (measurement.experimentId !== undefined && experimentIdSet.has(measurement.experimentId)),
    ),
  );
  const measurementIdSet = new Set(measurements.map((measurement) => measurement.id));
  const reviews = sortRecords(
    input.records.reviews.filter((review) => experimentIdSet.has(review.experimentId)),
  );
  const reviewIdSet = new Set(reviews.map((review) => review.id));
  const reports = sortRecords(
    input.records.reports.filter((report) => report.projectId === input.project.id),
  );
  const reportIdSet = new Set(reports.map((report) => report.id));
  const briefings = sortRecords(
    input.records.briefings.filter((briefing) => briefing.projectId === input.project.id),
  );
  const briefingIdSet = new Set(briefings.map((briefing) => briefing.id));
  const liveSignals = sortRecords(
    input.records.liveSignals.filter((signal) => signal.projectId === input.project.id),
  );
  const liveMapNodes = sortRecords(
    input.records.liveMapNodes.filter((node) => node.projectId === input.project.id),
  );
  const liveMapEdges = sortRecords(
    input.records.liveMapEdges.filter((edge) => edge.projectId === input.project.id),
  );
  const liveFocuses = sortRecords(
    input.records.liveFocuses.filter((focus) => focus.projectId === input.project.id),
  );
  const liveNodeDetails = sortRecords(
    input.records.liveNodeDetails.filter((detail) => detail.projectId === input.project.id),
  );
  const liveSignalIdSet = new Set(liveSignals.map((signal) => signal.id));
  const liveMapNodeIdSet = new Set(liveMapNodes.map((node) => node.id));
  const liveMapEdgeIdSet = new Set(liveMapEdges.map((edge) => edge.id));
  const liveFocusIdSet = new Set(liveFocuses.map((focus) => focus.id));
  const liveNodeDetailIdSet = new Set(liveNodeDetails.map((detail) => detail.id));
  const taskIdSet = new Set(tasks.map((task) => task.id));
  const relevantTargetKeys = buildRelevantTargetKeys({
    projectId: input.project.id,
    taskIdSet,
    baselineIdSet,
    experimentIdSet,
    measurementIdSet,
    reviewIdSet,
    reportIdSet,
    briefingIdSet,
    liveSignalIdSet,
    liveMapNodeIdSet,
    liveMapEdgeIdSet,
    liveFocusIdSet,
    liveNodeDetailIdSet,
  });
  const artifacts = sortRecords(
    input.records.artifacts.filter((artifact) =>
      relevantTargetKeys.has(targetKey(artifact.target)),
    ),
  );
  const artifactIdSet = new Set(artifacts.map((artifact) => artifact.id));
  const withArtifactTargets = new Set([
    ...relevantTargetKeys,
    ...[...artifactIdSet].map((artifactId) => targetKeyParts("artifact", artifactId)),
  ]);
  const comments = sortRecords(
    input.records.comments.filter((comment) => withArtifactTargets.has(targetKey(comment.target))),
  );
  const commentIdSet = new Set(comments.map((comment) => comment.id));
  const events = sortRecords(
    input.records.events.filter((event) => withArtifactTargets.has(targetKey(event.target))),
  );
  const eventIdSet = new Set(events.map((event) => event.id));
  const notificationTargets = new Set([
    ...withArtifactTargets,
    ...[...commentIdSet].map((commentId) => targetKeyParts("comment", commentId)),
    ...[...eventIdSet].map((eventId) => targetKeyParts("event", eventId)),
  ]);
  const notifications = sortRecords(
    input.records.notifications.filter((notification) =>
      notificationTargets.has(targetKey(notification.target)),
    ),
  );

  return {
    tasks,
    baselines,
    experiments,
    measurements,
    reviews,
    artifacts,
    reports,
    briefings,
    liveSignals,
    liveMapNodes,
    liveMapEdges,
    liveFocuses,
    liveNodeDetails,
    comments,
    events,
    notifications,
  };
}

function buildProjectReportSnapshot(input: {
  readonly records: ClientRecords;
  readonly project: ProjectRecord;
  readonly projectRecords: ProjectOverviewRecords;
}): ProjectReportSnapshot {
  const experimentsByTaskId = new Map<string, ExperimentRecord[]>();
  for (const experiment of input.projectRecords.experiments) {
    const list = experimentsByTaskId.get(experiment.taskId) ?? [];
    list.push(experiment);
    experimentsByTaskId.set(experiment.taskId, list);
  }

  return {
    project: input.project,
    target: collectTargetAttachments({
      records: input.records,
      targetKind: "project",
      targetId: input.project.id,
    }),
    baselines: input.projectRecords.baselines.map((baseline) => ({
      baseline,
      target: collectTargetAttachments({
        records: input.records,
        targetKind: "baseline",
        targetId: baseline.id,
      }),
      measurements: input.projectRecords.measurements
        .filter((measurement) => measurement.baselineId === baseline.id)
        .map((measurement) => ({
          measurement,
          target: collectTargetAttachments({
            records: input.records,
            targetKind: "measurement",
            targetId: measurement.id,
          }),
        })),
    })),
    tasks: input.projectRecords.tasks.map((task) => ({
      task,
      target: collectTargetAttachments({
        records: input.records,
        targetKind: "task",
        targetId: task.id,
      }),
      experiments: (experimentsByTaskId.get(task.id) ?? []).map((experiment) => ({
        experiment,
        target: collectTargetAttachments({
          records: input.records,
          targetKind: "experiment",
          targetId: experiment.id,
        }),
        measurements: input.projectRecords.measurements
          .filter((measurement) => measurement.experimentId === experiment.id)
          .map((measurement) => ({
            measurement,
            target: collectTargetAttachments({
              records: input.records,
              targetKind: "measurement",
              targetId: measurement.id,
            }),
          })),
        reviews: input.projectRecords.reviews
          .filter((review) => review.experimentId === experiment.id)
          .map((review) => ({
            review,
            target: collectTargetAttachments({
              records: input.records,
              targetKind: "review",
              targetId: review.id,
            }),
          })),
      })),
    })),
  };
}

function collectTargetAttachments(input: {
  readonly records: ClientRecords;
  readonly targetKind: TargetKind;
  readonly targetId: string;
}): ReportTargetAttachments {
  const key = targetKeyParts(input.targetKind, input.targetId);

  return {
    comments: input.records.comments.filter((comment) => targetKey(comment.target) === key),
    events: input.records.events.filter((event) => targetKey(event.target) === key),
    artifacts: input.records.artifacts.filter((artifact) => targetKey(artifact.target) === key),
    reports: input.records.reports.filter((report) => targetKey(report.target) === key),
  };
}

function deriveProjectStatusSummary(input: {
  readonly records: ProjectOverviewRecords;
}): ProjectStatusSummary {
  const tasks = countByStatus(input.records.tasks, [
    "triage",
    "backlog",
    "in_progress",
    "in_review",
    "done",
    "canceled",
  ] as const);
  const experiments = countByStatus(input.records.experiments, [
    "planned",
    "running",
    "ready_for_review",
    "accepted",
    "rejected",
    "abandoned",
  ] as const);
  const notifications = {
    unread: input.records.notifications.filter(
      (notification) => notification.readAt === undefined && notification.dismissedAt === undefined,
    ).length,
    read: input.records.notifications.filter(
      (notification) => notification.readAt !== undefined && notification.dismissedAt === undefined,
    ).length,
    dismissed: input.records.notifications.filter(
      (notification) => notification.dismissedAt !== undefined,
    ).length,
  };
  const changesRequested = input.records.reviews.filter(
    (review) => review.decision === "changes_requested",
  ).length;
  const work = {
    pending: tasks.triage + tasks.backlog + experiments.planned,
    running: tasks.in_progress + experiments.running,
    review: tasks.in_review + experiments.ready_for_review + changesRequested,
    attention: notifications.unread,
    completed:
      tasks.done +
      tasks.canceled +
      experiments.accepted +
      experiments.rejected +
      experiments.abandoned,
  };
  const isIdle =
    work.pending === 0 && work.running === 0 && work.review === 0 && work.attention === 0;

  return {
    label: statusLabel({ work, isIdle }),
    tone: statusTone({ work, isIdle }),
    isIdle,
    work,
    tasks,
    experiments,
    notifications,
  };
}

function statusLabel(input: {
  readonly work: ProjectStatusSummary["work"];
  readonly isIdle: boolean;
}): string {
  if (input.work.attention > 0) {
    return "Needs attention";
  }
  if (input.work.review > 0) {
    return "Review needed";
  }
  if (input.work.running > 0) {
    return "Running";
  }
  if (input.work.pending > 0) {
    return "Planned";
  }
  if (input.isIdle) {
    return "Idle";
  }
  return "Unknown";
}

function statusTone(input: {
  readonly work: ProjectStatusSummary["work"];
  readonly isIdle: boolean;
}): ProjectStatusSummary["tone"] {
  if (input.work.attention > 0) {
    return "bad";
  }
  if (input.work.review > 0 || input.work.pending > 0) {
    return "warning";
  }
  if (input.work.running > 0 || input.isIdle) {
    return "good";
  }
  return "neutral";
}

function deriveProjectVerification(input: {
  readonly project: ProjectRecord;
  readonly records: ProjectOverviewRecords;
}): ProjectVerification {
  const acceptedExperiments = input.records.experiments.filter(
    (experiment) => experiment.status === "accepted",
  );
  const approvedExperimentIds = new Set(
    input.records.reviews
      .filter((review) => review.decision === "approved")
      .map((review) => review.experimentId),
  );
  const measuredExperimentIds = new Set(
    input.records.measurements
      .map((measurement) => measurement.experimentId)
      .filter(
        (experimentId): experimentId is NonNullable<typeof experimentId> =>
          experimentId !== undefined,
      ),
  );
  const artifactExperimentIds = new Set(
    input.records.artifacts
      .filter((artifact) => artifact.target.targetKind === "experiment")
      .map((artifact) => artifact.target.targetId),
  );

  const checks: ProjectVerificationCheck[] = [
    {
      name: "has-project",
      label: "Project exists",
      ok: true,
      summary: "Target project is present.",
      blockingRecords: [],
    },
    {
      name: "no-active-tasks",
      label: "No active tasks",
      ...blockingCheck({
        okSummary: "No active tasks remain.",
        failSummary: "Active tasks remain.",
        blockingRecords: input.records.tasks
          .filter((task) => ["triage", "backlog", "in_progress", "in_review"].includes(task.status))
          .map((task) => ({
            targetKind: "task" as const,
            targetId: task.id,
            reason: `Task is ${task.status}.`,
          })),
      }),
    },
    {
      name: "no-active-experiments",
      label: "No active experiments",
      ...blockingCheck({
        okSummary: "No active experiments remain.",
        failSummary: "Active experiments remain.",
        blockingRecords: input.records.experiments
          .filter((experiment) =>
            ["planned", "running", "ready_for_review"].includes(experiment.status),
          )
          .map((experiment) => ({
            targetKind: "experiment" as const,
            targetId: experiment.id,
            reason: `Experiment is ${experiment.status}.`,
          })),
      }),
    },
    {
      name: "accepted-experiments-reviewed",
      label: "Accepted experiments reviewed",
      ...blockingCheck({
        okSummary: "Accepted experiments have approved reviews.",
        failSummary: "Accepted experiments are missing approved reviews.",
        blockingRecords: acceptedExperiments
          .filter((experiment) => !approvedExperimentIds.has(experiment.id))
          .map((experiment) => ({
            targetKind: "experiment" as const,
            targetId: experiment.id,
            reason: "Accepted experiment has no approved review.",
          })),
      }),
    },
    {
      name: "accepted-experiments-have-evidence",
      label: "Accepted experiments have evidence",
      ...blockingCheck({
        okSummary: "Accepted experiments have measurement or artifact evidence.",
        failSummary: "Accepted experiments are missing evidence.",
        blockingRecords: acceptedExperiments
          .filter(
            (experiment) =>
              !measuredExperimentIds.has(experiment.id) &&
              !artifactExperimentIds.has(experiment.id),
          )
          .map((experiment) => ({
            targetKind: "experiment" as const,
            targetId: experiment.id,
            reason: "Accepted experiment has no measurement or artifact evidence.",
          })),
      }),
    },
    {
      name: "final-report-present",
      label: "Project report present",
      ...blockingCheck({
        okSummary: "At least one project-targeted report is present.",
        failSummary: "No project-targeted report is present.",
        blockingRecords: selectLatestProjectReport({
          project: input.project,
          reports: input.records.reports,
        })
          ? []
          : [
              {
                targetKind: "project" as const,
                targetId: input.project.id,
                reason: "Project has no project-targeted report.",
              },
            ],
      }),
    },
  ];

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}

function blockingCheck(input: {
  readonly okSummary: string;
  readonly failSummary: string;
  readonly blockingRecords: readonly ProjectBlockingRecord[];
}): Pick<ProjectVerificationCheck, "ok" | "summary" | "blockingRecords"> {
  const ok = input.blockingRecords.length === 0;
  return {
    ok,
    summary: ok ? input.okSummary : `${input.failSummary} (${input.blockingRecords.length})`,
    blockingRecords: input.blockingRecords,
  };
}

function selectLatestProjectReport(input: {
  readonly project: ProjectRecord;
  readonly reports: readonly ReportRecord[];
}): ReportRecord | undefined {
  const projectTargeted = input.reports.filter(
    (report) =>
      report.projectId === input.project.id &&
      report.target.targetKind === "project" &&
      report.target.targetId === input.project.id,
  );
  return latestRecord(projectTargeted) ?? latestRecord(input.reports);
}

function selectLatestProjectBriefing(input: {
  readonly project: ProjectRecord;
  readonly briefings: readonly BriefingRecord[];
}): BriefingRecord | undefined {
  return latestRecord(
    input.briefings.filter((briefing) => briefing.projectId === input.project.id),
  );
}

function collectActivityItems(input: {
  readonly project: ProjectRecord;
  readonly records: ProjectOverviewRecords;
}): readonly ProjectActivityItem[] {
  const items: ProjectActivityItem[] = [];

  for (const report of input.records.reports) {
    items.push({
      id: report.id,
      kind: "report",
      title: report.title,
      body: report.bodyMarkdown,
      actor: actorLabel(report.generatedBy),
      targetLabel: targetLabel(report.target),
      createdAt: report.metadata.createdAt,
      tone:
        report.target.targetKind === "project" && report.target.targetId === input.project.id
          ? "good"
          : "neutral",
    });
  }
  for (const briefing of input.records.briefings) {
    items.push({
      id: briefing.id,
      kind: "briefing",
      title: briefing.title,
      body: briefing.headlineMarkdown,
      actor: actorLabel(briefing.authoredBy),
      targetLabel: `project/${briefing.projectId}`,
      createdAt: briefing.metadata.createdAt,
      tone: briefingTone(briefing.assessment),
    });
  }
  for (const comment of input.records.comments) {
    items.push({
      id: comment.id,
      kind: "comment",
      title: "Comment",
      body: comment.bodyMarkdown,
      actor: actorLabel(comment.author),
      targetLabel: targetLabel(comment.target),
      createdAt: comment.metadata.createdAt,
      tone: "neutral",
    });
  }
  for (const event of input.records.events) {
    items.push({
      id: event.id,
      kind: "event",
      title: event.summaryMarkdown,
      body: event.bodyMarkdown,
      actor: actorLabel(event.actor),
      targetLabel: targetLabel(event.target),
      createdAt: event.metadata.createdAt,
      tone: "neutral",
    });
  }
  for (const measurement of input.records.measurements) {
    items.push({
      id: measurement.id,
      kind: "measurement",
      title: `${measurement.metricName} ${formatMeasurementValue(measurement.numericValue, measurement.unit)}`,
      body: measurement.summaryMarkdown,
      actor: actorLabel(measurement.measuredBy),
      targetLabel:
        measurement.experimentId !== undefined
          ? `experiment/${measurement.experimentId}`
          : `baseline/${measurement.baselineId ?? "unknown"}`,
      createdAt: measurement.metadata.createdAt,
      tone: "good",
    });
  }
  for (const review of input.records.reviews) {
    items.push({
      id: review.id,
      kind: "review",
      title: `Review ${review.decision}`,
      body: review.bodyMarkdown,
      actor: actorLabel(review.reviewer),
      targetLabel: `experiment/${review.experimentId}`,
      createdAt: review.metadata.createdAt,
      tone:
        review.decision === "approved"
          ? "good"
          : review.decision === "changes_requested"
            ? "warning"
            : review.decision === "rejected"
              ? "bad"
              : "neutral",
    });
  }
  for (const artifact of input.records.artifacts) {
    items.push({
      id: artifact.id,
      kind: "artifact",
      title: artifact.title,
      body: artifact.summaryMarkdown || artifact.uri,
      actor: actorLabel(artifact.createdBy),
      targetLabel: targetLabel(artifact.target),
      createdAt: artifact.metadata.createdAt,
      tone: "neutral",
    });
  }
  for (const notification of input.records.notifications) {
    items.push({
      id: notification.id,
      kind: "notification",
      title: notification.summaryMarkdown,
      body: notification.bodyMarkdown,
      actor: actorLabel(notification.createdBy),
      targetLabel: targetLabel(notification.target),
      createdAt: notification.metadata.createdAt,
      tone:
        notification.dismissedAt !== undefined
          ? "neutral"
          : notification.readAt === undefined
            ? "warning"
            : "neutral",
    });
  }

  items.sort(compareActivityItemsDesc);
  return items;
}

function fallbackPresentationSignals(input: {
  readonly derived: SnapshotDerivedModel;
  readonly latestBriefing?: BriefingRecord;
  readonly status: ProjectStatusSummary;
  readonly verification: ProjectVerification;
}): readonly CurrentSignal[] {
  const primary = input.derived.primaryMetric;
  const signals: CurrentSignal[] = [
    {
      id: "derived-assessment",
      slot: "assessment",
      label: "Assessment",
      value:
        input.latestBriefing === undefined
          ? input.status.label
          : titleCase(input.latestBriefing.assessment.replaceAll("_", " ")),
      summary:
        input.latestBriefing === undefined
          ? "No authored briefing has been recorded yet."
          : compactText(input.latestBriefing.headlineMarkdown),
      tone:
        input.latestBriefing === undefined
          ? statusToPresentationTone(input.status.tone)
          : briefingAssessmentTone(input.latestBriefing.assessment),
      refs: [],
      source: "derived",
    },
    {
      id: "derived-work",
      slot: "work",
      label: "Work",
      value: `${input.status.work.running} running · ${input.status.work.review} review`,
      summary: `${input.status.work.pending} pending · ${input.status.work.attention} attention`,
      tone: statusToPresentationTone(input.status.tone),
      refs: [],
      source: "derived",
    },
    {
      id: "derived-report",
      slot: "report",
      label: "Report",
      value: input.verification.ok ? "Ready" : "Not ready",
      summary: input.verification.ok
        ? "Completion checks are satisfied."
        : `${input.verification.checks.filter((check) => !check.ok).length} checks remain.`,
      tone: input.verification.ok ? "done" : "watch",
      refs: [],
      source: "derived",
    },
  ];

  if (primary !== undefined) {
    signals.splice(1, 0, {
      id: "derived-primary-metric",
      slot: "primary_metric",
      label: "Best metric",
      value:
        primary.bestValue === undefined
          ? primary.metricName
          : `${primary.metricName} ${formatMeasurementValue(primary.bestValue, primary.unit)}`,
      summary:
        primary.baselineValue === undefined || primary.bestValue === undefined
          ? "No baseline comparison yet."
          : `Baseline ${formatMeasurementValue(primary.baselineValue, primary.unit)}.`,
      tone: primary.bestValue === undefined ? "neutral" : "good",
      refs: [],
      source: "derived",
    });
  }

  return signals;
}

function briefingAssessmentTone(assessment: BriefingRecord["assessment"]): LiveTone {
  switch (assessment) {
    case "complete":
      return "done";
    case "on_track":
      return "good";
    case "watch":
      return "watch";
    case "blocked":
      return "blocked";
  }
}

function statusToPresentationTone(tone: ProjectStatusSummary["tone"]): LiveTone {
  switch (tone) {
    case "good":
      return "good";
    case "warning":
      return "watch";
    case "bad":
      return "blocked";
    case "neutral":
      return "neutral";
  }
}

function compactText(text: string): string {
  return text
    .replace(/[`*_>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (match) => match.toUpperCase());
}

function buildRelevantTargetKeys(input: {
  readonly projectId: string;
  readonly taskIdSet: ReadonlySet<string>;
  readonly baselineIdSet: ReadonlySet<string>;
  readonly experimentIdSet: ReadonlySet<string>;
  readonly measurementIdSet: ReadonlySet<string>;
  readonly reviewIdSet: ReadonlySet<string>;
  readonly reportIdSet: ReadonlySet<string>;
  readonly briefingIdSet: ReadonlySet<string>;
  readonly liveSignalIdSet: ReadonlySet<string>;
  readonly liveMapNodeIdSet: ReadonlySet<string>;
  readonly liveMapEdgeIdSet: ReadonlySet<string>;
  readonly liveFocusIdSet: ReadonlySet<string>;
  readonly liveNodeDetailIdSet: ReadonlySet<string>;
}): Set<string> {
  return new Set([
    targetKeyParts("project", input.projectId),
    ...[...input.taskIdSet].map((id) => targetKeyParts("task", id)),
    ...[...input.baselineIdSet].map((id) => targetKeyParts("baseline", id)),
    ...[...input.experimentIdSet].map((id) => targetKeyParts("experiment", id)),
    ...[...input.measurementIdSet].map((id) => targetKeyParts("measurement", id)),
    ...[...input.reviewIdSet].map((id) => targetKeyParts("review", id)),
    ...[...input.reportIdSet].map((id) => targetKeyParts("report", id)),
    ...[...input.briefingIdSet].map((id) => targetKeyParts("briefing", id)),
    ...[...input.liveSignalIdSet].map((id) => targetKeyParts("live_signal", id)),
    ...[...input.liveMapNodeIdSet].map((id) => targetKeyParts("live_node", id)),
    ...[...input.liveMapEdgeIdSet].map((id) => targetKeyParts("live_edge", id)),
    ...[...input.liveFocusIdSet].map((id) => targetKeyParts("live_focus", id)),
    ...[...input.liveNodeDetailIdSet].map((id) => targetKeyParts("live_detail", id)),
  ]);
}

function countByStatus<TStatus extends string, TRecord extends { readonly status: TStatus }>(
  records: readonly TRecord[],
  statuses: readonly TStatus[],
): Record<TStatus, number> {
  const counts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<
    TStatus,
    number
  >;
  for (const record of records) {
    counts[record.status] += 1;
  }
  return counts;
}

function latestRecord<T extends TimestampedRecord>(records: readonly T[]): T | undefined {
  return [...records].sort(compareRecordsDesc)[0];
}

function sortRecords<T extends TimestampedRecord>(records: readonly T[]): readonly T[] {
  return [...records].sort(compareRecordsAsc);
}

function currentRecordsByKey<T extends TimestampedRecord>(
  records: readonly T[],
  keyForRecord: (record: T) => string,
): T[] {
  const currentByKey = new Map<string, T>();

  for (const record of sortRecords(records)) {
    currentByKey.set(keyForRecord(record), record);
  }

  return [...currentByKey.values()];
}

type TimestampedRecord = {
  readonly id: string;
  readonly metadata: {
    readonly createdAt: string;
  };
};

function compareRecordsAsc(left: TimestampedRecord, right: TimestampedRecord): number {
  return (
    left.metadata.createdAt.localeCompare(right.metadata.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function compareMapNodesAsc(left: LiveMapNodeRecord, right: LiveMapNodeRecord): number {
  const leftTime = left.occurredAt ?? left.metadata.createdAt;
  const rightTime = right.occurredAt ?? right.metadata.createdAt;
  return leftTime.localeCompare(rightTime) || left.id.localeCompare(right.id);
}

function compareRecordsDesc(left: TimestampedRecord, right: TimestampedRecord): number {
  return (
    right.metadata.createdAt.localeCompare(left.metadata.createdAt) ||
    right.id.localeCompare(left.id)
  );
}

function compareActivityItemsDesc(left: ProjectActivityItem, right: ProjectActivityItem): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

function targetKey(target: { readonly targetKind: string; readonly targetId: string }): string {
  return targetKeyParts(target.targetKind, target.targetId);
}

function targetKeyParts(targetKind: string, targetId: string): string {
  return `${targetKind}/${targetId}`;
}

function targetLabel(target: { readonly targetKind: string; readonly targetId: string }): string {
  return targetKey(target);
}

function actorLabel(actor: ActorRef): string {
  return actor.displayName ?? `${actor.actorKind}/${actor.actorId}`;
}

function briefingTone(assessment: BriefingRecord["assessment"]): ProjectActivityItem["tone"] {
  switch (assessment) {
    case "complete":
    case "on_track":
      return "good";
    case "watch":
      return "warning";
    case "blocked":
      return "bad";
  }
}

function formatMeasurementValue(value: number, unit?: string): string {
  const formatted = Number.isInteger(value)
    ? value.toString()
    : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return unit === undefined ? formatted : `${formatted} ${unit}`;
}
