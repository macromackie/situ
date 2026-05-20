import type { SituId } from "@situ/common";
import type { CommentRecord, CreateCommentInput, ListCommentsForTargetInput } from "@situ/comments";

import type { AppActionContext } from "./context.js";

export type CreateCommentActionInput = CreateCommentInput & {
  readonly context: AppActionContext;
};

export type CreateCommentActionResult = {
  readonly comment: CommentRecord;
};

export function createCommentAction(input: CreateCommentActionInput): CreateCommentActionResult {
  const comment = input.context.repositories.comments.create({
    id: input.id,
    target: input.target,
    bodyMarkdown: input.bodyMarkdown,
    author: input.author,
    now: input.now,
  });

  return { comment };
}

export type GetCommentActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"comment">;
};

export function getCommentAction(input: GetCommentActionInput): CommentRecord | undefined {
  return input.context.repositories.comments.getById({
    id: input.id,
  });
}

export type ListCommentsActionInput = ListCommentsForTargetInput & {
  readonly context: AppActionContext;
};

export function listCommentsAction(input: ListCommentsActionInput): readonly CommentRecord[] {
  return input.context.repositories.comments.listForTarget({
    target: input.target,
  });
}
