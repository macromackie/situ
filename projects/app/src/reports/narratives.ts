import type { DateLine, MetricSeries } from "@situ/reports-ui";

import type { ProjectReportExperimentSnapshot } from "./types.js";
import type { SnapshotDerivedModel } from "./mdx/snapshot-to-props.js";

export function composeLedeParagraph(input: { readonly model: SnapshotDerivedModel }): string {
  const project = input.model.snapshot.project;
  const counts = input.model.counts;
  const primary = input.model.primaryMetric;
  const deltaSentence = composeDeltaSentence({ primary });

  const candidatePhrase =
    counts.experiments === 0
      ? "No candidate experiments have been recorded yet."
      : `${pluralize({ count: counts.experiments, singular: "candidate experiment", plural: "candidate experiments" })} across ${pluralize({ count: counts.tasks, singular: "task", plural: "tasks" })}.`;
  const measurementPhrase =
    counts.measurements === 0
      ? ""
      : ` ${pluralize({ count: counts.measurements, singular: "measurement", plural: "measurements" })} from ${pluralize({ count: input.model.actors.length, singular: "distinct actor", plural: "distinct actors" })}.`;
  const headline = primary === undefined ? "No primary metric to track yet." : deltaSentence;

  return `A live record of "${project.name}" autoresearch. ${candidatePhrase}${measurementPhrase} ${headline}`;
}

function composeDeltaSentence(input: { readonly primary: MetricSeries | undefined }): string {
  if (input.primary === undefined) {
    return "";
  }
  const direction = input.primary.direction === "higher" ? "higher is better" : "lower is better";
  if (input.primary.baselineValue === undefined || input.primary.bestValue === undefined) {
    return `Tracking ${input.primary.metricName} (${direction}).`;
  }
  const delta =
    input.primary.direction === "higher"
      ? input.primary.bestValue - input.primary.baselineValue
      : input.primary.baselineValue - input.primary.bestValue;
  const arrow = delta > 0 ? "improved" : delta < 0 ? "regressed" : "held";
  const unit = input.primary.unit ?? "";
  return `${input.primary.metricName} ${arrow} from ${formatNumber(input.primary.baselineValue)}${unit ? ` ${unit}` : ""} at baseline to ${formatNumber(input.primary.bestValue)}${unit ? ` ${unit}` : ""} at best (${direction}).`;
}

export function composeDateline(input: {
  readonly model: SnapshotDerivedModel;
  readonly generatedAt?: string;
}): DateLine {
  const project = input.model.snapshot.project;
  return {
    openedAt: project.metadata.createdAt,
    openedAtLabel: formatHumanDate(project.metadata.createdAt),
    openedBy: actorLabel(project.createdBy),
    generatedAt: input.generatedAt,
    generatedAtLabel:
      input.generatedAt === undefined ? undefined : formatHumanDate(input.generatedAt),
  };
}

export function composeHeadlineSummary(input: { readonly model: SnapshotDerivedModel }): {
  readonly value: string;
  readonly detail: string;
} {
  const primary = input.model.primaryMetric;
  if (primary === undefined || primary.bestValue === undefined) {
    return {
      value: "No comparable metric yet",
      detail: "Record measurements to populate the headline.",
    };
  }
  const valueLabel = `${primary.metricName} ${formatMeasurementValue(primary.bestValue, primary.unit)}`;
  if (primary.baselineValue === undefined) {
    return { value: valueLabel, detail: "No baseline value recorded for delta." };
  }
  const delta =
    primary.direction === "higher"
      ? primary.bestValue - primary.baselineValue
      : primary.baselineValue - primary.bestValue;
  const direction = primary.direction === "higher" ? "higher is better" : "lower is better";
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "±";
  return {
    value: valueLabel,
    detail: `${arrow} ${formatNumber(Math.abs(delta))} vs. baseline (${direction})`,
  };
}

export function composeRunTime(input: { readonly model: SnapshotDerivedModel }): {
  readonly range: string;
  readonly duration: string;
} {
  const startMs = input.model.swimlaneStartMs;
  const endMs = input.model.swimlaneEndMs;
  const durationMs = endMs - startMs;
  if (durationMs <= 0) {
    return { range: "—", duration: "No timestamped activity yet." };
  }
  return {
    range: `${formatHumanDate(new Date(startMs).toISOString())} → ${formatHumanDate(new Date(endMs).toISOString())}`,
    duration: humanizeDuration(durationMs),
  };
}

export function composeProgressCaption(input: {
  readonly model: SnapshotDerivedModel;
  readonly primary: MetricSeries;
  readonly figureNumber: number;
}): string {
  const direction = input.primary.direction === "higher" ? "higher is better" : "lower is better";
  const unit = input.primary.unit === undefined ? "" : ` (${input.primary.unit})`;
  const total = input.model.counts.experiments;
  const measured = input.model.counts.measured;
  const kept = countKeptImprovements({ primary: input.primary });
  return `${input.primary.metricName}${unit} over experiment ordinal (${direction}). ${total} experiments, ${measured} measured, ${kept} kept improvements. Baseline marked at ordinal 0.`;
}

