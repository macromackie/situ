import { isAbsolute } from "node:path";

import {
  type ActorRef,
  type IsoTimestamp,
  type SituId,
  createId,
  createSyncMetadata,
  touchSyncMetadata,
} from "@situ/common";
import { ValidationError } from "@situ/errors";

import type { ProjectRecord } from "./types.js";

export type CreateProjectRecordInput = {
  readonly id?: SituId<"project">;
  readonly name: string;
  readonly repositoryPath: string;
  readonly goalMarkdown: string;
  readonly createdBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export type ArchiveProjectRecordInput = {
  readonly project: ProjectRecord;
  readonly now?: IsoTimestamp;
};

/**
 * Creates an active project record.
 */
export function createProjectRecord(input: CreateProjectRecordInput): ProjectRecord {
  const name = requireNonEmptyString({
    field: "name",
    value: input.name,
  });
  const repositoryPath = normalizeRepositoryPath({
    repositoryPath: input.repositoryPath,
  });
  const goalMarkdown = requireNonEmptyString({
    field: "goalMarkdown",
    value: input.goalMarkdown,
  });

  return {
    id: input.id ?? createId({ prefix: "project" }),
    name,
    repositoryPath,
    goalMarkdown,
    status: "active",
    createdBy: normalizeActorRef({ actor: input.createdBy }),
    metadata: createSyncMetadata({ now: input.now }),
  };
}

/**
 * Returns an archived project record.
 */
export function archiveProjectRecord(input: ArchiveProjectRecordInput): ProjectRecord {
  return {
    ...input.project,
    status: "archived",
    metadata: touchSyncMetadata({
      metadata: input.project.metadata,
      now: input.now,
    }),
  };
}

type NormalizeRepositoryPathInput = {
  readonly repositoryPath: string;
};

function normalizeRepositoryPath(input: NormalizeRepositoryPathInput): string {
  const repositoryPath = requireNonEmptyString({
    field: "repositoryPath",
    value: input.repositoryPath,
  });

  if (isAbsolute(repositoryPath)) {
    return repositoryPath;
  }

  throw new ValidationError({
    message: "Project repository path must be absolute.",
    details: { field: "repositoryPath" },
  });
}

type NormalizeActorRefInput = {
  readonly actor: ActorRef;
};

function normalizeActorRef(input: NormalizeActorRefInput): ActorRef {
  const actorKind = requireNonEmptyString({
    field: "createdBy.actorKind",
    value: input.actor.actorKind,
  }) as ActorRef["actorKind"];
  const actorId = requireNonEmptyString({
    field: "createdBy.actorId",
    value: input.actor.actorId,
  });
  const displayName = optionalNonEmptyString({
    field: "createdBy.displayName",
    value: input.actor.displayName,
  });

  return {
    actorKind,
    actorId,
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
