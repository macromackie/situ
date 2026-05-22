import { expect, test } from "bun:test";

import type { ActorRef, SyncMetadata, TargetRef } from "@situ/common";
import type { BriefingRecord } from "@situ/briefings";
import type { ExperimentRecord } from "@situ/experiments";
import type {
  LiveFocusRecord,
  LiveMapEdgeRecord,
  LiveMapNodeRecord,
  LiveNodeDetailRecord,
  LiveSignalRecord,
} from "@situ/live";
import type { MeasurementRecord } from "@situ/measurements";
import type { ProjectRecord } from "@situ/projects";
import type { ReportRecord } from "@situ/reports";
import type { ReviewRecord } from "@situ/reviews";
import type { TaskRecord } from "@situ/tasks";

import { buildProjectIndexModel, buildProjectOverviewModel, type ClientRecords } from "./model.js";

const human: ActorRef = {
  actorKind: "human",
  actorId: "scott",
  displayName: "Scott",
};

const manager: ActorRef = {
  actorKind: "local_agent",
  actorId: "manager",
  displayName: "Manager",
};

const baseRecords: ClientRecords = {
  projects: [],
  tasks: [],
  baselines: [],
  experiments: [],
  measurements: [],
  reviews: [],
  artifacts: [],
  reports: [],
  briefings: [],
  liveSignals: [],
  liveMapNodes: [],
  liveMapEdges: [],
  liveFocuses: [],
  liveNodeDetails: [],
  comments: [],
  events: [],
  notifications: [],
};

test("selects the requested project and derives running status from replicated records", () => {
  const project = projectRecord({
    id: "project_live_one",
    name: "Project One",
    createdAt: "2026-05-20T10:00:00.000Z",
  });
  const task = taskRecord({
    id: "task_live_one",
    projectId: project.id,
    status: "in_progress",
    createdAt: "2026-05-20T10:01:00.000Z",
  });
  const experiment = experimentRecord({
    id: "experiment_live_one",
    projectId: project.id,
    taskId: task.id,
    status: "running",
    createdAt: "2026-05-20T10:02:00.000Z",
  });

  const model = buildProjectOverviewModel({
    records: {
      ...baseRecords,
      projects: [project],
      tasks: [task],
      experiments: [experiment],
    },
    requestedProjectId: project.id,
  });

  expect(model.kind).toBe("project");
  if (model.kind !== "project") {
    throw new Error("Expected a project model.");
  }
  expect(model.project.id).toBe(project.id);
  expect(model.status.label).toBe("Running");
  expect(model.status.work.running).toBe(2);
  expect(model.status.isIdle).toBe(false);
  expect(model.verification.ok).toBe(false);
  expect(model.verification.checks.find((check) => check.name === "no-active-tasks")?.ok).toBe(
    false,
  );
});

test("does not auto-select a project without a requested project id", () => {
  const activeProject = projectRecord({
    id: "project_active",
    name: "Active Project",
    createdAt: "2026-05-20T10:00:00.000Z",
  });
  const newerProject = projectRecord({
    id: "project_newer",
    name: "Newer Project",
    createdAt: "2026-05-20T11:00:00.000Z",
  });

  const model = buildProjectOverviewModel({
    records: {
      ...baseRecords,
      projects: [activeProject, newerProject],
    },
  });

  expect(model.kind).toBe("empty");
  expect(model.missingRequestedProject).toBe(false);
  expect(model.allProjects.map((project) => project.id)).toEqual([
    activeProject.id,
    newerProject.id,
  ]);
});

test("returns an empty overview model when the requested project is missing", () => {
  const project = projectRecord({
    id: "project_present",
    name: "Present Project",
    createdAt: "2026-05-20T10:00:00.000Z",
  });

  const model = buildProjectOverviewModel({
    records: {
      ...baseRecords,
      projects: [project],
    },
    requestedProjectId: "project_missing",
  });

  expect(model.kind).toBe("empty");
  expect(model.requestedProjectId).toBe("project_missing");
  expect(model.missingRequestedProject).toBe(true);
});

