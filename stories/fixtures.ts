import type { Dataset, Asset } from "../src/protocol/artifacts.js";
import type {
  PublicationView,
  SourceRef,
  Figure,
} from "../src/protocol/publication/index.js";
export const observations: Dataset = {
  schema: "situ.dataset.v1",
  metric: "Episode success",
  unit: "fraction",
  direction: "higher",
  cohortId: "frozen-120",
  evaluatorVersion: "eval-v2",
  environmentVersion: "navigation-v1",
  series: [
    {
      id: "baseline",
      label: "Baseline",
      seed: "11",
      values: [
        {
          scenario: "Open room",
          step: 0,
          value: 0.76,
          n: 120,
          lower: 0.68,
          upper: 0.82,
        },
        {
          scenario: "Corridor",
          step: 0,
          value: 0.41,
          n: 120,
          lower: 0.33,
          upper: 0.5,
        },
        { scenario: "Delayed cue", step: 0, value: 0.32, n: 120 },
      ],
    },
    {
      id: "candidate",
      label: "Balanced sampling",
      seed: "11",
      values: [
        { scenario: "Open room", step: 0, value: 0.74, n: 120 },
        { scenario: "Open room", step: 1000, value: 0.78, n: 120 },
        {
          scenario: "Open room",
          step: 2000,
          value: 0.84,
          n: 120,
          lower: 0.76,
          upper: 0.89,
        },
        { scenario: "Corridor", step: 0, value: 0.4, n: 120 },
        { scenario: "Corridor", step: 1000, value: 0.53, n: 120 },
        {
          scenario: "Corridor",
          step: 2000,
          value: 0.63,
          n: 120,
          lower: 0.54,
          upper: 0.71,
        },
        { scenario: "Delayed cue", step: 2000, value: null, n: 0 },
      ],
    },
  ],
};
export const ref = (
  recordId: string,
  relationship: SourceRef["relationship"] = "supports",
): SourceRef => ({ snapshotId: "snapshot", recordId, relationship });
const at = Date.UTC(2026, 9, 6, 18);
function asset(
  id: string,
  mediaType: Asset["mediaType"],
  title: string,
): Asset {
  return {
    id,
    projectId: "example",
    sha256: "a".repeat(64),
    mediaType,
    title,
    size: 128,
    author: "curator",
    createdAt: at,
  };
}
const assets: Record<string, Asset> = {
  dataset: {
    ...asset("dataset", "application/json", "Frozen evaluation observations"),
    dataset: observations,
  },
  baseline_video: {
    ...asset("baseline_video", "video/webm", "Baseline replay"),
    replay: {
      policy: "Baseline",
      scenario: "Corridor",
      seed: "11",
      environmentVersion: "navigation-v1",
      duration: 3,
    },
  },
  candidate_video: {
    ...asset("candidate_video", "video/webm", "Balanced replay"),
    replay: {
      policy: "Balanced sampling",
      scenario: "Corridor",
      seed: "11",
      environmentVersion: "navigation-v1",
      duration: 3,
    },
  },
  example_image: asset("example_image", "image/png", "Corridor decision point"),
};
const figures: Figure[] = [
  {
    id: "comparison",
    kind: "comparison",
    scenario: "Corridor",
    title: "The corridor gap is smaller",
    caption:
      "Synthetic example. Same 120 episodes and evaluator. Reported intervals are illustrative fixture values; a second training seed is still needed.",
    sources: [ref("dataset")],
    assetIds: ["dataset"],
    baseline: "baseline",
  },
  {
    id: "curve",
    kind: "curve",
    title: "Learning across checkpoints",
    caption:
      "Synthetic fixture. Each point is one evaluation checkpoint; gaps remain unmeasured.",
    sources: [ref("dataset")],
    assetIds: ["dataset"],
    baseline: "baseline",
  },
  {
    id: "matrix",
    kind: "matrix",
    title: "Where the policy still struggles",
    caption:
      "Synthetic fixture. Delayed cues have not yet been evaluated for the candidate.",
    sources: [ref("dataset")],
    assetIds: ["dataset"],
    baseline: "baseline",
  },
  {
    id: "replays",
    kind: "replay",
    title: "Watch the same corridor",
    caption:
      "Synthetic replay fixture. Two policies face the same corridor and seed. These clips demonstrate the player, not a learned policy.",
    sources: [ref("baseline_video"), ref("candidate_video")],
    alignment: "matched",
    left: { assetId: "baseline_video", start: 0, end: 3 },
    right: { assetId: "candidate_video", start: 0, end: 3 },
  },
  {
    id: "example",
    kind: "example",
    title: "The decision point",
    caption: "Synthetic scene showing where the two paths diverge.",
    sources: [ref("example_image")],
    assetId: "example_image",
    annotations: [
      "The blue marker is the policy position.",
      "The narrow opening is a decision point; this still image alone cannot explain the policy's computation.",
    ],
  },
  {
    id: "history",
    kind: "timeline",
    title: "From a baseline to a controlled follow-up",
    caption:
      "Source timestamps connect the two investigations. A finished experiment is separate from an accepted conclusion.",
    sources: [ref("baseline_work"), ref("followup_work")],
    lanes: [
      { id: "baseline", label: "Scenario baseline", pageId: "corridors" },
      { id: "control", label: "Delay control", pageId: "delay" },
    ],
    items: [
      {
        id: "b",
        laneId: "baseline",
        label: "Baseline evaluated",
        source: ref("baseline_work"),
        startField: "createdAt",
        endField: "updatedAt",
      },
      {
        id: "c",
        laneId: "control",
        label: "Matched control started",
        source: ref("followup_work"),
        startField: "createdAt",
        endField: "updatedAt",
      },
    ],
  },
  {
    id: "connections",
    kind: "evidence",
    title: "What supports the follow-up",
    caption:
      "A source relationship states why the next test matters. It does not establish causality.",
    sources: [ref("baseline_work"), ref("followup_work")],
    nodes: [
      {
        id: "baseline",
        label: "Corridor failures",
        source: ref("baseline_work"),
      },
      {
        id: "control",
        label: "Matched delay control",
        source: ref("followup_work", "context"),
      },
    ],
    edges: [{ from: "baseline", to: "control", relationship: "motivates" }],
  },
];
export const exampleView: PublicationView = {
  project: {
    id: "example",
    title: "Navigation study",
    goal: "Understand why the policy fails in corridors",
    focus: "Separate memory from turning",
  },
  release: {
    projectId: "example",
    revision: 1,
    baseRelease: 0,
    snapshotId: "snapshot",
    author: "curator",
    updatedAt: at + 3600000,
    publishedAt: at + 3600000,
    through: 20,
    document: {
      schemaVersion: 1,
      figures,
      pages: [
        {
          id: "now",
          template: "overview",
          title: "Better turns. Memory is still an open question.",
          summary: {
            text: "Synthetic research account: balanced sampling improves the corridor cases in one seed. The next test holds navigation difficulty fixed while varying cue delay.",
            sources: [ref("baseline_work"), ref("followup_work", "context")],
          },
          archived: false,
          sections: [
            {
              id: "understanding",
              blocks: [
                {
                  id: "claim",
                  kind: "statement",
                  stance: "interpretation",
                  text: "The first result supports a narrower investigation. It does not yet show that the policy remembers a cue over longer delays.",
                  sources: [ref("baseline_work")],
                },
                { id: "plot", kind: "figure", figureId: "comparison" },
              ],
            },
            {
              id: "next",
              blocks: [
                {
                  id: "test",
                  kind: "next-test",
                  text: "Keep turn count and episode length fixed. Compare cue delays, then replicate the decisive result with another training seed.",
                  sources: [ref("followup_work", "context")],
                },
              ],
            },
            {
              id: "questions",
              title: "Questions we are following",
              blocks: [
                {
                  id: "related",
                  kind: "related",
                  pageIds: ["corridors", "delay"],
                },
              ],
            },
          ],
        },
        {
          id: "corridors",
          template: "question",
          title: "Are failures concentrated in corridors?",
          summary: {
            text: "The same frozen scenarios expose a corridor gap. This synthetic account shows how measurements, behavior, and an interpretation can stay connected.",
            sources: [ref("baseline_work")],
          },
          archived: false,
          sections: [
            {
              id: "measurements",
              blocks: [
                { id: "curve", kind: "figure", figureId: "curve" },
                { id: "matrix", kind: "figure", figureId: "matrix" },
              ],
            },
            {
              id: "behavior",
              title: "Observed behavior",
              blocks: [
                { id: "video", kind: "figure", figureId: "replays" },
                { id: "image", kind: "figure", figureId: "example" },
              ],
            },
          ],
        },
        {
          id: "delay",
          template: "question",
          title: "Does the policy retain the cue?",
          summary: {
            text: "A controlled delay comparison is the next experiment. No result has been published for it yet.",
            sources: [ref("followup_work", "context")],
          },
          archived: false,
          sections: [
            {
              id: "reason",
              blocks: [
                { id: "connection", kind: "figure", figureId: "connections" },
                {
                  id: "prediction",
                  kind: "statement",
                  stance: "proposal",
                  text: "If cue identity is the bottleneck, errors should increase with delay even when navigation difficulty stays fixed.",
                  sources: [ref("followup_work", "context")],
                },
              ],
            },
          ],
        },
      ],
      updates: [
        {
          id: "baseline-result",
          kind: "result",
          pageIds: ["corridors"],
          headline: "The scenario baseline exposes a corridor gap",
          body: "Synthetic result: open rooms are easier than corridors. The aggregate score hides the difference, so the next comparison keeps scenario identity visible.",
          occurredAt: at + 1800000,
          sources: [ref("baseline_work")],
        },
        {
          id: "control-decision",
          kind: "decision",
          pageIds: ["delay"],
          headline: "Separate memory from navigation",
          body: "Hold turn count fixed and vary cue delay. We will revisit the explanation after that comparison and an independent seed.",
          occurredAt: at + 3500000,
          sources: [ref("followup_work", "context")],
        },
      ],
    },
  },
  assets,
  sources: {
    snapshot: {
      id: "snapshot",
      projectId: "example",
      through: 20,
      capturedAt: at + 3600000,
      records: {
        baseline_work: {
          id: "baseline_work",
          kind: "work",
          title: "Measure the scenario baseline",
          createdAt: at,
          updatedAt: at + 1800000,
          outcome:
            "Synthetic corridor gap. Independent replication remains pending.",
        },
        followup_work: {
          id: "followup_work",
          kind: "work",
          title: "Compare short and delayed cues",
          createdAt: at + 2100000,
          updatedAt: at + 3500000,
          outcome: "The matched control is underway in this fixture.",
        },
        ...Object.fromEntries(
          Object.entries(assets).map(([id, a]) => [
            id,
            { ...a, kind: "asset" },
          ]),
        ),
      },
    },
  },
  freshness: { through: 20, latest: 20, pending: 0, changedSources: [] },
  live: { running: 1, unknown: 0, asOf: at + 3600000 },
};
