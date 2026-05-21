import {
  type ActorRef,
  type IsoTimestamp,
  type SituId,
  type TargetKind,
  type TargetRef,
  createId,
  createSyncMetadata,
} from "@situ/common";
import { ValidationError } from "@situ/errors";

import {
  type BriefingAssessment,
  type BriefingBlock,
  type BriefingCalloutTone,
  type BriefingRecord,
  type BriefingStage,
  briefingAssessments,
  briefingStages,
} from "./types.js";

export type CreateBriefingRecordInput = {
  readonly id?: SituId<"briefing">;
  readonly projectId: SituId<"project">;
  readonly title: string;
  readonly stage: BriefingStage;
  readonly assessment: BriefingAssessment;
  readonly headlineMarkdown: string;
  readonly blocks?: readonly BriefingBlock[];
  readonly evidenceRefs?: readonly TargetRef[];
  readonly authoredBy: ActorRef;
  readonly now?: IsoTimestamp;
};

const targetKinds = [
  "project",
  "task",
  "comment",
  "event",
  "notification",
  "baseline",
  "experiment",
  "measurement",
  "artifact",
  "review",
  "report",
  "briefing",
  "live_signal",
  "live_node",
  "live_edge",
  "live_focus",
  "live_detail",
] as const satisfies readonly TargetKind[];

const calloutTones = [
  "note",
  "warning",
  "finding",
] as const satisfies readonly BriefingCalloutTone[];

/**
 * Creates an append-only briefing record.
 */
export function createBriefingRecord(input: CreateBriefingRecordInput): BriefingRecord {
  return {
    id: input.id ?? createId({ prefix: "briefing" }),
    projectId: input.projectId,
    title: requireNonEmptyString({
      field: "title",
      value: input.title,
    }),
    stage: normalizeStage({ value: input.stage }),
    assessment: normalizeAssessment({ value: input.assessment }),
    headlineMarkdown: requireNonEmptyString({
      field: "headlineMarkdown",
      value: input.headlineMarkdown,
    }),
    blocks: normalizeBriefingBlocks({ blocks: input.blocks ?? [] }),
    evidenceRefs: normalizeTargetRefs({
      field: "evidenceRefs",
      refs: input.evidenceRefs ?? [],
    }),
    authoredBy: normalizeActorRef({
      actor: input.authoredBy,
      field: "authoredBy",
    }),
    metadata: createSyncMetadata({ now: input.now }),
  };
}

function normalizeStage(input: { readonly value: string }): BriefingStage {
  if ((briefingStages as readonly string[]).includes(input.value)) {
    return input.value as BriefingStage;
  }

  throw new ValidationError({
    message: "Invalid briefing stage.",
    details: { field: "stage", value: input.value, supported: briefingStages },
  });
}

function normalizeAssessment(input: { readonly value: string }): BriefingAssessment {
  if ((briefingAssessments as readonly string[]).includes(input.value)) {
    return input.value as BriefingAssessment;
  }

  throw new ValidationError({
    message: "Invalid briefing assessment.",
    details: { field: "assessment", value: input.value, supported: briefingAssessments },
  });
}

function normalizeBriefingBlocks(input: {
  readonly blocks: readonly BriefingBlock[];
}): readonly BriefingBlock[] {
  if (!Array.isArray(input.blocks)) {
    throw new ValidationError({
      message: "Expected briefing blocks to be an array.",
      details: { field: "blocks" },
    });
  }

  return input.blocks.map((block, index) =>
    normalizeBriefingBlock({
      block,
      field: `blocks[${index}]`,
    }),
  );
}

