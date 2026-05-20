import {
  type ActorRef,
  type IsoTimestamp,
  type SituId,
  createId,
  createSyncMetadata,
} from "@situ/common";
import { ValidationError } from "@situ/errors";

import type { ReviewDecision, ReviewRecord } from "./types.js";

export type CreateReviewRecordInput = {
  readonly id?: SituId<"review">;
  readonly experimentId: SituId<"experiment">;
  readonly revisionNumber: number;
  readonly decision: ReviewDecision;
  readonly bodyMarkdown: string;
  readonly reviewer: ActorRef;
  readonly now?: IsoTimestamp;
};

/**
 * Creates a review record.
 */
export function createReviewRecord(input: CreateReviewRecordInput): ReviewRecord {
  return {
    id: input.id ?? createId({ prefix: "review" }),
    experimentId: input.experimentId,
    revisionNumber: requirePositiveInteger({
      field: "revisionNumber",
      value: input.revisionNumber,
    }),
    decision: requireReviewDecision({
      field: "decision",
      value: input.decision,
    }),
    bodyMarkdown: requireNonEmptyString({
      field: "bodyMarkdown",
      value: input.bodyMarkdown,
    }),
    reviewer: normalizeActorRef({
      actor: input.reviewer,
      field: "reviewer",
    }),
    metadata: createSyncMetadata({ now: input.now }),
  };
}

type RequirePositiveIntegerInput = {
  readonly field: string;
  readonly value: number;
};

function requirePositiveInteger(input: RequirePositiveIntegerInput): number {
  if (Number.isInteger(input.value) && input.value > 0) {
    return input.value;
  }

  throw new ValidationError({
    message: "Expected a positive integer.",
    details: { field: input.field },
  });
}

const reviewDecisions = ["approved", "changes_requested", "rejected", "commented"] as const;

type RequireReviewDecisionInput = {
  readonly field: string;
  readonly value: ReviewDecision;
};

function requireReviewDecision(input: RequireReviewDecisionInput): ReviewDecision {
  if (reviewDecisions.includes(input.value)) {
    return input.value;
  }

  throw new ValidationError({
    message: "Expected a valid review decision.",
    details: { field: input.field },
  });
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
  readonly value: string;
};

function requireNonEmptyString(input: RequireNonEmptyStringInput): string {
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
  readonly value?: string;
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