test("builds a project index grouped by active and archived projects", () => {
  const activeProject = projectRecord({
    id: "project_active_index",
    name: "Active Index Project",
    createdAt: "2026-05-20T10:00:00.000Z",
  });
  const archivedProject = projectRecord({
    id: "project_archived_index",
    name: "Archived Index Project",
    status: "archived",
    createdAt: "2026-05-20T11:00:00.000Z",
  });

  const model = buildProjectIndexModel({
    records: {
      ...baseRecords,
      projects: [archivedProject, activeProject],
    },
  });

  expect(model.activeProjects.map((project) => project.id)).toEqual([activeProject.id]);
  expect(model.archivedProjects.map((project) => project.id)).toEqual([archivedProject.id]);
  expect(model.allProjects.map((project) => project.id)).toEqual([
    activeProject.id,
    archivedProject.id,
  ]);
});

test("marks a completed project verified when records satisfy completion checks", () => {
  const project = projectRecord({
    id: "project_done",
    name: "Done Project",
    createdAt: "2026-05-20T10:00:00.000Z",
  });
  const task = taskRecord({
    id: "task_done",
    projectId: project.id,
    status: "done",
    createdAt: "2026-05-20T10:01:00.000Z",
  });
  const experiment = experimentRecord({
    id: "experiment_done",
    projectId: project.id,
    taskId: task.id,
    status: "accepted",
    createdAt: "2026-05-20T10:02:00.000Z",
  });
  const measurement = measurementRecord({
    id: "measurement_done",
    experimentId: experiment.id,
    createdAt: "2026-05-20T10:03:00.000Z",
  });
  const review = reviewRecord({
    id: "review_done",
    experimentId: experiment.id,
    decision: "approved",
    createdAt: "2026-05-20T10:04:00.000Z",
  });
  const report = reportRecord({
    id: "report_done",
    projectId: project.id,
    target: target("project", project.id),
    title: "Final report",
    createdAt: "2026-05-20T10:05:00.000Z",
  });

  const model = buildProjectOverviewModel({
    records: {
      ...baseRecords,
      projects: [project],
      tasks: [task],
      experiments: [experiment],
      measurements: [measurement],
      reviews: [review],
      reports: [report],
    },
    requestedProjectId: project.id,
  });

  expect(model.kind).toBe("project");
  if (model.kind !== "project") {
    throw new Error("Expected a project model.");
  }
  expect(model.status.isIdle).toBe(true);
  expect(model.verification.ok).toBe(true);
  expect(model.latestReport?.id).toBe(report.id);
});

test("orders project activity newest first across reports and evidence records", () => {
  const project = projectRecord({
    id: "project_activity",
    name: "Activity Project",
    createdAt: "2026-05-20T10:00:00.000Z",
  });
  const task = taskRecord({
    id: "task_activity",
    projectId: project.id,
    status: "done",
    createdAt: "2026-05-20T10:01:00.000Z",
  });
  const experiment = experimentRecord({
    id: "experiment_activity",
    projectId: project.id,
    taskId: task.id,
    status: "accepted",
    createdAt: "2026-05-20T10:02:00.000Z",
  });
  const measurement = measurementRecord({
    id: "measurement_activity",
    experimentId: experiment.id,
    createdAt: "2026-05-20T10:03:00.000Z",
  });
  const report = reportRecord({
    id: "report_activity",
    projectId: project.id,
    target: target("project", project.id),
    title: "Checkpoint",
    createdAt: "2026-05-20T10:04:00.000Z",
  });

  const model = buildProjectOverviewModel({
    records: {
      ...baseRecords,
      projects: [project],
      tasks: [task],
      experiments: [experiment],
      measurements: [measurement],
      reports: [report],
    },
    requestedProjectId: project.id,
  });

  expect(model.kind).toBe("project");
  if (model.kind !== "project") {
    throw new Error("Expected a project model.");
  }
  expect(model.activity.map((item) => item.id).slice(0, 2)).toEqual([
    "report_activity",
    "measurement_activity",
  ]);
});

