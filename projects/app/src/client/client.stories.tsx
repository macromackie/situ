import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react";

import type { ArtifactRecord } from "@situ/artifacts";
import type { BaselineRecord } from "@situ/baselines";
import type { BriefingBlock, BriefingRecord } from "@situ/briefings";
import type { CommentRecord } from "@situ/comments";
import type { ActorRef, SituId, SyncMetadata, TargetRef } from "@situ/common";
import type { EventRecord } from "@situ/events";
import type { ExperimentRecord } from "@situ/experiments";
import type {
  LiveFocusRecord,
  LiveMapEdgeRecord,
  LiveMapNodeKind,
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
  ActivityTimeline,
  BriefingPanel,
  ProjectIndexSurface,
  ProjectOverviewSurface,
  StatusStrip,
  StyleRoot,
  VerificationPanel,
} from "./main.js";
import {
  buildProjectIndexModel,
  buildProjectOverviewModel,
  type ProjectOverviewModel,
  type ClientRecords,
} from "./model.js";

type ProjectModel = Extract<ProjectOverviewModel, { readonly kind: "project" }>;
type StoryFrameProps = {
  readonly children: ReactNode;
  readonly width?: "paper" | "compact";
};

const meta: Meta<typeof ProjectOverviewSurface> = {
  title: "Client/Project Overview",
  component: ProjectOverviewSurface,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof ProjectOverviewSurface>;

export const AutoresearchRun: Story = {
  render: () => <ProjectOverviewSurface model={autoresearchModel} synced />,
};

export const AutoresearchProgress: Story = {
  render: () => <ProjectOverviewSurface model={autoresearchProgressModel} synced />,
};

export const OnTrackRun: Story = {
  render: () => <ProjectOverviewSurface model={onTrackModel} synced />,
};

export const WatchRun: Story = {
  render: () => <ProjectOverviewSurface model={watchModel} synced />,
};

export const BlockedRun: Story = {
  render: () => <ProjectOverviewSurface model={blockedModel} synced />,
};

export const CompleteRun: Story = {
  render: () => <ProjectOverviewSurface model={completeModel} synced />,
};

export const NoBriefingYet: Story = {
  render: () => <ProjectOverviewSurface model={noBriefingModel} synced />,
};

export const NoRunMapYet: Story = {
  render: () => <ProjectOverviewSurface model={noRunMapModel} synced />,
};

export const EmptyState: Story = {
  render: () => <ProjectOverviewSurface model={emptyModel} synced={false} />,
};

export const ProjectIndex: Story = {
  render: () => <ProjectIndexSurface model={projectIndexModel} synced />,
};

export const BriefingAssessmentVariants: Story = {
  render: () => (
    <StoryFrame>
      <div className="story-grid">
        {[onTrackModel, watchModel, blockedModel, completeModel].map((model) => (
          <BriefingPanel key={model.latestBriefing?.id ?? model.project.id} model={model} />
        ))}
      </div>
    </StoryFrame>
  ),
};

export const StatusVariants: Story = {
  render: () => (
    <StoryFrame>
      <div className="story-stack">
        {[onTrackModel, watchModel, blockedModel, completeModel].map((model) => (
          <section key={`status:${model.project.id}:${model.status.label}`}>
            <h3 className="story-heading">{model.status.label}</h3>
            <StatusStrip model={model} />
            <VerificationPanel model={model} />
          </section>
        ))}
      </div>
    </StoryFrame>
  ),
};

export const ActivityVariants: Story = {
  render: () => (
    <StoryFrame width="compact">
      <ActivityTimeline items={blockedModel.activity} />
    </StoryFrame>
  ),
};

export const ProgressiveSwap: Story = {
  render: () => <ProgressiveSwapStory />,
};

function ProgressiveSwapStory() {
  const [briefingId, setBriefingId] = useState<(typeof progressiveBriefings)[number]["id"]>(
    "briefing_story_orienting",
  );
  const model = modelWithBriefing(
    progressiveBriefings.find((candidate) => candidate.id === briefingId),
  );

  return (
    <StoryFrame>
      <div className="story-controls">
        {progressiveBriefings.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            className={
              candidate.id === briefingId ? "story-button story-button-active" : "story-button"
            }
            onClick={() => setBriefingId(candidate.id)}
          >
            {candidate.stage}
          </button>
        ))}
      </div>
      <BriefingPanel model={model} />
    </StoryFrame>
  );
}

function StoryFrame(props: StoryFrameProps) {
  return (
    <div className="live-shell">
      <StyleRoot />
      <main
        className={
          props.width === "compact" ? "paper live-paper story-compact" : "paper live-paper"
        }
      >
        <style dangerouslySetInnerHTML={{ __html: storyCss }} />
        {props.children}
      </main>
    </div>
  );
}

const storyCss = `
.story-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.story-stack {
  display: grid;
  gap: 48px;
}

.story-heading {
  margin: 0 0 12px;
  font-family: var(--sans);
  font-size: 18px;
  letter-spacing: 0;
}

.story-compact {
  max-width: 860px;
}

.story-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
  font-family: var(--sans);
}

.story-button {
  border: 1px solid var(--rule);
  border-radius: 999px;
  background: white;
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 8px 10px;
}

.story-button-active {
  border-color: var(--accent);
  color: var(--accent);
}

@media (max-width: 760px) {
  .story-grid {
    grid-template-columns: 1fr;
  }
}
`;

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

const verifier: ActorRef = {
  actorKind: "local_agent",
  actorId: "verifier",
  displayName: "Verifier",
};

const projectId = "project_live_story" as SituId<"project">;
const taskId = "task_story_accuracy" as SituId<"task">;
const baselineId = "baseline_story_native" as SituId<"baseline">;
const experimentId = "experiment_story_parser" as SituId<"experiment">;
const alternateExperimentId = "experiment_story_ranker" as SituId<"experiment">;
const measurementId = "measurement_story_parser_accuracy" as SituId<"measurement">;

