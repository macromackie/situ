import type { SituId } from "@situ/common";
import type {
  BriefingRecord,
  CreateBriefingInput,
  ListBriefingsForProjectInput,
  ListRecentBriefingsInput,
} from "@situ/briefings";

import type { AppActionContext } from "./context.js";

export type CreateBriefingActionInput = CreateBriefingInput & {
  readonly context: AppActionContext;
};

export type CreateBriefingActionResult = {
  readonly briefing: BriefingRecord;
};

export function createBriefingAction(input: CreateBriefingActionInput): CreateBriefingActionResult {
  const briefing = input.context.repositories.briefings.create({
    id: input.id,
    projectId: input.projectId,
    title: input.title,
    stage: input.stage,
    assessment: input.assessment,
    headlineMarkdown: input.headlineMarkdown,
    blocks: input.blocks,
    evidenceRefs: input.evidenceRefs,
    authoredBy: input.authoredBy,
    now: input.now,
  });

  return { briefing };
}

export type GetBriefingActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"briefing">;
};

export function getBriefingAction(input: GetBriefingActionInput): BriefingRecord | undefined {
  return input.context.repositories.briefings.getById({
    id: input.id,
  });
}

export type ListBriefingsForProjectActionInput = ListBriefingsForProjectInput & {
  readonly context: AppActionContext;
};

export function listBriefingsForProjectAction(
  input: ListBriefingsForProjectActionInput,
): readonly BriefingRecord[] {
  return input.context.repositories.briefings.listForProject({
    projectId: input.projectId,
  });
}

export type ListRecentBriefingsActionInput = ListRecentBriefingsInput & {
  readonly context: AppActionContext;
};

export function listRecentBriefingsAction(
  input: ListRecentBriefingsActionInput,
): readonly BriefingRecord[] {
  return input.context.repositories.briefings.listRecent({
    limit: input.limit,
  });
}