test("selects the latest project briefing and includes it in activity", () => {
  const project = projectRecord({
    id: "project_briefing",
    name: "Briefing Project",
    createdAt: "2026-05-20T10:00:00.000Z",
  });
  const ignoredProject = projectRecord({
    id: "project_ignored",
    name: "Ignored Project",
    createdAt: "2026-05-20T10:00:00.000Z",
  });
  const firstBriefing = briefingRecord({
    id: "briefing_first",
    projectId: project.id,
    assessment: "watch",
    createdAt: "2026-05-20T10:01:00.000Z",
  });
  const latestBriefing = briefingRecord({
    id: "briefing_latest",
    projectId: project.id,
    assessment: "on_track",
    createdAt: "2026-05-20T10:02:00.000Z",
  });
  const ignoredBriefing = briefingRecord({
    id: "briefing_ignored",
    projectId: ignoredProject.id,
    assessment: "blocked",
    createdAt: "2026-05-20T10:03:00.000Z",
  });

  const model = buildProjectOverviewModel({
    records: {
      ...baseRecords,
      projects: [project, ignoredProject],
      briefings: [firstBriefing, latestBriefing, ignoredBriefing],
    },
    requestedProjectId: project.id,
  });

  expect(model.kind).toBe("project");
  if (model.kind !== "project") {
    throw new Error("Expected a project model.");
  }
  expect(model.latestBriefing?.id).toBe(latestBriefing.id);
  expect(model.records.briefings.map((briefing) => briefing.id)).toEqual([
    firstBriefing.id,
    latestBriefing.id,
  ]);
  expect(model.activity[0]).toMatchObject({
    id: latestBriefing.id,
    kind: "briefing",
    tone: "good",
  });
});

test("derives current presentation records by key and honors hidden records", () => {
  const project = projectRecord({
    id: "project_presentation",
    name: "Presentation Project",
    createdAt: "2026-05-20T10:00:00.000Z",
  });
  const visibleSignal = liveSignalRecord({
    id: "live_signal_decision",
    projectId: project.id,
    slot: "decision",
    value: "Keep parser branch",
    createdAt: "2026-05-20T10:01:00.000Z",
  });
  const hiddenSignal = liveSignalRecord({
    id: "live_signal_risk_hidden",
    projectId: project.id,
    slot: "risk",
    value: "Old risk",
    visibility: "hidden",
    createdAt: "2026-05-20T10:03:00.000Z",
  });
  const visibleNode = liveMapNodeRecord({
    id: "live_node_baseline",
    projectId: project.id,
    nodeKey: "baseline",
    title: "Baseline",
    createdAt: "2026-05-20T10:01:00.000Z",
  });
  const hiddenNode = liveMapNodeRecord({
    id: "live_node_parser_hidden",
    projectId: project.id,
    nodeKey: "parser",
    title: "Parser",
    visibility: "hidden",
    createdAt: "2026-05-20T10:04:00.000Z",
  });
  const edge = liveMapEdgeRecord({
    id: "live_edge_parser",
    projectId: project.id,
    fromNodeKey: "baseline",
    toNodeKey: "parser",
    createdAt: "2026-05-20T10:05:00.000Z",
  });
  const detail = liveNodeDetailRecord({
    id: "live_detail_baseline",
    projectId: project.id,
    nodeKey: "baseline",
    createdAt: "2026-05-20T10:06:00.000Z",
  });

  const model = buildProjectOverviewModel({
    records: {
      ...baseRecords,
      projects: [project],
      liveSignals: [hiddenSignal, visibleSignal],
      liveMapNodes: [hiddenNode, visibleNode],
      liveMapEdges: [edge],
      liveNodeDetails: [detail],
    },
    requestedProjectId: project.id,
  });

  expect(model.kind).toBe("project");
  if (model.kind !== "project") {
    throw new Error("Expected a project model.");
  }
  expect(model.presentation.signals.map((signal) => signal.id)).toEqual([visibleSignal.id]);
  expect(model.presentation.map.nodes.map((node) => node.nodeKey)).toEqual(["baseline"]);
  expect(model.presentation.map.edges).toEqual([]);
  expect(model.presentation.map.detailsByNodeKey.get("baseline")?.id).toBe(detail.id);
});