function normalizeBriefingBlock(input: {
  readonly block: BriefingBlock;
  readonly field: string;
}): BriefingBlock {
  const block = input.block as BriefingBlock & Record<string, unknown>;

  if (typeof block !== "object" || block === null || typeof block.type !== "string") {
    throw new ValidationError({
      message: "Expected briefing block with a type.",
      details: { field: input.field },
    });
  }

  switch (block.type) {
    case "status":
      return withOptional({
        type: "status",
        summaryMarkdown: requireNonEmptyString({
          field: `${input.field}.summaryMarkdown`,
          value: block.summaryMarkdown,
        }),
        reasons: normalizeOptionalStringArray({
          field: `${input.field}.reasons`,
          values: block.reasons,
        }),
        refs: normalizeOptionalTargetRefs({
          field: `${input.field}.refs`,
          refs: block.refs,
        }),
      });

    case "callout":
      return withOptional({
        type: "callout",
        tone: normalizeCalloutTone({
          field: `${input.field}.tone`,
          value: block.tone,
        }),
        bodyMarkdown: requireNonEmptyString({
          field: `${input.field}.bodyMarkdown`,
          value: block.bodyMarkdown,
        }),
        refs: normalizeOptionalTargetRefs({
          field: `${input.field}.refs`,
          refs: block.refs,
        }),
      });

    case "progress":
      return withOptional({
        type: "progress",
        metricName: optionalNonEmptyString({
          field: `${input.field}.metricName`,
          value: block.metricName,
        }),
        highlightExperimentIds: normalizeOptionalExperimentIds({
          field: `${input.field}.highlightExperimentIds`,
          ids: block.highlightExperimentIds,
        }),
      });

    case "outcomes":
      return withOptional({
        type: "outcomes",
        experimentIds: normalizeOptionalExperimentIds({
          field: `${input.field}.experimentIds`,
          ids: block.experimentIds,
        }),
      });

    case "evidence":
      return {
        type: "evidence",
        experimentIds: normalizeExperimentIds({
          field: `${input.field}.experimentIds`,
          ids: block.experimentIds,
        }),
      };

    case "recent_update":
      return withOptional({
        type: "recent_update",
        bodyMarkdown: requireNonEmptyString({
          field: `${input.field}.bodyMarkdown`,
          value: block.bodyMarkdown,
        }),
        refs: normalizeOptionalTargetRefs({
          field: `${input.field}.refs`,
          refs: block.refs,
        }),
      });

    case "next_steps":
      return {
        type: "next_steps",
        items: normalizeNextStepItems({
          field: `${input.field}.items`,
          items: block.items,
        }),
      };

    default:
      throw new ValidationError({
        message: "Invalid briefing block type.",
        details: {
          field: `${input.field}.type`,
          value: (block as Record<string, unknown>).type,
        },
      });
  }
}

function normalizeCalloutTone(input: {
  readonly field: string;
  readonly value: unknown;
}): BriefingCalloutTone {
  if (
    typeof input.value === "string" &&
    (calloutTones as readonly string[]).includes(input.value)
  ) {
    return input.value as BriefingCalloutTone;
  }

  throw new ValidationError({
    message: "Invalid briefing callout tone.",
    details: { field: input.field, value: input.value, supported: calloutTones },
  });
}

function normalizeNextStepItems(input: {
  readonly field: string;
  readonly items: unknown;
}): readonly { readonly text: string; readonly refs?: readonly TargetRef[] }[] {
  if (!Array.isArray(input.items)) {
    throw new ValidationError({
      message: "Expected briefing next steps to be an array.",
      details: { field: input.field },
    });
  }

  return input.items.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new ValidationError({
        message: "Expected briefing next step to be an object.",
        details: { field: `${input.field}[${index}]` },
      });
    }

    const itemRecord = item as Record<string, unknown>;

    return withOptional({
      text: requireNonEmptyString({
        field: `${input.field}[${index}].text`,
        value: itemRecord.text,
      }),
      refs: normalizeOptionalTargetRefs({
        field: `${input.field}[${index}].refs`,
        refs: itemRecord.refs,
      }),
    });
  });
}

function normalizeOptionalStringArray(input: {
  readonly field: string;
  readonly values: unknown;
}): readonly string[] | undefined {
  if (input.values === undefined) {
    return undefined;
  }

  if (!Array.isArray(input.values)) {
    throw new ValidationError({
      message: "Expected briefing strings to be an array.",
      details: { field: input.field },
    });
  }

  return input.values.map((value, index) =>
    requireNonEmptyString({
      field: `${input.field}[${index}]`,
      value,
    }),
  );
}

