import {
  type ActorRef,
  type IsoTimestamp,
  type SituId,
  type TargetRef,
  createId,
  createSyncMetadata,
} from "@situ/common";
import { ValidationError } from "@situ/errors";

import type { ArtifactRecord } from "./types.js";

export type CreateArtifactRecordInput = {
  readonly id?: SituId<"artifact">;
  readonly target: TargetRef;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly uri: string;
  readonly mediaType?: string;
  readonly byteSize?: number;
  readonly sha256?: string;
  readonly createdBy: ActorRef;
  readonly now?: IsoTimestamp;
};

/**
 * Creates an artifact record.
 */
export function createArtifactRecord(input: CreateArtifactRecordInput): ArtifactRecord {
  return {
    id: input.id ?? createId({ prefix: "artifact" }),
    target: input.target,
    title: requireNonEmptyString({
      field: "title",
      value: input.title,
    }),
    summaryMarkdown: requireNonEmptyString({
      field: "summaryMarkdown",
      value: input.summaryMarkdown,
    }),
    uri: requireNonEmptyString({
      field: "uri",
      value: input.uri,
    }),
    mediaType: optionalNonEmptyString({
      field: "mediaType",
      value: input.mediaType,
    }),
    byteSize: optionalNonNegativeSafeInteger({
      field: "byteSize",
      value: input.byteSize,
    }),
    sha256: optionalSha256({
      field: "sha256",
      value: input.sha256,
    }),
    createdBy: normalizeActorRef({
      actor: input.createdBy,
      field: "createdBy",
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

type OptionalNonNegativeSafeIntegerInput = {
  readonly field: string;
  readonly value?: number;
};

function optionalNonNegativeSafeInteger(
  input: OptionalNonNegativeSafeIntegerInput,
): number | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  if (typeof input.value === "number" && Number.isSafeInteger(input.value) && input.value >= 0) {
    return input.value;
  }

  throw new ValidationError({
    message: "Expected a non-negative safe integer.",
    details: { field: input.field },
  });
}

type OptionalSha256Input = {
  readonly field: string;
  readonly value?: string;
};

function optionalSha256(input: OptionalSha256Input): string | undefined {
  if (input.value === undefined) {
    return undefined;
  }

  const value = requireNonEmptyString({
    field: input.field,
    value: input.value,
  });

  if (/^[0-9a-f]{64}$/.test(value)) {
    return value;
  }

  throw new ValidationError({
    message: "Expected a lowercase SHA-256 hex digest.",
    details: { field: input.field },
  });
}