test("falls back to derived signals and selects the newest current focus", () => {
  const project = projectRecord({
    id: "project_focus",
    name: "Focus Project",
    createdAt: "2026-05-20T10:00:00.000Z",
  });
  const briefing = briefingRecord({
    id: "briefing_focus",
    projectId: project.id,
    assessment: "on_track",
    createdAt: "2026-05-20T10:01:00.000Z",
  });
  const firstFocus = liveFocusRecord({
    id: "live_focus_old",
    projectId: project.id,
    primaryNodeKey: "baseline",
    createdAt: "2026-05-20T10:02:00.000Z",
  });
  const latestFocus = liveFocusRecord({
    id: "live_focus_new",
    projectId: project.id,
    primaryNodeKey: "parser",
    createdAt: "2026-05-20T10:03:00.000Z",
  });

  const model = buildProjectOverviewModel({
    records: {
      ...baseRecords,
      projects: [project],
      briefings: [briefing],
      liveFocuses: [latestFocus, firstFocus],
    },
    requestedProjectId: project.id,
  });

  expect(model.kind).toBe("project");
  if (model.kind !== "project") {
    throw new Error("Expected a project model.");
  }
  expect(model.presentation.signals[0]).toMatchObject({
    source: "derived",
    label: "Assessment",
    value: "On Track",
    tone: "good",
  });
  expect(model.presentation.map.focus?.id).toBe(latestFocus.id);
});

function metadata(createdAt: string): SyncMetadata {
  return {
    createdAt,
    updatedAt: createdAt,
  };
}

function projectRecord(input: {
  readonly id: string;
  readonly name: string;
  readonly status?: ProjectRecord["status"];
  readonly createdAt: string;
}): ProjectRecord {
  return {
    id: input.id,
    name: input.name,
    repositoryPath: "/tmp/client",
    goalMarkdown: "Exercise the client UI.",
    status: input.status ?? "active",
    createdBy: human,
    metadata: metadata(input.createdAt),
  } as ProjectRecord;
}

function taskRecord(input: {
  readonly id: string;
  readonly projectId: ProjectRecord["id"];
  readonly status: TaskRecord["status"];
  readonly createdAt: string;
}): TaskRecord {
  return {
    id: input.id,
    projectId: input.projectId,
    title: input.id,
    bodyMarkdown: "Task body.",
    status: input.status,
    createdBy: manager,
    metadata: metadata(input.createdAt),
  } as TaskRecord;
}

function experimentRecord(input: {
  readonly id: string;
  readonly projectId: ProjectRecord["id"];
  readonly taskId: TaskRecord["id"];
  readonly status: ExperimentRecord["status"];
  readonly createdAt: string;
}): ExperimentRecord {
  return {
    id: input.id,
    projectId: input.projectId,
    taskId: input.taskId,
    title: input.id,
    summaryMarkdown: "Experiment summary.",
    status: input.status,
    revisionNumber: 1,
    createdBy: manager,
    metadata: metadata(input.createdAt),
  } as ExperimentRecord;
}

function measurementRecord(input: {
  readonly id: string;
  readonly experimentId: ExperimentRecord["id"];
  readonly createdAt: string;
}): MeasurementRecord {
  return {
    id: input.id,
    experimentId: input.experimentId,
    revisionNumber: 1,
    metricName: "score",
    numericValue: 10,
    summaryMarkdown: "Measured score.",
    measuredBy: manager,
    metadata: metadata(input.createdAt),
  } as MeasurementRecord;
}

function reviewRecord(input: {
  readonly id: string;
  readonly experimentId: ExperimentRecord["id"];
  readonly decision: ReviewRecord["decision"];
  readonly createdAt: string;
}): ReviewRecord {
  return {
    id: input.id,
    experimentId: input.experimentId,
    revisionNumber: 1,
    decision: input.decision,
    bodyMarkdown: "Review body.",
    reviewer: human,
    metadata: metadata(input.createdAt),
  } as ReviewRecord;
}