const baseBriefingBlocks: readonly BriefingBlock[] = [
  {
    type: "status",
    summaryMarkdown:
      "The run is producing useful signal. The parser experiment is ahead of baseline and the remaining work is concentrated in verification.",
    reasons: [
      "Primary metric moved from 0.62 to 0.71.",
      "The newest artifact captures the failing edge-case trace.",
    ],
    refs: [target("experiment", experimentId), target("measurement", measurementId)],
  },
  {
    type: "callout",
    tone: "finding",
    bodyMarkdown:
      "The simple parser repair is outperforming the larger ranking change, so the next review should focus on whether it generalizes.",
    refs: [target("experiment", experimentId)],
  },
  {
    type: "progress",
    metricName: "dev_accuracy",
  },
  {
    type: "outcomes",
    experimentIds: [experimentId, alternateExperimentId],
  },
  {
    type: "evidence",
    experimentIds: [experimentId],
  },
  {
    type: "recent_update",
    bodyMarkdown:
      "Verifier found one suspicious token-boundary case. The implementation still looks promising, but it needs one targeted check before finalizing.",
    refs: [target("review", "review_story_changes" as SituId<"review">)],
  },
  {
    type: "next_steps",
    items: [
      {
        text: "Run the fixture focused on punctuation-heavy inputs.",
        refs: [target("experiment", experimentId)],
      },
      {
        text: "Accept the parser repair if the targeted verifier check passes.",
        refs: [target("measurement", measurementId)],
      },
    ],
  },
];

const progressiveBriefings = [
  briefing({
    id: "briefing_story_orienting" as SituId<"briefing">,
    title: "Orienting on the baseline",
    stage: "orienting",
    assessment: "on_track",
    headlineMarkdown:
      "The run is establishing a clean baseline and identifying the first high-leverage parser failure.",
    blocks: [
      {
        type: "status",
        summaryMarkdown: "Baseline evidence is present. No blocking risk has appeared yet.",
      },
    ],
    createdAt: "2026-05-20T16:00:00.000Z",
  }),
  briefing({
    id: "briefing_story_evaluating" as SituId<"briefing">,
    title: "Evaluating the strongest branch",
    stage: "evaluating",
    assessment: "watch",
    headlineMarkdown:
      "The parser branch is ahead, but verifier found a token-boundary case that needs one targeted check.",
    blocks: baseBriefingBlocks,
    createdAt: "2026-05-20T16:06:00.000Z",
  }),
  briefing({
    id: "briefing_story_finalizing" as SituId<"briefing">,
    title: "Ready to finalize",
    stage: "finalizing",
    assessment: "complete",
    headlineMarkdown:
      "The targeted verifier check passed, and the report can now collapse the run into final findings.",
    blocks: [
      {
        type: "callout",
        tone: "finding",
        bodyMarkdown:
          "The accepted branch is small, measured, reviewed, and has enough artifact evidence for final synthesis.",
      },
      {
        type: "outcomes",
        experimentIds: [experimentId, alternateExperimentId],
      },
    ],
    createdAt: "2026-05-20T16:14:00.000Z",
  }),
] as const;

const onTrackModel = modelWithBriefing(
  briefing({
    id: "briefing_story_on_track" as SituId<"briefing">,
    title: "Promising branch under evaluation",
    stage: "evaluating",
    assessment: "on_track",
    headlineMarkdown:
      "The run is going well: the leading branch improves the primary metric and has clear verifier work queued.",
    blocks: baseBriefingBlocks,
    createdAt: "2026-05-20T16:06:00.000Z",
  }),
);

const watchModel = modelWithBriefing(
  briefing({
    id: "briefing_story_watch" as SituId<"briefing">,
    title: "Verifier is holding the run",
    stage: "evaluating",
    assessment: "watch",
    headlineMarkdown:
      "The run is still viable, but the current candidate should not be accepted until the token-boundary issue is resolved.",
    blocks: [
      {
        type: "callout",
        tone: "warning",
        bodyMarkdown:
          "One review requested changes. This is a narrow risk, not a failed run, but it should stay visible.",
        refs: [target("review", "review_story_changes" as SituId<"review">)],
      },
      ...baseBriefingBlocks,
    ],
    createdAt: "2026-05-20T16:07:00.000Z",
  }),
  {
    taskStatus: "in_review",
    experimentStatus: "ready_for_review",
    reviewDecision: "changes_requested",
  },
);

const blockedModel = modelWithBriefing(
  briefing({
    id: "briefing_story_blocked" as SituId<"briefing">,
    title: "Blocked on missing fixture output",
    stage: "blocked",
    assessment: "blocked",
    headlineMarkdown:
      "The run is blocked because the verifier artifact did not materialize; the next useful action is recovering that output.",
    blocks: [
      {
        type: "callout",
        tone: "warning",
        bodyMarkdown:
          "No final conclusion should be drawn until the missing verifier output is restored or rerun.",
        refs: [target("notification", "notification_story_attention" as SituId<"notification">)],
      },
      {
        type: "next_steps",
        items: [
          {
            text: "Re-run the verifier command and capture the artifact.",
            refs: [target("experiment", experimentId)],
          },
          {
            text: "Replace this briefing once the artifact exists.",
            refs: [target("project", projectId)],
          },
        ],
      },
    ],
    createdAt: "2026-05-20T16:08:00.000Z",
  }),
  {
    includeUnreadNotification: true,
    taskStatus: "in_progress",
    experimentStatus: "running",
    includeReport: false,
  },
);

const completeModel = modelWithBriefing(
  briefing({
    id: "briefing_story_complete" as SituId<"briefing">,
    title: "Final report is ready",
    stage: "complete",
    assessment: "complete",
    headlineMarkdown:
      "The run has enough evidence to close: the accepted branch is reviewed, measured, and summarized in the final report.",
    blocks: [
      {
        type: "callout",
        tone: "finding",
        bodyMarkdown:
          "The smallest successful change won. The final report can focus on why that branch generalized better than the larger rewrite.",
      },
      {
        type: "progress",
        metricName: "dev_accuracy",
      },
      {
        type: "outcomes",
        experimentIds: [experimentId, alternateExperimentId],
      },
    ],
    createdAt: "2026-05-20T16:12:00.000Z",
  }),
  {
    taskStatus: "done",
    experimentStatus: "accepted",
    alternateExperimentStatus: "rejected",
    reviewDecision: "approved",
  },
);

const noBriefingModel = modelWithBriefing(undefined, {
  includeBriefing: false,
});

const noRunMapModel = modelWithBriefing(
  briefing({
    id: "briefing_story_no_live_map" as SituId<"briefing">,
    title: "Briefing without map records",
    stage: "evaluating",
    assessment: "watch",
    headlineMarkdown: "The briefing is available, but the agent has not published a run map yet.",
    blocks: [
      {
        type: "status",
        summaryMarkdown:
          "This is the fallback state for runs that have briefings and signals before map records exist.",
      },
    ],
    createdAt: "2026-05-20T16:09:00.000Z",
  }),
  {
    includeRunMap: false,
  },
);

const emptyModel = buildProjectOverviewModel({
  records: emptyRecords(),
});

