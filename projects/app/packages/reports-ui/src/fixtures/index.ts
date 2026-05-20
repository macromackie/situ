import type {
  ActorLabel,
  ContentsItem,
  LineageEdge,
  LineageNode,
  MetricSeries,
  OutcomeRow,
  SwimlaneRow,
} from "../types.js";

export const emptyMetricSeries: MetricSeries = {
  metricName: "dev_accuracy",
  unit: undefined,
  direction: "higher",
  points: [],
  baselineValue: undefined,
  bestValue: undefined,
};

export const populatedMetricSeries: MetricSeries = {
  metricName: "dev_accuracy",
  unit: undefined,
  direction: "higher",
  baselineValue: 0.6314,
  bestValue: 0.6814,
  points: [
    { experimentOrdinal: 0, value: 0.6314, origin: "baseline" },
    {
      experimentOrdinal: 1,
      value: 0.6502,
      origin: "experiment",
      experimentId: "experiment_case",
      experimentTitle: "Case and accent folding",
    },
    {
      experimentOrdinal: 1,
      value: 0.6651,
      origin: "experiment",
      experimentId: "experiment_case",
      experimentTitle: "Case and accent folding",
    },
    {
      experimentOrdinal: 1,
      value: 0.6701,
      origin: "experiment",
      experimentId: "experiment_case",
      experimentTitle: "Case and accent folding",
    },
    {
      experimentOrdinal: 2,
      value: 0.6402,
      origin: "experiment",
      experimentId: "experiment_punct",
      experimentTitle: "Punctuation pass",
    },
    {
      experimentOrdinal: 2,
      value: 0.6469,
      origin: "experiment",
      experimentId: "experiment_punct",
      experimentTitle: "Punctuation pass",
    },
    {
      experimentOrdinal: 3,
      value: 0.6358,
      origin: "experiment",
      experimentId: "experiment_numbers",
      experimentTitle: "Number normalization",
    },
    {
      experimentOrdinal: 3,
      value: 0.6403,
      origin: "experiment",
      experimentId: "experiment_numbers",
      experimentTitle: "Number normalization",
    },
    {
      experimentOrdinal: 4,
      value: 0.6261,
      origin: "experiment",
      experimentId: "experiment_whitespace",
      experimentTitle: "Whitespace collapse",
    },
    {
      experimentOrdinal: 4,
      value: 0.6299,
      origin: "experiment",
      experimentId: "experiment_whitespace",
      experimentTitle: "Whitespace collapse",
    },
    {
      experimentOrdinal: 5,
      value: 0.6814,
      origin: "experiment",
      experimentId: "experiment_synthesis",
      experimentTitle: "Synthesis: combined",
    },
  ],
};

export const emptyLineageNodes: readonly LineageNode[] = [];
export const emptyLineageEdges: readonly LineageEdge[] = [];

export const populatedLineageNodes: readonly LineageNode[] = [
  { id: "node-initial", kind: "initial", label: "0a1b2c3", subLabel: "baseline state" },
  {
    id: "node-experiment_case",
    kind: "candidate",
    label: "candidate/case-normalize",
    subLabel: "Case and accent folding",
    status: "accepted",
    actor: "scientist-1",
    delta: "+0.0387",
  },
  {
    id: "node-experiment_punct",
    kind: "candidate",
    label: "candidate/punct-normalize",
    subLabel: "Punctuation pass",
    status: "accepted",
    actor: "scientist-2",
    delta: "+0.0155",
  },
  {
    id: "node-experiment_numbers",
    kind: "candidate",
    label: "candidate/number-normalize",
    subLabel: "Number normalization",
    status: "ready_for_review",
    actor: "scientist-3",
    delta: "+0.0089",
  },
  {
    id: "node-experiment_whitespace",
    kind: "candidate",
    label: "candidate/whitespace-collapse",
    subLabel: "Whitespace collapse",
    status: "rejected",
    actor: "scientist-4",
    delta: "−0.0015",
  },
  {
    id: "node-experiment_synthesis",
    kind: "synthesis",
    label: "synthesis/normalize-combined",
    subLabel: "Synthesis: case + punctuation + numbers",
    status: "ready_for_review",
    actor: "Root manager",
    delta: "+0.05",
  },
];

export const populatedLineageEdges: readonly LineageEdge[] = [
  { fromId: "node-initial", toId: "node-experiment_case", kind: "parent" },
  { fromId: "node-initial", toId: "node-experiment_punct", kind: "parent" },
  { fromId: "node-initial", toId: "node-experiment_numbers", kind: "parent" },
  { fromId: "node-initial", toId: "node-experiment_whitespace", kind: "parent" },
  {
    fromId: "node-experiment_case",
    toId: "node-experiment_synthesis",
    kind: "parent",
    label: "branch",
  },
  {
    fromId: "node-experiment_punct",
    toId: "node-experiment_synthesis",
    kind: "cherry-pick",
    label: "4a2b9d1",
  },
  {
    fromId: "node-experiment_numbers",
    toId: "node-experiment_synthesis",
    kind: "cherry-pick",
    label: "9c8d7e6",
  },
];

