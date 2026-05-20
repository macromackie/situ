import type { ActorRef } from "@situ/common";
import type {
  ActorLabel,
  ContentsItem,
  LineageEdge,
  LineageNode,
  MetricPoint,
  MetricSeries,
  OutcomeRow,
  SwimlaneRow,
} from "@situ/reports-ui";
import { pickImprovementDirection } from "@situ/reports-ui";

import type { ProjectReportExperimentSnapshot, ProjectReportSnapshot } from "../types.js";

const cherryPickPattern = /cherry picked from commit ([0-9a-f]{7,40})/gi;

export type SnapshotDerivedModel = {
  readonly snapshot: ProjectReportSnapshot;
  readonly metricSeries: readonly MetricSeries[];
  readonly primaryMetric: MetricSeries | undefined;
  readonly secondaryMetrics: readonly MetricSeries[];
  readonly outcomeRows: readonly OutcomeRow[];
  readonly lineageNodes: readonly LineageNode[];
  readonly lineageEdges: readonly LineageEdge[];
  readonly swimlaneRows: readonly SwimlaneRow[];
  readonly swimlaneStartMs: number;
  readonly swimlaneEndMs: number;
  readonly actors: readonly ActorLabel[];
  readonly contents: readonly ContentsItem[];
  readonly counts: {
    readonly baselines: number;
    readonly tasks: number;
    readonly experiments: number;
    readonly measurements: number;
    readonly reviews: number;
    readonly accepted: number;
    readonly rejected: number;
    readonly measured: number;
  };
  readonly experiments: readonly ProjectReportExperimentSnapshot[];
};

export function deriveSnapshotModel(snapshot: ProjectReportSnapshot): SnapshotDerivedModel {
  const experiments = snapshot.tasks.flatMap((taskSnapshot) => taskSnapshot.experiments);
  const sortedExperiments = [...experiments];
  sortedExperiments.sort(
    (left, right) =>
      left.experiment.metadata.createdAt.localeCompare(right.experiment.metadata.createdAt) ||
      left.experiment.id.localeCompare(right.experiment.id),
  );
  const ordinalForExperiment = new Map<string, number>();
  for (const [index, experiment] of sortedExperiments.entries()) {
    ordinalForExperiment.set(experiment.experiment.id, index + 1);
  }

  const metricSeries = collectMetricSeriesList({
    snapshot,
    sortedExperiments,
    ordinalForExperiment,
  });
  const primaryMetric = pickPrimaryMetric(metricSeries);
  const secondaryMetrics = metricSeries.filter(
    (series) => series.metricName !== primaryMetric?.metricName,
  );

  const outcomeRows = buildOutcomeRows({ sortedExperiments, snapshot, primaryMetric });
  const lineage = buildLineageGraph({ sortedExperiments, primaryMetric });
  const swimlanes = buildSwimlaneRows({ snapshot, experiments: sortedExperiments });
  const actors = collectActors(snapshot, sortedExperiments);

  const contents: readonly ContentsItem[] = [
    { id: "abstract", label: "Abstract" },
    { id: "goal", label: "Goal and method" },
    { id: "progress", label: "Progress" },
    { id: "lineage", label: "Branch lineage" },
    { id: "parallelism", label: "Parallel work" },
    { id: "outcomes", label: "Experiment outcomes" },
    { id: "evidence", label: "Evidence" },
    { id: "appendix", label: "Appendix" },
  ];

  const accepted = sortedExperiments.filter((e) => e.experiment.status === "accepted").length;
  const rejected = sortedExperiments.filter((e) => e.experiment.status === "rejected").length;
  const measured = sortedExperiments.filter((e) => e.measurements.length > 0).length;
  let measurementsCount = 0;
  let reviewsCount = 0;
  for (const baseline of snapshot.baselines) {
    measurementsCount += baseline.measurements.length;
  }
  for (const experimentSnapshot of sortedExperiments) {
    measurementsCount += experimentSnapshot.measurements.length;
    reviewsCount += experimentSnapshot.reviews.length;
  }

  return {
    snapshot,
    metricSeries,
    primaryMetric,
    secondaryMetrics,
    outcomeRows,
    lineageNodes: lineage.nodes,
    lineageEdges: lineage.edges,
    swimlaneRows: swimlanes.rows,
    swimlaneStartMs: swimlanes.startMs,
    swimlaneEndMs: swimlanes.endMs,
    actors,
    contents,
    counts: {
      baselines: snapshot.baselines.length,
      tasks: snapshot.tasks.length,
      experiments: sortedExperiments.length,
      measurements: measurementsCount,
      reviews: reviewsCount,
      accepted,
      rejected,
      measured,
    },
    experiments: sortedExperiments,
  };
}