const projectIndexModel = buildProjectIndexModel({
  records: {
    ...emptyRecords(),
    projects: [
      projectRecord(),
      projectRecord({
        id: "project_story_ranker" as SituId<"project">,
        name: "Ranker evaluation",
        repositoryPath: "/Users/scott/situ/workspaces/ranker-eval",
        createdAt: "2026-05-19T15:00:00.000Z",
      }),
      projectRecord({
        id: "project_story_archive" as SituId<"project">,
        name: "Archived parser pass",
        repositoryPath: "/Users/scott/situ/workspaces/parser-archive",
        status: "archived",
        createdAt: "2026-05-18T12:00:00.000Z",
      }),
    ],
  },
});

// ── Autoresearch story ────────────────────────────────────────────────────────

type ArNodeSpec = {
  readonly key: string;
  readonly kind: LiveMapNodeKind;
  readonly title: string;
  readonly tone: LiveTone;
  readonly metric?: number;
};

const arSpecs: readonly ArNodeSpec[] = [
  { key: "ar_0", kind: "baseline", title: "Baseline", tone: "good", metric: 0.62 },
  { key: "ar_1", kind: "branch", title: "Augment punctuation", tone: "done", metric: 0.598 },
  { key: "ar_2", kind: "branch", title: "Remove layer norm", tone: "done", metric: 0.611 },
  { key: "ar_3", kind: "branch", title: "Add position bias", tone: "done", metric: 0.615 },
  { key: "ar_4", kind: "branch", title: "Reduce dropout", tone: "good", metric: 0.648 },
  { key: "ar_5", kind: "branch", title: "Increase dropout", tone: "done", metric: 0.632 },
  { key: "ar_6", kind: "branch", title: "Weight decay sweep", tone: "done", metric: 0.64 },
  { key: "ar_7", kind: "branch", title: "Gradient clip 0.5", tone: "done", metric: 0.638 },
  { key: "ar_8", kind: "branch", title: "Token sliding window", tone: "good", metric: 0.673 },
  { key: "ar_9", kind: "branch", title: "Linear warmup ×5", tone: "done", metric: 0.655 },
  { key: "ar_10", kind: "branch", title: "Label smoothing 0.1", tone: "done", metric: 0.661 },
  { key: "ar_11", kind: "branch", title: "Random seed 137", tone: "done", metric: 0.667 },
  { key: "ar_12", kind: "branch", title: "Context window 2k", tone: "good", metric: 0.698 },
  { key: "ar_13", kind: "branch", title: "Larger batch ×4", tone: "done", metric: 0.68 },
  { key: "ar_14", kind: "branch", title: "Adam ε 1e-6", tone: "done", metric: 0.688 },
  { key: "ar_15", kind: "branch", title: "Frozen encoder", tone: "done", metric: 0.692 },
  { key: "ar_16", kind: "branch", title: "Warmup schedule", tone: "good", metric: 0.718 },
  { key: "ar_17", kind: "branch", title: "Head dropout 0.2", tone: "done", metric: 0.702 },
  { key: "ar_18", kind: "branch", title: "Layer drop 0.1", tone: "done", metric: 0.708 },
  { key: "ar_19", kind: "branch", title: "Attention temp ×0.8", tone: "done", metric: 0.711 },
  { key: "ar_20", kind: "branch", title: "Cosine LR decay", tone: "good", metric: 0.742 },
  { key: "ar_21", kind: "branch", title: "Max seq 384", tone: "done", metric: 0.728 },
  { key: "ar_22", kind: "branch", title: "Mixup alpha 0.2", tone: "done", metric: 0.735 },
  { key: "ar_23", kind: "branch", title: "Batch size 64", tone: "good", metric: 0.758 },
  { key: "ar_24", kind: "branch", title: "Rotary position enc", tone: "neutral" },
  { key: "ar_25", kind: "branch", title: "Sparse attention", tone: "watch" },
];

const autoresearchModel = (() => {
  const nodes: LiveMapNodeRecord[] = arSpecs.map((s, i) => ({
    id: `live_node_ar_${i}` as SituId<"live_node">,
    projectId,
    nodeKey: s.key,
    kind: s.kind,
    title: s.title,
    summary: s.metric !== undefined ? `Accuracy: ${s.metric.toFixed(3)}` : "In progress.",
    tone: s.tone,
    refs: [],
    visibility: "visible" as const,
    authoredBy: manager,
    metadata: metadata(`2026-05-20T16:${String(i).padStart(2, "0")}:00.000Z`),
  }));

  const details: LiveNodeDetailRecord[] = arSpecs
    .filter((s) => s.metric !== undefined)
    .map((s, i) => ({
      id: `live_detail_ar_${i}` as SituId<"live_detail">,
      projectId,
      nodeKey: s.key,
      bodyMarkdown: `Accuracy: **${(s.metric ?? 0).toFixed(3)}**`,
      facts: [
        {
          label: "Accuracy",
          value: String(s.metric),
          tone: "neutral" as LiveTone,
          metricName: "dev_accuracy",
          numericValue: s.metric ?? 0,
          unit: "accuracy",
          direction: "higher_is_better",
        },
      ],
      refs: [],
      authoredBy: manager,
      metadata: metadata(`2026-05-20T16:${String(i).padStart(2, "0")}:01.000Z`),
    }));

  const records: ClientRecords = {
    ...emptyRecords(),
    projects: [projectRecord()],
    tasks: [taskRecord({ status: "in_progress" })],
    baselines: [baselineRecord()],
    experiments: [],
    measurements: [],
    reviews: [],
    artifacts: [],
    reports: [],
    briefings: [
      briefing({
        id: "briefing_story_autoresearch" as SituId<"briefing">,
        title: "Autoresearch in progress",
        stage: "evaluating",
        assessment: "on_track",
        headlineMarkdown:
          "26 experiments run. 7 have pushed the accuracy frontier. Current best is **0.758** accuracy — batch size reduction continues to hold the lead.",
        blocks: [
          {
            type: "status",
            summaryMarkdown:
              "The run is in a productive exploration phase. Each frontier improvement has been incremental. Two experiments are still running.",
          },
          {
            type: "callout",
            tone: "finding",
            bodyMarkdown:
              "Cosine LR decay and reduced batch size together account for the largest gains. Architecture changes have so far underperformed.",
          },
          {
            type: "next_steps",
            items: [
              { text: "Evaluate rotary position encoding result when it completes.", refs: [] },
              { text: "Consider combining cosine decay with sliding window context.", refs: [] },
            ],
          },
        ],
        createdAt: "2026-05-20T16:25:00.000Z",
      }),
    ],
    liveSignals: [
      liveSignalRecord({
        id: "live_signal_ar_best" as SituId<"live_signal">,
        slot: "metric",
        label: "Best accuracy",
        value: "0.758",
        summary: "+0.138 over baseline",
        tone: "good",
        createdAt: "2026-05-20T16:25:10.000Z",
      }),
      liveSignalRecord({
        id: "live_signal_ar_count" as SituId<"live_signal">,
        slot: "experiments",
        label: "Experiments",
        value: "24 done · 2 running",
        summary: "7 pushed the frontier.",
        tone: "neutral",
        createdAt: "2026-05-20T16:25:20.000Z",
      }),
      liveSignalRecord({
        id: "live_signal_ar_frontier" as SituId<"live_signal">,
        slot: "frontier",
        label: "Frontier",
        value: "7 improvements",
        summary: "Batch size 64 holds the best result.",
        tone: "good",
        createdAt: "2026-05-20T16:25:30.000Z",
      }),
    ],
    liveMapNodes: nodes,
    liveMapEdges: [],
    liveFocuses: [
      liveFocusRecord({
        id: "live_focus_ar" as SituId<"live_focus">,
        mode: "overview",
        primaryNodeKey: "ar_23",
        relatedNodeKeys: ["ar_20", "ar_16"],
        summary: "Latest frontier: batch size 64",
        createdAt: "2026-05-20T16:25:40.000Z",
      }),
    ],
    liveNodeDetails: details,
    comments: [],
    events: [],
    notifications: [],
  };

  const model = buildProjectOverviewModel({ records, requestedProjectId: projectId });
  if (model.kind !== "project")
    throw new Error("Expected autoresearch story to build a project model.");
  return model;
})();

