import {
  type ActorRef,
  type IsoTimestamp,
  type SituId,
  type TargetRef,
  createId,
  createSyncMetadata,
} from "@situ/common";
import { ValidationError } from "@situ/errors";

import type { CommentRecord } from "./types.js";

export type CreateCommentRecordInput = {
  readonly id?: SituId<"comment">;
  readonly target: TargetRef;
  readonly bodyMarkdown: string;
  readonly author: ActorRef;
  readonly now?: IsoTimestamp;
};

/**
 * Creates a comment record.
 */
export function createCommentRecord(input: CreateCommentRecordInput): CommentRecord {
  return {
    id: input.id ?? createId({ prefix: "comment" }),
    target: input.target,
    bodyMarkdown: requireNonEmptyString({
      field: "bodyMarkdown",
      value: input.bodyMarkdown,
    }),
    author: normalizeActorRef({
      actor: input.author,
      field: "author",
    }),
    metadata: createSyncMetadata({ now: input.now }),
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
