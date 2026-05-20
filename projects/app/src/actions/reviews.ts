import type { SituId } from "@situ/common";
import type {
  CreateReviewInput,
  ListRecentReviewsInput,
  ListReviewsForExperimentInput,
  ReviewRecord,
} from "@situ/reviews";

import type { AppActionContext } from "./context.js";

export type CreateReviewActionInput = CreateReviewInput & {
  readonly context: AppActionContext;
};

export type CreateReviewActionResult = {
  readonly review: ReviewRecord;
};

export function createReviewAction(input: CreateReviewActionInput): CreateReviewActionResult {
  const review = input.context.repositories.reviews.create({
    id: input.id,
    experimentId: input.experimentId,
    revisionNumber: input.revisionNumber,
    decision: input.decision,
    bodyMarkdown: input.bodyMarkdown,
    reviewer: input.reviewer,
    now: input.now,
  });

  return { review };
}

export type GetReviewActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"review">;
};

export function getReviewAction(input: GetReviewActionInput): ReviewRecord | undefined {
  return input.context.repositories.reviews.getById({
    id: input.id,
  });
}

export type ListReviewsActionInput = ListReviewsForExperimentInput & {
  readonly context: AppActionContext;
};

export function listReviewsAction(input: ListReviewsActionInput): readonly ReviewRecord[] {
  return input.context.repositories.reviews.listForExperiment({
    experimentId: input.experimentId,
    revisionNumber: input.revisionNumber,
    decision: input.decision,
  });
}

export type ListRecentReviewsActionInput = ListRecentReviewsInput & {
  readonly context: AppActionContext;
};

export function listRecentReviewsAction(
  input: ListRecentReviewsActionInput,
): readonly ReviewRecord[] {
  return input.context.repositories.reviews.listRecent({
    limit: input.limit,
  });
}