type ProgressKeep = {
  readonly index: number;
  readonly title: string;
  readonly value: number;
};

const progressKeeps: readonly ProgressKeep[] = [
  { index: 0, title: "baseline", value: 0.9979 },
  { index: 2, title: "halve total batch 524k->262k", value: 0.9907 },
  { index: 6, title: "warmdown 0.5->0.7", value: 0.9896 },
  { index: 8, title: "add 5% warmup", value: 0.9874 },
  { index: 14, title: "depth 9 aspect ratio 57", value: 0.9845 },
  { index: 23, title: "t0 lambda init 0.1->0.05", value: 0.9839 },
  { index: 28, title: "unembedding LR 0.0004->0.008", value: 0.9834 },
  { index: 32, title: "SSSSL window pattern", value: 0.9821 },
  { index: 38, title: "short window 1/4 context", value: 0.9799 },
  { index: 39, title: "short window 1/8 context", value: 0.9796 },
  { index: 43, title: "embedding LR 0.6->0.8", value: 0.9789 },
  { index: 64, title: "RoPE base frequency 10000->5000", value: 0.9783 },
  { index: 65, title: "RoPE base frequency 5000->10000", value: 0.978 },
  { index: 67, title: "RoPE base frequency 100000->200000", value: 0.9777 },
  { index: 74, title: "random seed 42->137", value: 0.9773 },
];

const progressKeepByIndex = new Map(progressKeeps.map((keep) => [keep.index, keep]));

function progressTimestamp(index: number, offsetSeconds = 0): string {
  return new Date(Date.UTC(2026, 4, 20, 17, 0, index + offsetSeconds)).toISOString();
}

function progressDiscardedValue(index: number): number {
  const previousBest =
    [...progressKeeps].reverse().find((keep) => keep.index < index)?.value ??
    progressKeeps[0].value;
  const offset = 0.0008 + ((index * 37) % 21) / 10000;
  return Math.min(1.0005, previousBest + offset);
}

const autoresearchProgressModel = (() => {
  const specs = Array.from({ length: 83 }, (_, index) => {
    const kept = progressKeepByIndex.get(index);
    const value = kept?.value ?? progressDiscardedValue(index);
    return {
      key: `progress_${index}`,
      title: kept?.title ?? `candidate ${index}`,
      value,
      tone: kept === undefined ? ("done" as LiveTone) : ("good" as LiveTone),
      kind: index === 0 ? ("baseline" as LiveMapNodeKind) : ("branch" as LiveMapNodeKind),
      kept: kept !== undefined,
    };
  });

  const nodes: LiveMapNodeRecord[] = specs.map((spec, index) => ({
    id: `live_node_progress_${index}` as SituId<"live_node">,
    projectId,
    nodeKey: spec.key,
    kind: spec.kind,
    title: spec.title,
    summary: `Validation BPB ${spec.value.toFixed(4)}.`,
    tone: spec.tone,
    occurredAt: progressTimestamp(index),
    refs: [],
    visibility: "visible" as const,
    authoredBy: manager,
    metadata: metadata(progressTimestamp(index)),
  }));

  const details: LiveNodeDetailRecord[] = specs.map((spec, index) => ({
    id: `live_detail_progress_${index}` as SituId<"live_detail">,
    projectId,
    nodeKey: spec.key,
    bodyMarkdown: `${spec.title}: validation BPB ${spec.value.toFixed(4)}.`,
    facts: [
      {
        label: "Validation BPB",
        value: spec.value.toFixed(4),
        tone: spec.kept ? "good" : "neutral",
        metricName: "validation_bpb",
        numericValue: spec.value,
        unit: "bpb",
        direction: "lower_is_better",
      },
    ],
    refs: [],
    authoredBy: manager,
    metadata: metadata(progressTimestamp(index, 1)),
  }));

  const records: ClientRecords = {
    ...emptyRecords(),
    projects: [
      projectRecord({
        name: "Autoresearch progress",
        repositoryPath: "/Users/scott/situ/workspaces/autoresearch-progress",
      }),
    ],
    tasks: [taskRecord({ status: "in_progress" })],
    baselines: [baselineRecord()],
    experiments: [],
    measurements: [],
    reviews: [],
    artifacts: [],
    reports: [],
    briefings: [
      briefing({
        id: "briefing_story_autoresearch_progress" as SituId<"briefing">,
        title: "Autoresearch progress",
        stage: "evaluating",
        assessment: "on_track",
        headlineMarkdown:
          "83 experiments run. 15 kept improvements have lowered validation BPB to **0.9773**.",
        blocks: [
          {
            type: "status",
            summaryMarkdown:
              "The manager is keeping the lower-is-better frontier visible while discarded attempts remain inspectable as context.",
          },
          {
            type: "callout",
            tone: "finding",
            bodyMarkdown:
              "Schedule and RoPE frequency changes account for the most recent frontier moves.",
          },
        ],
        createdAt: "2026-05-20T17:25:00.000Z",
      }),
    ],
    liveSignals: [
      liveSignalRecord({
        id: "live_signal_progress_best" as SituId<"live_signal">,
        slot: "metric",
        label: "Best BPB",
        value: "0.9773",
        summary: "Lower is better.",
        tone: "good",
        createdAt: "2026-05-20T17:25:10.000Z",
      }),
      liveSignalRecord({
        id: "live_signal_progress_count" as SituId<"live_signal">,
        slot: "experiments",
        label: "Experiments",
        value: "83 run",
        summary: "15 kept improvements.",
        tone: "neutral",
        createdAt: "2026-05-20T17:25:20.000Z",
      }),
      liveSignalRecord({
        id: "live_signal_progress_frontier" as SituId<"live_signal">,
        slot: "frontier",
        label: "Frontier",
        value: "15 kept",
        summary: "Random seed holds current best.",
        tone: "good",
        createdAt: "2026-05-20T17:25:30.000Z",
      }),
    ],
    liveMapNodes: nodes,
    liveMapEdges: progressKeeps.slice(1).map((keep, index) => ({
      id: `live_edge_progress_${index}` as SituId<"live_edge">,
      projectId,
      edgeKey: `progress_${progressKeeps[index]?.index ?? 0}_to_${keep.index}`,
      fromNodeKey: `progress_${progressKeeps[index]?.index ?? 0}`,
      toNodeKey: `progress_${keep.index}`,
      relation: "led_to" as const,
      tone: "good" as const,
      visibility: "visible" as const,
      authoredBy: manager,
      metadata: metadata(progressTimestamp(keep.index, 2)),
    })),
    liveFocuses: [
      liveFocusRecord({
        id: "live_focus_progress" as SituId<"live_focus">,
        mode: "overview",
        primaryNodeKey: "progress_74",
        relatedNodeKeys: ["progress_64", "progress_65", "progress_67"],
        summary: "Current frontier: 0.9773 validation BPB",
        createdAt: "2026-05-20T17:25:40.000Z",
      }),
    ],
    liveNodeDetails: details,
    comments: [],
    events: [],
    notifications: [],
  };

  const model = buildProjectOverviewModel({ records, requestedProjectId: projectId });
  if (model.kind !== "project") {
    throw new Error("Expected progress story to build a project model.");
  }
  return model;
})();