function collectMetricSeriesList(input: {
  snapshot: ProjectReportSnapshot;
  sortedExperiments: readonly ProjectReportExperimentSnapshot[];
  ordinalForExperiment: Map<string, number>;
}): readonly MetricSeries[] {
  const pointsByMetric = new Map<string, MetricPoint[]>();
  const unitsByMetric = new Map<string, string | undefined>();
  const baselineByMetric = new Map<string, number>();

  for (const baselineSnapshot of input.snapshot.baselines) {
    for (const measurementSnapshot of baselineSnapshot.measurements) {
      const m = measurementSnapshot.measurement;
      pushPoint(pointsByMetric, unitsByMetric, m.metricName, m.unit, {
        experimentOrdinal: 0,
        value: m.numericValue,
        origin: "baseline",
        actorLabel: actorLabel(m.measuredBy),
      });
      if (!baselineByMetric.has(m.metricName)) {
        baselineByMetric.set(m.metricName, m.numericValue);
      }
    }
  }

  for (const experimentSnapshot of input.sortedExperiments) {
    const ordinal = input.ordinalForExperiment.get(experimentSnapshot.experiment.id) ?? 0;
    for (const measurementSnapshot of experimentSnapshot.measurements) {
      const m = measurementSnapshot.measurement;
      pushPoint(pointsByMetric, unitsByMetric, m.metricName, m.unit, {
        experimentOrdinal: ordinal,
        value: m.numericValue,
        origin: "experiment",
        experimentId: experimentSnapshot.experiment.id,
        experimentTitle: experimentSnapshot.experiment.title,
        experimentStatus: experimentSnapshot.experiment.status,
        actorLabel: actorLabel(m.measuredBy),
      });
    }
  }

  const series: MetricSeries[] = [];
  for (const [metricName, points] of pointsByMetric.entries()) {
    const direction = pickImprovementDirection(metricName);
    const baselineValue = baselineByMetric.get(metricName);
    const experimentValues = points.filter((p) => p.origin === "experiment").map((p) => p.value);
    const bestValue =
      experimentValues.length === 0
        ? baselineValue
        : direction === "higher"
          ? Math.max(...experimentValues)
          : Math.min(...experimentValues);
    series.push({
      metricName,
      unit: unitsByMetric.get(metricName),
      direction,
      points,
      baselineValue,
      bestValue,
    });
  }
  series.sort((left, right) => left.metricName.localeCompare(right.metricName));
  return series;
}

function pushPoint(
  pointsByMetric: Map<string, MetricPoint[]>,
  unitsByMetric: Map<string, string | undefined>,
  metricName: string,
  unit: string | undefined,
  point: MetricPoint,
): void {
  const list = pointsByMetric.get(metricName) ?? [];
  list.push(point);
  pointsByMetric.set(metricName, list);
  if (!unitsByMetric.has(metricName)) {
    unitsByMetric.set(metricName, unit);
  }
}

function pickPrimaryMetric(seriesList: readonly MetricSeries[]): MetricSeries | undefined {
  const withBaseline = seriesList.filter((s) => s.baselineValue !== undefined);
  const candidates = withBaseline.length > 0 ? withBaseline : seriesList;
  const withExperimentPoints = candidates.filter((s) =>
    s.points.some((p) => p.origin === "experiment"),
  );
  const pool = withExperimentPoints.length > 0 ? withExperimentPoints : candidates;
  if (pool.length === 0) {
    return undefined;
  }
  const sorted = [...pool];
  sorted.sort((left, right) => {
    const leftCount = left.points.filter((p) => p.origin === "experiment").length;
    const rightCount = right.points.filter((p) => p.origin === "experiment").length;
    if (leftCount !== rightCount) {
      return rightCount - leftCount;
    }
    return left.metricName.localeCompare(right.metricName);
  });
  return sorted[0];
}