function countKeptImprovements(input: { readonly primary: MetricSeries }): number {
  const onlyExperiment = input.primary.points.filter((point) => point.origin === "experiment");
  const sorted = [...onlyExperiment];
  sorted.sort((left, right) => {
    if (left.experimentOrdinal !== right.experimentOrdinal) {
      return left.experimentOrdinal - right.experimentOrdinal;
    }
    return 0;
  });
  let best = input.primary.baselineValue ?? sorted[0]?.value ?? 0;
  let kept = 0;
  for (const point of sorted) {
    const improved = input.primary.direction === "higher" ? point.value > best : point.value < best;
    if (improved) {
      kept += 1;
      best = point.value;
    }
  }
  return kept;
}

export function composeAbstractParagraphs(input: {
  readonly model: SnapshotDerivedModel;
}): readonly string[] {
  const synthesisExperiment = pickSynthesisExperiment({
    experiments: input.model.experiments,
  });

  const opening = composeOpeningSentence({ model: input.model });
  const exploration = composeExplorationSentence({ model: input.model });
  const synthesis = composeSynthesisSentence({ model: input.model, synthesisExperiment });
  const safety = composeSafetySentence();
  const takeaway = composeTakeawaySentence({ model: input.model });

  const paragraphs: string[] = [];
  paragraphs.push([opening, exploration].filter(Boolean).join(" "));
  if (synthesis !== "") {
    paragraphs.push(synthesis);
  }
  paragraphs.push([safety, takeaway].filter(Boolean).join(" "));
  return paragraphs;
}

function composeOpeningSentence(input: { readonly model: SnapshotDerivedModel }): string {
  const project = input.model.snapshot.project;
  const baseline = input.model.snapshot.baselines[0];
  const baselineSentence =
    baseline === undefined
      ? "no baseline yet"
      : `against the "${baseline.baseline.title}" baseline`;
  return `This report covers "${project.name}", an autoresearch run on the situ-tracked repository at \`${project.repositoryPath}\`, measured ${baselineSentence}.`;
}

function composeExplorationSentence(input: { readonly model: SnapshotDerivedModel }): string {
  const counts = input.model.counts;
  if (counts.experiments === 0) {
    return "No candidate experiments have been recorded yet.";
  }
  return `The manager fanned out into ${pluralize({ count: counts.experiments, singular: "candidate experiment", plural: "candidate experiments" })} across ${pluralize({ count: counts.tasks, singular: "task", plural: "tasks" })}, recording ${pluralize({ count: counts.measurements, singular: "measurement", plural: "measurements" })} from ${pluralize({ count: input.model.actors.length, singular: "distinct actor", plural: "distinct actors" })}.`;
}

function composeSynthesisSentence(input: {
  readonly model: SnapshotDerivedModel;
  readonly synthesisExperiment: ProjectReportExperimentSnapshot | undefined;
}): string {
  if (input.synthesisExperiment === undefined) {
    return "";
  }
  const cherryCount = input.model.lineageEdges.filter((edge) => edge.kind === "cherry-pick").length;
  if (cherryCount === 0) {
    return `A follow-up "${input.synthesisExperiment.experiment.title}" branch was opened from a chosen candidate base; no cherry-pick attributions were detected in the visible records.`;
  }
  return `The "${input.synthesisExperiment.experiment.title}" branch was opened from a chosen candidate base and cherry-picked ${pluralize({ count: cherryCount, singular: "commit", plural: "commits" })} from sibling branches.`;
}

function composeSafetySentence(): string {
  return `Every record in this report comes from visible situ state; git, harness output, and protected-file diffs live alongside this report in the run output.`;
}

function composeTakeawaySentence(input: { readonly model: SnapshotDerivedModel }): string {
  const primary = input.model.primaryMetric;
  if (
    primary === undefined ||
    primary.baselineValue === undefined ||
    primary.bestValue === undefined
  ) {
    return "Headline metric is not yet comparable to a baseline.";
  }
  const delta =
    primary.direction === "higher"
      ? primary.bestValue - primary.baselineValue
      : primary.baselineValue - primary.bestValue;
  const direction = primary.direction === "higher" ? "above" : "below";
  const sign = delta >= 0 ? "improved" : "regressed";
  const unit = primary.unit === undefined ? "" : ` ${primary.unit}`;
  return `Headline: ${primary.metricName} ${sign} by ${formatNumber(Math.abs(delta))}${unit} ${direction} baseline (best ${formatNumber(primary.bestValue)}${unit}).`;
}