function modelWithBriefing(
  activeBriefing: BriefingRecord | undefined,
  options: {
    readonly includeBriefing?: boolean;
    readonly includeReport?: boolean;
    readonly includeUnreadNotification?: boolean;
    readonly taskStatus?: TaskRecord["status"];
    readonly experimentStatus?: ExperimentRecord["status"];
    readonly alternateExperimentStatus?: ExperimentRecord["status"];
    readonly reviewDecision?: ReviewRecord["decision"];
    readonly includeRunMap?: boolean;
  } = {},
): ProjectModel {
  const records = storyRecords({
    briefing: options.includeBriefing === false ? undefined : activeBriefing,
    includeReport: options.includeReport ?? true,
    includeUnreadNotification: options.includeUnreadNotification ?? false,
    taskStatus: options.taskStatus ?? "in_progress",
    experimentStatus: options.experimentStatus ?? "running",
    alternateExperimentStatus: options.alternateExperimentStatus ?? "planned",
    reviewDecision: options.reviewDecision ?? "commented",
    includeRunMap: options.includeRunMap ?? true,
  });
  const model = buildProjectOverviewModel({
    records,
    requestedProjectId: projectId,
  });

  if (model.kind !== "project") {
    throw new Error("Expected story records to build a project model.");
  }

  return model;
}

function storyRecords(input: {
  readonly briefing?: BriefingRecord;
  readonly includeReport: boolean;
  readonly includeUnreadNotification: boolean;
  readonly taskStatus: TaskRecord["status"];
  readonly experimentStatus: ExperimentRecord["status"];
  readonly alternateExperimentStatus: ExperimentRecord["status"];
  readonly reviewDecision: ReviewRecord["decision"];
  readonly includeRunMap: boolean;
}): ClientRecords {
  const report = input.includeReport
    ? reportRecord({
        id: "report_story_checkpoint" as SituId<"report">,
        target: target("project", projectId),
        title: "Checkpoint: parser branch leads",
        bodyMarkdown:
          "The parser branch currently has the strongest measured result. The remaining concern is verifier coverage on punctuation-heavy input.",
        createdAt: "2026-05-20T16:05:00.000Z",
      })
    : undefined;

  return {
    projects: [projectRecord()],
    tasks: [
      taskRecord({
        status: input.taskStatus,
      }),
    ],
    baselines: [baselineRecord()],
    experiments: [
      experimentRecord({
        id: experimentId,
        title: "Repair token-boundary parser",
        status: input.experimentStatus,
        createdAt: "2026-05-20T16:02:00.000Z",
      }),
      experimentRecord({
        id: alternateExperimentId,
        title: "Rewrite candidate ranking",
        status: input.alternateExperimentStatus,
        createdAt: "2026-05-20T16:03:00.000Z",
      }),
    ],
    measurements: [
      measurementRecord({
        id: "measurement_story_baseline_accuracy" as SituId<"measurement">,
        baselineId,
        metricName: "dev_accuracy",
        numericValue: 0.62,
        createdAt: "2026-05-20T16:01:30.000Z",
      }),
      measurementRecord({
        id: measurementId,
        experimentId,
        metricName: "dev_accuracy",
        numericValue: 0.71,
        createdAt: "2026-05-20T16:04:00.000Z",
      }),
      measurementRecord({
        id: "measurement_story_ranker_accuracy" as SituId<"measurement">,
        experimentId: alternateExperimentId,
        metricName: "dev_accuracy",
        numericValue: 0.66,
        createdAt: "2026-05-20T16:04:30.000Z",
      }),
    ],
    reviews: [
      reviewRecord({
        id: "review_story_changes" as SituId<"review">,
        decision: input.reviewDecision,
        createdAt: "2026-05-20T16:05:30.000Z",
      }),
    ],
    artifacts: [
      artifactRecord({
        id: "artifact_story_verifier_log" as SituId<"artifact">,
        target: target("experiment", experimentId),
        createdAt: "2026-05-20T16:04:45.000Z",
      }),
    ],
    reports: report === undefined ? [] : [report],
    briefings: input.briefing === undefined ? [] : [input.briefing],
    ...presentationRecords({
      assessment: input.briefing?.assessment ?? "watch",
      includeRunMap: input.includeRunMap,
      includeUnreadNotification: input.includeUnreadNotification,
      taskStatus: input.taskStatus,
      experimentStatus: input.experimentStatus,
      reviewDecision: input.reviewDecision,
    }),
    comments: [
      commentRecord({
        id: "comment_story_handoff" as SituId<"comment">,
        target: target("task", taskId),
        createdAt: "2026-05-20T16:05:45.000Z",
      }),
    ],
    events: [
      eventRecord({
        id: "event_story_ready" as SituId<"event">,
        target: target("experiment", experimentId),
        createdAt: "2026-05-20T16:05:50.000Z",
      }),
    ],
    notifications: input.includeUnreadNotification
      ? [
          notificationRecord({
            id: "notification_story_attention" as SituId<"notification">,
            target: target("experiment", experimentId),
            createdAt: "2026-05-20T16:06:00.000Z",
          }),
        ]
      : [],
  };
}