function buildOutcomeRows(input: {
  sortedExperiments: readonly ProjectReportExperimentSnapshot[];
  snapshot: ProjectReportSnapshot;
  primaryMetric: MetricSeries | undefined;
}): readonly OutcomeRow[] {
  return input.sortedExperiments.map((experimentSnapshot) => {
    const experiment = experimentSnapshot.experiment;
    const task = input.snapshot.tasks.find((t) => t.task.id === experiment.taskId);
    const actor = experiment.assignedTo ?? experiment.createdBy;
    const bestValue = bestValueForExperiment(experimentSnapshot, input.primaryMetric);
    const delta =
      bestValue !== undefined && input.primaryMetric?.baselineValue !== undefined
        ? input.primaryMetric.direction === "higher"
          ? bestValue - input.primaryMetric.baselineValue
          : input.primaryMetric.baselineValue - bestValue
        : undefined;
    return {
      experimentId: experiment.id,
      experimentTitle: experiment.title,
      taskTitle: task?.task.title ?? "(unknown task)",
      status: experiment.status,
      actor: actorLabel(actor),
      branchName: experiment.branchName,
      bestValue,
      bestValueUnit: input.primaryMetric?.unit,
      deltaVsBaseline: delta,
    };
  });
}

function bestValueForExperiment(
  experimentSnapshot: ProjectReportExperimentSnapshot,
  primaryMetric: MetricSeries | undefined,
): number | undefined {
  if (primaryMetric === undefined) {
    return undefined;
  }
  const values = experimentSnapshot.measurements
    .filter((m) => m.measurement.metricName === primaryMetric.metricName)
    .map((m) => m.measurement.numericValue);
  if (values.length === 0) {
    return undefined;
  }
  return primaryMetric.direction === "higher" ? Math.max(...values) : Math.min(...values);
}

function buildLineageGraph(input: {
  sortedExperiments: readonly ProjectReportExperimentSnapshot[];
  primaryMetric: MetricSeries | undefined;
}): { nodes: readonly LineageNode[]; edges: readonly LineageEdge[] } {
  if (input.sortedExperiments.length === 0) {
    return { nodes: [], edges: [] };
  }
  const baseRefCounts = new Map<string, number>();
  for (const exp of input.sortedExperiments) {
    if (exp.experiment.baseRef !== undefined) {
      baseRefCounts.set(
        exp.experiment.baseRef,
        (baseRefCounts.get(exp.experiment.baseRef) ?? 0) + 1,
      );
    }
  }
  const sharedBaseRef = Array.from(baseRefCounts.entries()).reduce<
    { ref: string; count: number } | undefined
  >((current, [ref, count]) => {
    if (current === undefined || count > current.count) {
      return { ref, count };
    }
    return current;
  }, undefined);
  const initialId = "node-initial";
  const initialLabel =
    sharedBaseRef !== undefined ? sharedBaseRef.ref.slice(0, 7) : "Initial state";
  const synthesisExperiment = pickSynthesisExperiment(input.sortedExperiments, sharedBaseRef?.ref);

  const nodes: LineageNode[] = [
    { id: initialId, kind: "initial", label: initialLabel, subLabel: "baseline state" },
  ];
  const edges: LineageEdge[] = [];

  for (const experimentSnapshot of input.sortedExperiments) {
    const experiment = experimentSnapshot.experiment;
    if (experiment.branchName === undefined) {
      continue;
    }
    const isSynthesis = synthesisExperiment?.experiment.id === experiment.id;
    const nodeId = `node-${experiment.id}`;
    const actor = experiment.assignedTo ?? experiment.createdBy;
    const delta = formatExperimentDelta(experimentSnapshot, input.primaryMetric);
    nodes.push({
      id: nodeId,
      kind: isSynthesis ? "synthesis" : "candidate",
      label: experiment.branchName,
      subLabel: experiment.title,
      status: experiment.status,
      actor: actorLabel(actor),
      delta,
      branchName: experiment.branchName,
    });
    if (isSynthesis) {
      const parent = input.sortedExperiments.find(
        (cand) =>
          cand.experiment.id !== experiment.id &&
          cand.experiment.branchName !== undefined &&
          experiment.baseRef !== undefined &&
          (cand.experiment.branchName === experiment.baseRef ||
            cand.experiment.branchName.startsWith(experiment.baseRef) ||
            experiment.baseRef.startsWith(cand.experiment.branchName)),
      );
      if (parent !== undefined) {
        edges.push({
          fromId: `node-${parent.experiment.id}`,
          toId: nodeId,
          kind: "parent",
          label: "branch",
        });
      } else {
        edges.push({ fromId: initialId, toId: nodeId, kind: "parent", label: "branch" });
      }
    } else {
      edges.push({ fromId: initialId, toId: nodeId, kind: "parent" });
    }
  }

  // Cherry-pick edges from text patterns
  if (synthesisExperiment !== undefined) {
    const synthesisId = synthesisExperiment.experiment.id;
    const corpus = collectExperimentText(synthesisExperiment);
    const cherryShas = Array.from(
      new Set(
        Array.from(corpus.matchAll(cherryPickPattern)).flatMap((m) =>
          typeof m[1] === "string" ? [m[1]] : [],
        ),
      ),
    );
    const usedFrom = new Set<string>();
    for (const sha of cherryShas) {
      const candidate = input.sortedExperiments.find(
        (cand) => cand.experiment.id !== synthesisId && collectExperimentText(cand).includes(sha),
      );
      const fallbackHinted = input.sortedExperiments.find(
        (cand) =>
          cand.experiment.id !== synthesisId &&
          cand.experiment.branchName !== undefined &&
          corpus.includes(cand.experiment.branchName),
      );
      const source = candidate ?? fallbackHinted;
      if (source === undefined) {
        continue;
      }
      const fromId = `node-${source.experiment.id}`;
      if (usedFrom.has(fromId)) {
        continue;
      }
      edges.push({
        fromId,
        toId: `node-${synthesisId}`,
        kind: "cherry-pick",
        label: sha.slice(0, 7),
      });
      usedFrom.add(fromId);
    }
  }

  return { nodes, edges };
}