function reportRecord(input: {
  readonly id: string;
  readonly projectId: ProjectRecord["id"];
  readonly target: TargetRef;
  readonly title: string;
  readonly createdAt: string;
}): ReportRecord {
  return {
    id: input.id,
    projectId: input.projectId,
    target: input.target,
    title: input.title,
    bodyMarkdown: "Report body.",
    generatedBy: manager,
    metadata: metadata(input.createdAt),
  } as ReportRecord;
}

function briefingRecord(input: {
  readonly id: string;
  readonly projectId: ProjectRecord["id"];
  readonly assessment: BriefingRecord["assessment"];
  readonly createdAt: string;
}): BriefingRecord {
  return {
    id: input.id,
    projectId: input.projectId,
    title: input.id,
    stage: "evaluating",
    assessment: input.assessment,
    headlineMarkdown: "The run is moving through evaluation.",
    blocks: [],
    evidenceRefs: [],
    authoredBy: manager,
    metadata: metadata(input.createdAt),
  } as BriefingRecord;
}

function liveSignalRecord(input: {
  readonly id: string;
  readonly projectId: ProjectRecord["id"];
  readonly slot: string;
  readonly value: string;
  readonly visibility?: LiveSignalRecord["visibility"];
  readonly createdAt: string;
}): LiveSignalRecord {
  return {
    id: input.id,
    projectId: input.projectId,
    slot: input.slot,
    label: input.slot,
    value: input.value,
    tone: "good",
    refs: [],
    visibility: input.visibility ?? "visible",
    authoredBy: manager,
    metadata: metadata(input.createdAt),
  } as LiveSignalRecord;
}

function liveMapNodeRecord(input: {
  readonly id: string;
  readonly projectId: ProjectRecord["id"];
  readonly nodeKey: string;
  readonly title: string;
  readonly visibility?: LiveMapNodeRecord["visibility"];
  readonly createdAt: string;
}): LiveMapNodeRecord {
  return {
    id: input.id,
    projectId: input.projectId,
    nodeKey: input.nodeKey,
    kind: "branch",
    title: input.title,
    summary: "Node summary.",
    tone: "good",
    refs: [],
    visibility: input.visibility ?? "visible",
    authoredBy: manager,
    metadata: metadata(input.createdAt),
  } as LiveMapNodeRecord;
}

function liveMapEdgeRecord(input: {
  readonly id: string;
  readonly projectId: ProjectRecord["id"];
  readonly fromNodeKey: string;
  readonly toNodeKey: string;
  readonly createdAt: string;
}): LiveMapEdgeRecord {
  return {
    id: input.id,
    projectId: input.projectId,
    edgeKey: input.id,
    fromNodeKey: input.fromNodeKey,
    toNodeKey: input.toNodeKey,
    relation: "led_to",
    tone: "good",
    visibility: "visible",
    authoredBy: manager,
    metadata: metadata(input.createdAt),
  } as LiveMapEdgeRecord;
}

function liveFocusRecord(input: {
  readonly id: string;
  readonly projectId: ProjectRecord["id"];
  readonly primaryNodeKey: string;
  readonly createdAt: string;
}): LiveFocusRecord {
  return {
    id: input.id,
    projectId: input.projectId,
    mode: "node",
    primaryNodeKey: input.primaryNodeKey,
    relatedNodeKeys: [],
    authoredBy: manager,
    metadata: metadata(input.createdAt),
  } as LiveFocusRecord;
}

function liveNodeDetailRecord(input: {
  readonly id: string;
  readonly projectId: ProjectRecord["id"];
  readonly nodeKey: string;
  readonly createdAt: string;
}): LiveNodeDetailRecord {
  return {
    id: input.id,
    projectId: input.projectId,
    nodeKey: input.nodeKey,
    bodyMarkdown: "Detail body.",
    facts: [],
    refs: [],
    authoredBy: manager,
    metadata: metadata(input.createdAt),
  } as LiveNodeDetailRecord;
}

function target(targetKind: TargetRef["targetKind"], targetId: string): TargetRef {
  return {
    targetKind,
    targetId,
  } as TargetRef;
}