function presentationRecords(input: {
  readonly assessment: BriefingRecord["assessment"];
  readonly includeRunMap: boolean;
  readonly includeUnreadNotification: boolean;
  readonly taskStatus: TaskRecord["status"];
  readonly experimentStatus: ExperimentRecord["status"];
  readonly reviewDecision: ReviewRecord["decision"];
}): Pick<
  ClientRecords,
  "liveSignals" | "liveMapNodes" | "liveMapEdges" | "liveFocuses" | "liveNodeDetails"
> {
  const tone = presentationTone(input.assessment, input.includeUnreadNotification);
  const reportReady =
    input.taskStatus === "done" &&
    input.experimentStatus === "accepted" &&
    input.reviewDecision === "approved";

  return {
    liveSignals: [
      liveSignalRecord({
        id: "live_signal_story_assessment" as SituId<"live_signal">,
        slot: "assessment",
        label: "Assessment",
        value: assessmentLabel(input.assessment),
        summary:
          input.assessment === "blocked"
            ? "Work should pause until the missing verifier artifact is recovered."
            : "The agent-authored briefing is current.",
        tone,
        createdAt: "2026-05-20T16:07:10.000Z",
      }),
      liveSignalRecord({
        id: "live_signal_story_metric" as SituId<"live_signal">,
        slot: "metric",
        label: "Best metric",
        value: "0.71 accuracy",
        summary: "+0.09 over the native baseline.",
        tone: "good",
        createdAt: "2026-05-20T16:07:20.000Z",
      }),
      liveSignalRecord({
        id: "live_signal_story_verifier" as SituId<"live_signal">,
        slot: "verifier",
        label: "Verifier",
        value:
          input.reviewDecision === "approved"
            ? "Passed"
            : input.reviewDecision === "changes_requested"
              ? "Needs one check"
              : "Queued",
        summary:
          input.reviewDecision === "approved"
            ? "Focused review cleared the candidate."
            : "The verifier work is the main remaining risk.",
        tone:
          input.reviewDecision === "approved"
            ? "done"
            : input.reviewDecision === "changes_requested"
              ? "watch"
              : "neutral",
        createdAt: "2026-05-20T16:07:30.000Z",
      }),
      liveSignalRecord({
        id: "live_signal_story_report" as SituId<"live_signal">,
        slot: "report",
        label: "Report",
        value: reportReady ? "Ready" : "Waiting",
        summary: reportReady
          ? "The report can collapse the run into final findings."
          : "Final synthesis should wait for verification.",
        tone: reportReady ? "done" : "watch",
        createdAt: "2026-05-20T16:07:40.000Z",
      }),
    ],
    liveMapNodes: input.includeRunMap
      ? liveMapNodesForScenario({
          assessment: input.assessment,
          includeUnreadNotification: input.includeUnreadNotification,
          reportReady,
        })
      : [],
    liveMapEdges: input.includeRunMap ? liveMapEdgesForScenario(input.assessment) : [],
    liveFocuses: input.includeRunMap
      ? [
          liveFocusRecord({
            id: "live_focus_story_current" as SituId<"live_focus">,
            mode: input.assessment === "blocked" ? "blocked" : reportReady ? "overview" : "node",
            primaryNodeKey: input.assessment === "blocked" ? "missing_artifact" : "parser_branch",
            relatedNodeKeys:
              input.assessment === "blocked"
                ? ["parser_branch"]
                : ["baseline", "verifier_check", "result"],
            summary:
              input.assessment === "blocked"
                ? "Blocked on verifier artifact recovery"
                : reportReady
                  ? "Measured, reviewed, and ready to report"
                  : "The parser branch is the current decision point",
            createdAt: "2026-05-20T16:07:50.000Z",
          }),
        ]
      : [],
    liveNodeDetails: input.includeRunMap
      ? liveNodeDetailsForScenario({ assessment: input.assessment, reportReady })
      : [],
  };
}

function liveMapNodesForScenario(input: {
  readonly assessment: BriefingRecord["assessment"];
  readonly includeUnreadNotification: boolean;
  readonly reportReady: boolean;
}): readonly LiveMapNodeRecord[] {
  const blocked = input.assessment === "blocked" || input.includeUnreadNotification;

  return [
    liveMapNodeRecord({
      id: "live_node_story_baseline" as SituId<"live_node">,
      nodeKey: "baseline",
      kind: "baseline",
      title: "Baseline established",
      summary: "Native parser fixture set the comparison point.",
      tone: "neutral",
      createdAt: "2026-05-20T16:01:20.000Z",
    }),
    liveMapNodeRecord({
      id: "live_node_story_parser" as SituId<"live_node">,
      nodeKey: "parser_branch",
      kind: "branch",
      title: "Parser branch leads",
      summary: "Small repair is ahead of baseline and the larger rewrite.",
      tone: blocked ? "watch" : "good",
      createdAt: "2026-05-20T16:04:00.000Z",
    }),
    liveMapNodeRecord({
      id: "live_node_story_verifier" as SituId<"live_node">,
      nodeKey: blocked ? "missing_artifact" : "verifier_check",
      kind: blocked ? "blocker" : "verification",
      title: blocked ? "Verifier output missing" : "Verifier check",
      summary: blocked
        ? "The output artifact is missing, so the result cannot be trusted yet."
        : "Focused review is checking the token-boundary risk.",
      tone: blocked ? "blocked" : input.reportReady ? "done" : "watch",
      createdAt: "2026-05-20T16:05:30.000Z",
    }),
    liveMapNodeRecord({
      id: "live_node_story_result" as SituId<"live_node">,
      nodeKey: "result",
      kind: "result",
      title: input.reportReady ? "Report ready" : "Decision pending",
      summary: input.reportReady
        ? "The final report can now summarize why the small repair won."
        : "The final call waits on verifier confidence.",
      tone: input.reportReady ? "done" : "neutral",
      createdAt: "2026-05-20T16:08:00.000Z",
    }),
  ];
}