function pickSynthesisExperiment(
  experiments: readonly ProjectReportExperimentSnapshot[],
  sharedBaseRef: string | undefined,
): ProjectReportExperimentSnapshot | undefined {
  const followUps = experiments.filter(
    (e) =>
      e.experiment.baseRef !== undefined &&
      (sharedBaseRef === undefined || e.experiment.baseRef !== sharedBaseRef),
  );
  const named = followUps.find((e) => {
    const haystack = [e.experiment.title, e.experiment.branchName ?? "", e.experiment.id]
      .join(" ")
      .toLowerCase();
    return haystack.includes("synthesis") || haystack.includes("combined");
  });
  return named ?? followUps[0];
}

function collectExperimentText(experimentSnapshot: ProjectReportExperimentSnapshot): string {
  const parts: string[] = [
    experimentSnapshot.experiment.summaryMarkdown,
    experimentSnapshot.experiment.branchName ?? "",
    experimentSnapshot.experiment.baseRef ?? "",
  ];
  for (const event of experimentSnapshot.target.events) {
    parts.push(event.summaryMarkdown);
    if (event.bodyMarkdown !== undefined) {
      parts.push(event.bodyMarkdown);
    }
  }
  for (const comment of experimentSnapshot.target.comments) {
    parts.push(comment.bodyMarkdown);
  }
  for (const report of experimentSnapshot.target.reports) {
    parts.push(report.bodyMarkdown);
  }
  for (const measurementSnapshot of experimentSnapshot.measurements) {
    parts.push(measurementSnapshot.measurement.summaryMarkdown);
    if (measurementSnapshot.measurement.detailsMarkdown !== undefined) {
      parts.push(measurementSnapshot.measurement.detailsMarkdown);
    }
  }
  return parts.join("\n");
}

