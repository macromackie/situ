import {
  type ActorRef,
  type IsoTimestamp,
  type SituId,
  type TargetRef,
  createId,
  createSyncMetadata,
} from "@situ/common";
import { ValidationError } from "@situ/errors";

import type { ReportRecord } from "./types.js";

export type CreateReportRecordInput = {
  readonly id?: SituId<"report">;
  readonly projectId: SituId<"project">;
  readonly target: TargetRef;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly generatedBy: ActorRef;
  readonly now?: IsoTimestamp;
};

/**
 * Creates a report record.
 */
export function createReportRecord(input: CreateReportRecordInput): ReportRecord {
  return {
    id: input.id ?? createId({ prefix: "report" }),
    projectId: input.projectId,
    target: input.target,
    title: requireNonEmptyString({
      field: "title",
      value: input.title,
    }),
    bodyMarkdown: requireNonEmptyString({
      field: "bodyMarkdown",
      value: input.bodyMarkdown,
    }),
    generatedBy: normalizeActorRef({
      actor: input.generatedBy,
      field: "generatedBy",
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