function liveMapEdgesForScenario(
  assessment: BriefingRecord["assessment"],
): readonly LiveMapEdgeRecord[] {
  const verifierNodeKey = assessment === "blocked" ? "missing_artifact" : "verifier_check";

  return [
    liveMapEdgeRecord({
      id: "live_edge_story_baseline_parser" as SituId<"live_edge">,
      edgeKey: "baseline_to_parser",
      fromNodeKey: "baseline",
      toNodeKey: "parser_branch",
      relation: "led_to",
      tone: "good",
      createdAt: "2026-05-20T16:04:05.000Z",
    }),
    liveMapEdgeRecord({
      id: "live_edge_story_parser_verifier" as SituId<"live_edge">,
      edgeKey: "parser_to_verifier",
      fromNodeKey: "parser_branch",
      toNodeKey: verifierNodeKey,
      relation: assessment === "blocked" ? "blocked_by" : "verifies",
      tone: assessment === "blocked" ? "blocked" : "watch",
      createdAt: "2026-05-20T16:05:35.000Z",
    }),
    liveMapEdgeRecord({
      id: "live_edge_story_verifier_result" as SituId<"live_edge">,
      edgeKey: "verifier_to_result",
      fromNodeKey: verifierNodeKey,
      toNodeKey: "result",
      relation: "led_to",
      tone: assessment === "complete" ? "good" : "neutral",
      createdAt: "2026-05-20T16:08:05.000Z",
    }),
  ];
}

function liveNodeDetailsForScenario(input: {
  readonly assessment: BriefingRecord["assessment"];
  readonly reportReady: boolean;
}): readonly LiveNodeDetailRecord[] {
  const verifierNodeKey = input.assessment === "blocked" ? "missing_artifact" : "verifier_check";

  return [
    liveNodeDetailRecord({
      id: "live_detail_story_parser" as SituId<"live_detail">,
      nodeKey: "parser_branch",
      bodyMarkdown:
        "The parser repair is the best current candidate. It improves the primary metric without the complexity of the ranking rewrite.",
      facts: [
        { label: "Best metric", value: "0.71 accuracy", tone: "good" },
        { label: "Delta", value: "+0.09", tone: "good" },
      ],
      refs: [target("experiment", experimentId), target("measurement", measurementId)],
      createdAt: "2026-05-20T16:07:45.000Z",
    }),
    liveNodeDetailRecord({
      id: "live_detail_story_verifier" as SituId<"live_detail">,
      nodeKey: verifierNodeKey,
      bodyMarkdown:
        input.assessment === "blocked"
          ? "The verifier result is not trustworthy until the missing artifact is recovered or rerun."
          : "The verifier check is focused on the token-boundary case, not the whole branch.",
      facts: [
        {
          label: "State",
          value: input.reportReady
            ? "Cleared"
            : input.assessment === "blocked"
              ? "Blocked"
              : "Open",
          tone: input.reportReady ? "done" : input.assessment === "blocked" ? "blocked" : "watch",
        },
      ],
      refs: [target("review", "review_story_changes" as SituId<"review">)],
      createdAt: "2026-05-20T16:07:55.000Z",
    }),
  ];
}