export const baseTimeMs = Date.UTC(2026, 4, 15, 9, 0, 0);
export const populatedSwimlaneRows: readonly SwimlaneRow[] = [
  {
    actor: "Scott Mackie",
    marks: [
      { atMs: baseTimeMs + 0, kind: "creation", detail: "Started project" },
      { atMs: baseTimeMs + 600_000, kind: "review", detail: "Reviewed candidate" },
      { atMs: baseTimeMs + 900_000, kind: "review", detail: "Reviewed synthesis" },
    ],
  },
  {
    actor: "Root manager",
    marks: [
      { atMs: baseTimeMs + 60_000, kind: "creation", detail: "Created baseline" },
      { atMs: baseTimeMs + 120_000, kind: "measurement", detail: "Measured baseline" },
      { atMs: baseTimeMs + 240_000, kind: "creation", detail: "Created task" },
      { atMs: baseTimeMs + 660_000, kind: "creation", detail: "Created synthesis" },
    ],
  },
  {
    actor: "scientist-1",
    marks: [
      { atMs: baseTimeMs + 240_000, kind: "assignment", detail: "Assigned" },
      { atMs: baseTimeMs + 300_000, kind: "measurement", detail: "Recorded" },
    ],
  },
  {
    actor: "verifier-1",
    marks: [
      { atMs: baseTimeMs + 300_000, kind: "measurement", detail: "Measured" },
      { atMs: baseTimeMs + 420_000, kind: "measurement", detail: "Measured" },
      { atMs: baseTimeMs + 840_000, kind: "measurement", detail: "Measured synthesis" },
    ],
  },
];

export const populatedSwimlaneRange = {
  startMs: baseTimeMs,
  endMs: baseTimeMs + 900_000,
};

export const populatedOutcomeRows: readonly OutcomeRow[] = [
  {
    experimentId: "experiment_case",
    experimentTitle: "Case and accent folding",
    taskTitle: "Case and accent folding",
    status: "accepted",
    actor: "scientist-1",
    branchName: "candidate/case-normalize",
    bestValue: 0.6701,
    deltaVsBaseline: 0.0387,
  },
  {
    experimentId: "experiment_punct",
    experimentTitle: "Punctuation and separator pass",
    taskTitle: "Punctuation pass",
    status: "accepted",
    actor: "scientist-2",
    branchName: "candidate/punct-normalize",
    bestValue: 0.6469,
    deltaVsBaseline: 0.0155,
  },
  {
    experimentId: "experiment_numbers",
    experimentTitle: "Number formatting normalization",
    taskTitle: "Number normalization",
    status: "ready_for_review",
    actor: "scientist-3",
    branchName: "candidate/number-normalize",
    bestValue: 0.6403,
    deltaVsBaseline: 0.0089,
  },
  {
    experimentId: "experiment_whitespace",
    experimentTitle: "Whitespace collapse",
    taskTitle: "Whitespace collapse",
    status: "rejected",
    actor: "scientist-4",
    branchName: "candidate/whitespace-collapse",
    bestValue: 0.6299,
    deltaVsBaseline: -0.0015,
  },
  {
    experimentId: "experiment_synthesis",
    experimentTitle: "Synthesis: case + punctuation + numbers",
    taskTitle: "Synthesis: combined",
    status: "ready_for_review",
    actor: "Root manager",
    branchName: "synthesis/normalize-combined",
    bestValue: 0.6814,
    deltaVsBaseline: 0.05,
  },
];

export const populatedActors: readonly ActorLabel[] = [
  { displayName: "Scott Mackie", role: "principal" },
  { displayName: "Root manager", role: "baseline" },
  { displayName: "scientist-1", role: "experiment" },
  { displayName: "scientist-2", role: "experiment" },
  { displayName: "scientist-3", role: "experiment" },
  { displayName: "scientist-4", role: "experiment" },
  { displayName: "verifier-1", role: "measurement" },
];

export const populatedContents: readonly ContentsItem[] = [
  { id: "abstract", label: "Abstract" },
  { id: "goal", label: "Goal and method" },
  { id: "progress", label: "Progress" },
  { id: "lineage", label: "Branch lineage" },
  { id: "parallelism", label: "Parallel work" },
  { id: "outcomes", label: "Experiment outcomes" },
  { id: "evidence", label: "Evidence" },
  { id: "appendix", label: "Appendix" },
];