export function composeProgressNarrative(input: { readonly model: SnapshotDerivedModel }): string {
  const primary = input.model.primaryMetric;
  if (primary === undefined) {
    return "Progress is not yet plottable. Once experiments record measurements that share a name with the baseline, the flagship figure becomes meaningful and this section narrates the trajectory.";
  }
  const total = input.model.counts.experiments;
  const kept = countKeptImprovements({ primary });
  const direction = primary.direction === "higher" ? "higher is better" : "lower is better";
  const baselinePart =
    primary.baselineValue === undefined
      ? ""
      : ` Baseline ${primary.metricName} sits at ${formatNumber(primary.baselineValue)}${primary.unit ? ` ${primary.unit}` : ""}.`;
  const bestPart =
    primary.bestValue === undefined
      ? ""
      : ` Best recorded value is ${formatNumber(primary.bestValue)}${primary.unit ? ` ${primary.unit}` : ""}.`;
  return `Across ${total} experiments, ${kept} produced a new running best on ${primary.metricName} (${direction}). All experiment measurements appear on Figure 1; the stepped line is the running best.${baselinePart}${bestPart}`;
}

export function composeLineageNarrative(input: { readonly model: SnapshotDerivedModel }): string {
  const nodes = input.model.lineageNodes;
  if (nodes.length <= 1) {
    return "No branch lineage has been recorded yet. Once experiments record a branch and an optional follow-up cherry-picks commits with `git cherry-pick -x`, the diagram below reflects that lineage.";
  }
  const candidates = nodes.filter((node) => node.kind === "candidate").length;
  const synthesis = nodes.find((node) => node.kind === "synthesis");
  const cherry = input.model.lineageEdges.filter((edge) => edge.kind === "cherry-pick").length;
  if (synthesis === undefined) {
    return `${candidates} candidate branches recorded under the initial commit. No synthesis branch has been opened yet.`;
  }
  return `${candidates} candidate branches were explored under the initial commit. A follow-up synthesis branch ${synthesis.label} branched from one of the candidates and cherry-picked ${pluralize({ count: cherry, singular: "commit", plural: "commits" })} back from sibling branches.`;
}

export function composeParallelismNarrative(input: {
  readonly model: SnapshotDerivedModel;
}): string {
  const rows = input.model.swimlaneRows.length;
  if (rows <= 1) {
    return "Only one actor has visible records so far; the swimlane figure becomes meaningful once distinct actors record activity.";
  }
  return `${rows} actors recorded visible activity. The swimlanes below show each actor's marks placed in time on a normalized axis from the first to the last recorded event.`;
}

export function composeLineageCaption(): string {
  return "Candidate branches and follow-up synthesis. Solid edges show parent branches; dashed edges show `git cherry-pick -x` commits attributed back to a source candidate.";
}

export function composeParallelismCaption(): string {
  return "Actor swimlanes across the run. Each row is one actor; each mark is a visible record event (creation, assignment, measurement, or review).";
}

export function composeSecondaryCaption(): string {
  return "Secondary numeric metrics over experiment ordinal. Baseline shown as a dotted line; improvement direction inferred from metric name.";
}

function pickSynthesisExperiment(input: {
  readonly experiments: readonly ProjectReportExperimentSnapshot[];
}): ProjectReportExperimentSnapshot | undefined {
  const followUps = input.experiments.filter(
    (experimentSnapshot) => experimentSnapshot.experiment.baseRef !== undefined,
  );
  const named = followUps.find((experimentSnapshot) => {
    const haystack = [
      experimentSnapshot.experiment.title,
      experimentSnapshot.experiment.branchName ?? "",
      experimentSnapshot.experiment.id,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes("synthesis") || haystack.includes("combined");
  });
  return named;
}

function pluralize(input: {
  readonly count: number;
  readonly singular: string;
  readonly plural: string;
}): string {
  return `${input.count} ${input.count === 1 ? input.singular : input.plural}`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  const absolute = Math.abs(value);
  if (absolute >= 1000) {
    return trimTrailingZeros(value.toFixed(1));
  }
  if (absolute >= 1) {
    return trimTrailingZeros(value.toFixed(3));
  }
  return trimTrailingZeros(value.toPrecision(4));
}

function trimTrailingZeros(value: string): string {
  return value.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

function formatMeasurementValue(value: number, unit: string | undefined): string {
  const formatted = formatNumber(value);
  return unit === undefined ? formatted : `${formatted} ${unit}`;
}

function formatHumanDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) {
    return iso;
  }
  const date = new Date(parsed);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const month = months[date.getUTCMonth()] ?? "—";
  return `${month} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function humanizeDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours} h` : `${hours} h ${remaining} min`;
}

export function actorLabel(actor: {
  actorKind: string;
  actorId: string;
  displayName?: string;
}): string {
  if (actor.displayName !== undefined && actor.displayName.length > 0) {
    return actor.displayName;
  }
  return `${actor.actorKind}/${actor.actorId}`;
}