function formatExperimentDelta(
  experimentSnapshot: ProjectReportExperimentSnapshot,
  primaryMetric: MetricSeries | undefined,
): string | undefined {
  if (primaryMetric === undefined || primaryMetric.baselineValue === undefined) {
    return undefined;
  }
  const values = experimentSnapshot.measurements
    .filter((m) => m.measurement.metricName === primaryMetric.metricName)
    .map((m) => m.measurement.numericValue);
  if (values.length === 0) {
    return undefined;
  }
  const best = primaryMetric.direction === "higher" ? Math.max(...values) : Math.min(...values);
  const delta =
    primaryMetric.direction === "higher"
      ? best - primaryMetric.baselineValue
      : primaryMetric.baselineValue - best;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  return `${sign}${Math.abs(delta).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function buildSwimlaneRows(input: {
  snapshot: ProjectReportSnapshot;
  experiments: readonly ProjectReportExperimentSnapshot[];
}): { rows: readonly SwimlaneRow[]; startMs: number; endMs: number } {
  const byActor = new Map<string, SwimlaneRow["marks"][number][]>();
  const add = (
    actor: ActorRef,
    atIso: string,
    kind: SwimlaneRow["marks"][number]["kind"],
    detail: string,
  ): void => {
    const label = actorLabel(actor);
    const atMs = parseMs(atIso);
    if (atMs === undefined) {
      return;
    }
    const existing = byActor.get(label) ?? [];
    existing.push({ atMs, kind, detail });
    byActor.set(label, existing);
  };

  add(
    input.snapshot.project.createdBy,
    input.snapshot.project.metadata.createdAt,
    "creation",
    `Started project ${input.snapshot.project.name}`,
  );
  for (const baselineSnapshot of input.snapshot.baselines) {
    add(
      baselineSnapshot.baseline.createdBy,
      baselineSnapshot.baseline.metadata.createdAt,
      "creation",
      `Created baseline ${baselineSnapshot.baseline.title}`,
    );
    for (const measurementSnapshot of baselineSnapshot.measurements) {
      add(
        measurementSnapshot.measurement.measuredBy,
        measurementSnapshot.measurement.metadata.createdAt,
        "measurement",
        `Measured baseline ${measurementSnapshot.measurement.metricName}`,
      );
    }
  }
  for (const taskSnapshot of input.snapshot.tasks) {
    add(
      taskSnapshot.task.createdBy,
      taskSnapshot.task.metadata.createdAt,
      "creation",
      `Created task ${taskSnapshot.task.title}`,
    );
    if (
      taskSnapshot.task.assignedTo !== undefined &&
      actorLabel(taskSnapshot.task.assignedTo) !== actorLabel(taskSnapshot.task.createdBy)
    ) {
      add(
        taskSnapshot.task.assignedTo,
        taskSnapshot.task.metadata.createdAt,
        "assignment",
        `Assigned task ${taskSnapshot.task.title}`,
      );
    }
  }
  for (const experimentSnapshot of input.experiments) {
    const experiment = experimentSnapshot.experiment;
    add(
      experiment.createdBy,
      experiment.metadata.createdAt,
      "creation",
      `Started experiment ${experiment.title}`,
    );
    if (
      experiment.assignedTo !== undefined &&
      actorLabel(experiment.assignedTo) !== actorLabel(experiment.createdBy)
    ) {
      add(
        experiment.assignedTo,
        experiment.metadata.createdAt,
        "assignment",
        `Assigned experiment ${experiment.title}`,
      );
    }
    for (const measurementSnapshot of experimentSnapshot.measurements) {
      add(
        measurementSnapshot.measurement.measuredBy,
        measurementSnapshot.measurement.metadata.createdAt,
        "measurement",
        `Measured ${measurementSnapshot.measurement.metricName}`,
      );
    }
    for (const reviewSnapshot of experimentSnapshot.reviews) {
      add(
        reviewSnapshot.review.reviewer,
        reviewSnapshot.review.metadata.createdAt,
        "review",
        `Review ${reviewSnapshot.review.decision}`,
      );
    }
  }

  const allMs: number[] = [];
  for (const marks of byActor.values()) {
    for (const mark of marks) {
      allMs.push(mark.atMs);
    }
  }
  const startMs = allMs.length === 0 ? 0 : Math.min(...allMs);
  const endMs = allMs.length === 0 ? 0 : Math.max(...allMs);
  const rows = Array.from(byActor.entries()).map(([actor, marks]) => {
    const orderedMarks = [...marks];
    orderedMarks.sort((left, right) => left.atMs - right.atMs);
    return { actor, marks: orderedMarks };
  });
  rows.sort((left, right) => {
    const leftFirst = left.marks[0]?.atMs ?? Number.MAX_SAFE_INTEGER;
    const rightFirst = right.marks[0]?.atMs ?? Number.MAX_SAFE_INTEGER;
    if (leftFirst !== rightFirst) {
      return leftFirst - rightFirst;
    }
    return left.actor.localeCompare(right.actor);
  });
  return { rows, startMs, endMs };
}

function collectActors(
  snapshot: ProjectReportSnapshot,
  experiments: readonly ProjectReportExperimentSnapshot[],
): readonly ActorLabel[] {
  const rolePriority: Record<string, number> = {
    principal: 0,
    review: 1,
    baseline: 2,
    experiment: 3,
    measurement: 4,
    task: 5,
  };
  const seen = new Map<string, { roles: Set<string>; firstSeenMs: number }>();
  const add = (actor: ActorRef, role: string, atIso: string): void => {
    const label = actorLabel(actor);
    const atMs = parseMs(atIso) ?? Number.MAX_SAFE_INTEGER;
    const entry = seen.get(label) ?? { roles: new Set<string>(), firstSeenMs: atMs };
    entry.roles.add(role);
    if (atMs < entry.firstSeenMs) {
      entry.firstSeenMs = atMs;
    }
    seen.set(label, entry);
  };
  add(snapshot.project.createdBy, "principal", snapshot.project.metadata.createdAt);
  for (const baselineSnapshot of snapshot.baselines) {
    add(
      baselineSnapshot.baseline.createdBy,
      "baseline",
      baselineSnapshot.baseline.metadata.createdAt,
    );
    for (const measurementSnapshot of baselineSnapshot.measurements) {
      add(
        measurementSnapshot.measurement.measuredBy,
        "measurement",
        measurementSnapshot.measurement.metadata.createdAt,
      );
    }
  }
  for (const taskSnapshot of snapshot.tasks) {
    add(taskSnapshot.task.createdBy, "task", taskSnapshot.task.metadata.createdAt);
    if (taskSnapshot.task.assignedTo !== undefined) {
      add(taskSnapshot.task.assignedTo, "task", taskSnapshot.task.metadata.createdAt);
    }
  }
  for (const experimentSnapshot of experiments) {
    add(
      experimentSnapshot.experiment.createdBy,
      "experiment",
      experimentSnapshot.experiment.metadata.createdAt,
    );
    if (experimentSnapshot.experiment.assignedTo !== undefined) {
      add(
        experimentSnapshot.experiment.assignedTo,
        "experiment",
        experimentSnapshot.experiment.metadata.createdAt,
      );
    }
    for (const measurementSnapshot of experimentSnapshot.measurements) {
      add(
        measurementSnapshot.measurement.measuredBy,
        "measurement",
        measurementSnapshot.measurement.metadata.createdAt,
      );
    }
    for (const reviewSnapshot of experimentSnapshot.reviews) {
      add(reviewSnapshot.review.reviewer, "review", reviewSnapshot.review.metadata.createdAt);
    }
  }
  const sorted = Array.from(seen.entries());
  sorted.sort(([leftLabel, leftInfo], [rightLabel, rightInfo]) => {
    if (leftInfo.firstSeenMs !== rightInfo.firstSeenMs) {
      return leftInfo.firstSeenMs - rightInfo.firstSeenMs;
    }
    return leftLabel.localeCompare(rightLabel);
  });
  return sorted.map(([label, info]) => {
    const ordered = [...info.roles];
    ordered.sort((left, right) => (rolePriority[left] ?? 99) - (rolePriority[right] ?? 99));
    const role = ordered[0] ?? "actor";
    return { displayName: label, role };
  });
}

function actorLabel(actor: ActorRef): string {
  if (actor.displayName !== undefined && actor.displayName.length > 0) {
    return actor.displayName;
  }
  return `${actor.actorKind}/${actor.actorId}`;
}

function parseMs(iso: string | undefined): number | undefined {
  if (iso === undefined) {
    return undefined;
  }
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : undefined;
}
