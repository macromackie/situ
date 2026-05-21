import type { ActorRef, SituId, SyncMetadata, TargetRef } from "@situ/common";

export const briefingsPackageName = "briefings" as const;
export type BriefingsPackageName = typeof briefingsPackageName;

export const briefingStages = [
  "orienting",
  "baselining",
  "exploring",
  "evaluating",
  "synthesizing",
  "finalizing",
  "complete",
  "blocked",
] as const;

export const briefingAssessments = ["on_track", "watch", "blocked", "complete"] as const;

export type BriefingStage = (typeof briefingStages)[number];
export type BriefingAssessment = (typeof briefingAssessments)[number];
export type BriefingCalloutTone = "note" | "warning" | "finding";

export type BriefingBlock =
  | {
      readonly type: "status";
      readonly summaryMarkdown: string;
      readonly reasons?: readonly string[];
      readonly refs?: readonly TargetRef[];
    }
  | {
      readonly type: "callout";
      readonly tone: BriefingCalloutTone;
      readonly bodyMarkdown: string;
      readonly refs?: readonly TargetRef[];
    }
  | {
      readonly type: "progress";
      readonly metricName?: string;
      readonly highlightExperimentIds?: readonly SituId<"experiment">[];
    }
  | {
      readonly type: "outcomes";
      readonly experimentIds?: readonly SituId<"experiment">[];
    }
  | {
      readonly type: "evidence";
      readonly experimentIds: readonly SituId<"experiment">[];
    }
  | {
      readonly type: "recent_update";
      readonly bodyMarkdown: string;
      readonly refs?: readonly TargetRef[];
    }
  | {
      readonly type: "next_steps";
      readonly items: readonly {
        readonly text: string;
        readonly refs?: readonly TargetRef[];
      }[];
    };

/**
 * Agent-authored live presentation state for one project.
 */
export type BriefingRecord = {
  readonly id: SituId<"briefing">;
  readonly projectId: SituId<"project">;
  readonly title: string;
  readonly stage: BriefingStage;
  readonly assessment: BriefingAssessment;
  readonly headlineMarkdown: string;
  readonly blocks: readonly BriefingBlock[];
  readonly evidenceRefs: readonly TargetRef[];
  readonly authoredBy: ActorRef;
  readonly metadata: SyncMetadata;
};