function emptyRecords(): ClientRecords {
  return {
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
}

function projectRecord(
  input: {
    readonly id?: SituId<"project">;
    readonly name?: string;
    readonly repositoryPath?: string;
    readonly status?: ProjectRecord["status"];
    readonly createdAt?: string;
  } = {},
): ProjectRecord {
  return {
    id: input.id ?? projectId,
    name: input.name ?? "Parser repair",
    repositoryPath: input.repositoryPath ?? "/Users/scott/situ/workspaces/parser-repair",
    goalMarkdown: "Improve parser accuracy without a large rewrite.",
    status: input.status ?? "active",
    createdBy: human,
    metadata: metadata(input.createdAt ?? "2026-05-20T16:00:00.000Z"),
  };
}

function taskRecord(input: { readonly status: TaskRecord["status"] }): TaskRecord {
  return {
    id: taskId,
    projectId,
    title: "Find a small parser repair",
    bodyMarkdown:
      "Explore minimal candidate changes, measure them against the fixture, and hand the strongest one to verification.",
    status: input.status,
    createdBy: manager,
    metadata: metadata("2026-05-20T16:01:00.000Z"),
  };
}

function baselineRecord(): BaselineRecord {
  return {
    id: baselineId,
    projectId,
    taskId,
    title: "Native parser baseline",
    summaryMarkdown: "Baseline fixture run before any candidate changes.",
    status: "active",
    createdBy: manager,
    metadata: metadata("2026-05-20T16:01:20.000Z"),
  };
}

function experimentRecord(input: {
  readonly id: SituId<"experiment">;
  readonly title: string;
  readonly status: ExperimentRecord["status"];
  readonly createdAt: string;
}): ExperimentRecord {
  return {
    id: input.id,
    projectId,
    taskId,
    title: input.title,
    summaryMarkdown: "Candidate branch measured against the parser fixture.",
    status: input.status,
    revisionNumber: 1,
    baseRef: "main",
    branchName: `experiment/${input.id.replace("experiment_story_", "")}`,
    worktreePath: `/tmp/situ/${input.id}`,
    assignedTo: verifier,
    createdBy: manager,
    metadata: metadata(input.createdAt),
  };
}

function measurementRecord(input: {
  readonly id: SituId<"measurement">;
  readonly baselineId?: SituId<"baseline">;
  readonly experimentId?: SituId<"experiment">;
  readonly metricName: string;
  readonly numericValue: number;
  readonly createdAt: string;
}): MeasurementRecord {
  return {
    id: input.id,
    baselineId: input.baselineId,
    experimentId: input.experimentId,
    revisionNumber: input.experimentId === undefined ? undefined : 1,
    metricName: input.metricName,
    numericValue: input.numericValue,
    unit: "accuracy",
    summaryMarkdown: `Measured ${input.metricName} at ${input.numericValue}.`,
    measuredBy: manager,
    metadata: metadata(input.createdAt),
  };
}

function reviewRecord(input: {
  readonly id: SituId<"review">;
  readonly decision: ReviewRecord["decision"];
  readonly createdAt: string;
}): ReviewRecord {
  return {
    id: input.id,
    experimentId,
    revisionNumber: 1,
    decision: input.decision,
    bodyMarkdown:
      input.decision === "approved"
        ? "The focused verifier fixture passed. This branch can be accepted."
        : "The candidate needs one more token-boundary check before acceptance.",
    reviewer: verifier,
    metadata: metadata(input.createdAt),
  };
}

function artifactRecord(input: {
  readonly id: SituId<"artifact">;
  readonly target: TargetRef;
  readonly createdAt: string;
}): ArtifactRecord {
  return {
    id: input.id,
    target: input.target,
    title: "Verifier log",
    summaryMarkdown: "Captured targeted verifier output.",
    uri: "file:///tmp/situ/verifier.log",
    mediaType: "text/plain",
    createdBy: verifier,
    metadata: metadata(input.createdAt),
  };
}

function reportRecord(input: {
  readonly id: SituId<"report">;
  readonly target: TargetRef;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly createdAt: string;
}): ReportRecord {
  return {
    id: input.id,
    projectId,
    target: input.target,
    title: input.title,
    bodyMarkdown: input.bodyMarkdown,
    generatedBy: manager,
    metadata: metadata(input.createdAt),
  };
}

function commentRecord(input: {
  readonly id: SituId<"comment">;
  readonly target: TargetRef;
  readonly createdAt: string;
}): CommentRecord {
  return {
    id: input.id,
    target: input.target,
    bodyMarkdown: "Handoff is ready for verifier review.",
    author: manager,
    metadata: metadata(input.createdAt),
  };
}

function eventRecord(input: {
  readonly id: SituId<"event">;
  readonly target: TargetRef;
  readonly createdAt: string;
}): EventRecord {
  return {
    id: input.id,
    target: input.target,
    actor: manager,
    summaryMarkdown: "Candidate moved into verifier review.",
    bodyMarkdown: "The measured branch is small enough to inspect directly.",
    metadata: metadata(input.createdAt),
  };
}

function notificationRecord(input: {
  readonly id: SituId<"notification">;
  readonly target: TargetRef;
  readonly createdAt: string;
}): NotificationRecord {
  return {
    id: input.id,
    recipient: {
      recipientId: "scott",
      displayName: "Scott",
    },
    target: input.target,
    createdBy: manager,
    summaryMarkdown: "Verifier artifact is missing.",
    bodyMarkdown: "The briefing should stay blocked until the artifact is recovered.",
    metadata: metadata(input.createdAt),
  };
}

function liveSignalRecord(input: {
  readonly id: SituId<"live_signal">;
  readonly slot: string;
  readonly label: string;
  readonly value: string;
  readonly summary: string;
  readonly tone: LiveTone;
  readonly createdAt: string;
}): LiveSignalRecord {
  return {
    id: input.id,
    projectId,
    slot: input.slot,
    label: input.label,
    value: input.value,
    summary: input.summary,
    tone: input.tone,
    refs: [],
    visibility: "visible",
    authoredBy: manager,
    metadata: metadata(input.createdAt),
  };
}

function liveMapNodeRecord(input: {
  readonly id: SituId<"live_node">;
  readonly nodeKey: string;
  readonly kind: LiveMapNodeKind;
  readonly title: string;
  readonly summary: string;
  readonly tone: LiveTone;
  readonly createdAt: string;
}): LiveMapNodeRecord {
  return {
    id: input.id,
    projectId,
    nodeKey: input.nodeKey,
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    tone: input.tone,
    occurredAt: input.createdAt,
    refs: [],
    visibility: "visible",
    authoredBy: manager,
    metadata: metadata(input.createdAt),
  };
}

function liveMapEdgeRecord(input: {
  readonly id: SituId<"live_edge">;
  readonly edgeKey: string;
  readonly fromNodeKey: string;
  readonly toNodeKey: string;
  readonly relation: LiveMapEdgeRecord["relation"];
  readonly tone: LiveMapEdgeRecord["tone"];
  readonly createdAt: string;
}): LiveMapEdgeRecord {
  return {
    id: input.id,
    projectId,
    edgeKey: input.edgeKey,
    fromNodeKey: input.fromNodeKey,
    toNodeKey: input.toNodeKey,
    relation: input.relation,
    tone: input.tone,
    visibility: "visible",
    authoredBy: manager,
    metadata: metadata(input.createdAt),
  };
}

function liveFocusRecord(input: {
  readonly id: SituId<"live_focus">;
  readonly mode: LiveFocusRecord["mode"];
  readonly primaryNodeKey: string;
  readonly relatedNodeKeys: readonly string[];
  readonly summary: string;
  readonly createdAt: string;
}): LiveFocusRecord {
  return {
    id: input.id,
    projectId,
    mode: input.mode,
    primaryNodeKey: input.primaryNodeKey,
    relatedNodeKeys: input.relatedNodeKeys,
    summary: input.summary,
    authoredBy: manager,
    metadata: metadata(input.createdAt),
  };
}

function liveNodeDetailRecord(input: {
  readonly id: SituId<"live_detail">;
  readonly nodeKey: string;
  readonly bodyMarkdown: string;
  readonly facts: LiveNodeDetailRecord["facts"];
  readonly refs: LiveNodeDetailRecord["refs"];
  readonly createdAt: string;
}): LiveNodeDetailRecord {
  return {
    id: input.id,
    projectId,
    nodeKey: input.nodeKey,
    bodyMarkdown: input.bodyMarkdown,
    facts: input.facts,
    refs: input.refs,
    authoredBy: manager,
    metadata: metadata(input.createdAt),
  };
}

function presentationTone(
  assessment: BriefingRecord["assessment"],
  includeUnreadNotification: boolean,
): LiveTone {
  if (includeUnreadNotification || assessment === "blocked") {
    return "blocked";
  }
  if (assessment === "complete") {
    return "done";
  }
  if (assessment === "watch") {
    return "watch";
  }
  return "good";
}

function assessmentLabel(assessment: BriefingRecord["assessment"]): string {
  switch (assessment) {
    case "complete":
      return "Complete";
    case "on_track":
      return "On track";
    case "watch":
      return "Watch";
    case "blocked":
      return "Blocked";
  }
}

function briefing(input: {
  readonly id: SituId<"briefing">;
  readonly title: string;
  readonly stage: BriefingRecord["stage"];
  readonly assessment: BriefingRecord["assessment"];
  readonly headlineMarkdown: string;
  readonly blocks: readonly BriefingBlock[];
  readonly createdAt: string;
}): BriefingRecord {
  return {
    id: input.id,
    projectId,
    title: input.title,
    stage: input.stage,
    assessment: input.assessment,
    headlineMarkdown: input.headlineMarkdown,
    blocks: input.blocks,
    evidenceRefs: [target("experiment", experimentId), target("measurement", measurementId)],
    authoredBy: manager,
    metadata: metadata(input.createdAt),
  };
}

function metadata(createdAt: string): SyncMetadata {
  return {
    createdAt,
    updatedAt: createdAt,
  };
}

function target<TKind extends TargetRef["targetKind"]>(
  targetKind: TKind,
  targetId: TargetRef<TKind>["targetId"],
): TargetRef<TKind> {
  return {
    targetKind,
    targetId,
  };
}