function normalizeOptionalExperimentIds(input: {
  readonly field: string;
  readonly ids: unknown;
}): readonly SituId<"experiment">[] | undefined {
  if (input.ids === undefined) {
    return undefined;
  }

  return normalizeExperimentIds(input);
}

function normalizeExperimentIds(input: {
  readonly field: string;
  readonly ids: unknown;
}): readonly SituId<"experiment">[] {
  if (!Array.isArray(input.ids)) {
    throw new ValidationError({
      message: "Expected experiment ids to be an array.",
      details: { field: input.field },
    });
  }

  return input.ids.map(
    (id, index) =>
      requireNonEmptyString({
        field: `${input.field}[${index}]`,
        value: id,
      }) as SituId<"experiment">,
  );
}

function normalizeOptionalTargetRefs(input: {
  readonly field: string;
  readonly refs: unknown;
}): readonly TargetRef[] | undefined {
  if (input.refs === undefined) {
    return undefined;
  }

  return normalizeTargetRefs({
    field: input.field,
    refs: input.refs,
  });
}

function normalizeTargetRefs(input: {
  readonly field: string;
  readonly refs: unknown;
}): readonly TargetRef[] {
  if (!Array.isArray(input.refs)) {
    throw new ValidationError({
      message: "Expected target refs to be an array.",
      details: { field: input.field },
    });
  }

  return input.refs.map((ref, index) =>
    normalizeTargetRef({
      field: `${input.field}[${index}]`,
      ref,
    }),
  );
}

function normalizeTargetRef(input: { readonly field: string; readonly ref: unknown }): TargetRef {
  if (typeof input.ref !== "object" || input.ref === null) {
    throw new ValidationError({
      message: "Expected target ref to be an object.",
      details: { field: input.field },
    });
  }

  const ref = input.ref as Record<string, unknown>;
  const targetKind = requireNonEmptyString({
    field: `${input.field}.targetKind`,
    value: ref.targetKind,
  });

  if (!(targetKinds as readonly string[]).includes(targetKind)) {
    throw new ValidationError({
      message: "Invalid target kind.",
      details: { field: `${input.field}.targetKind`, value: targetKind },
    });
  }

  return {
    targetKind: targetKind as TargetKind,
    targetId: requireNonEmptyString({
      field: `${input.field}.targetId`,
      value: ref.targetId,
    }) as TargetRef["targetId"],
  };
}

type NormalizeActorRefInput = {
  readonly actor: ActorRef;
  readonly field: string;
};

function normalizeActorRef(input: NormalizeActorRefInput): ActorRef {
  const displayName = optionalNonEmptyString({
    field: `${input.field}.displayName`,
    value: input.actor.displayName,
  });

  return {
    actorKind: requireNonEmptyString({
      field: `${input.field}.actorKind`,
      value: input.actor.actorKind,
    }) as ActorRef["actorKind"],
    actorId: requireNonEmptyString({
      field: `${input.field}.actorId`,
      value: input.actor.actorId,
    }),
    displayName,
  };
}

type RequireNonEmptyStringInput = {
  readonly field: string;
  readonly value: unknown;
};

function requireNonEmptyString(input: RequireNonEmptyStringInput): string {
  if (typeof input.value !== "string") {
    throw new ValidationError({
      message: "Expected a non-empty string.",
      details: { field: input.field },
    });
  }

  const value = input.value.trim();

  if (value.length > 0) {
    return value;
  }

  throw new ValidationError({
    message: "Expected a non-empty string.",
    details: { field: input.field },
  });
}

type OptionalNonEmptyStringInput = {
  readonly field: string;
  readonly value?: unknown;
};

function optionalNonEmptyString(input: OptionalNonEmptyStringInput): string | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  return requireNonEmptyString({
    field: input.field,
    value: input.value,
  });
}

function withOptional<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}
