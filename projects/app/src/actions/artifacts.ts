import { rmSync } from "node:fs";

import {
  createId,
  type ActorRef,
  type IsoTimestamp,
  type SituId,
  type TargetRef,
} from "@situ/common";
import type {
  ArtifactRecord,
  CreateArtifactInput,
  ListArtifactsForTargetInput,
  ListRecentArtifactsInput,
} from "@situ/artifacts";
import { NotFoundError, ValidationError } from "@situ/errors";

import { captureLocalArtifactFile } from "../artifacts/index.js";
import type { AppActionContext } from "./context.js";

export type CreateArtifactActionInput = CreateArtifactInput & {
  readonly context: AppActionContext;
};

export type CreateArtifactActionResult = {
  readonly artifact: ArtifactRecord;
};

export function createArtifactAction(input: CreateArtifactActionInput): CreateArtifactActionResult {
  const artifact = input.context.repositories.artifacts.create({
    id: input.id,
    target: input.target,
    title: input.title,
    summaryMarkdown: input.summaryMarkdown,
    uri: input.uri,
    mediaType: input.mediaType,
    byteSize: input.byteSize,
    sha256: input.sha256,
    createdBy: input.createdBy,
    now: input.now,
  });

  return { artifact };
}

export type CaptureArtifactFileActionInput = {
  readonly context: AppActionContext;
  readonly stateHomePath: string;
  readonly projectId: SituId<"project">;
  readonly id?: SituId<"artifact">;
  readonly target: TargetRef;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly sourcePath: string;
  readonly mediaType?: string;
  readonly createdBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export type CaptureArtifactFileActionResult = {
  readonly artifact: ArtifactRecord;
};

/**
 * Captures a local file and creates an artifact record for it.
 */
export function captureArtifactFileAction(
  input: CaptureArtifactFileActionInput,
): CaptureArtifactFileActionResult {
  const artifactId = input.id ?? createId({ prefix: "artifact" });
  const project = input.context.repositories.projects.getById({
    id: input.projectId,
  });

  if (project === undefined) {
    throw new NotFoundError({
      message: "Project was not found.",
      details: { id: input.projectId },
    });
  }

  if (input.target.targetKind === "project" && input.target.targetId !== input.projectId) {
    throw new ValidationError({
      message: "Artifact project target must match projectId.",
      details: {
        projectId: input.projectId,
        targetId: input.target.targetId,
      },
    });
  }

  const captured = captureLocalArtifactFile({
    stateHomePath: input.stateHomePath,
    projectId: input.projectId,
    artifactId,
    sourcePath: input.sourcePath,
  });

  try {
    const artifact = input.context.repositories.artifacts.create({
      id: artifactId,
      target: input.target,
      title: input.title,
      summaryMarkdown: input.summaryMarkdown,
      uri: captured.uri,
      mediaType: input.mediaType,
      byteSize: captured.byteSize,
      sha256: captured.sha256,
      createdBy: input.createdBy,
      now: input.now,
    });

    return { artifact };
  } catch (error) {
    cleanupCapturedArtifact({ artifactDirectoryPath: captured.artifactDirectoryPath });

    throw error;
  }
}

export type GetArtifactActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"artifact">;
};

export function getArtifactAction(input: GetArtifactActionInput): ArtifactRecord | undefined {
  return input.context.repositories.artifacts.getById({
    id: input.id,
  });
}

export type ListArtifactsActionInput = ListArtifactsForTargetInput & {
  readonly context: AppActionContext;
};

export function listArtifactsAction(input: ListArtifactsActionInput): readonly ArtifactRecord[] {
  return input.context.repositories.artifacts.listForTarget({
    target: input.target,
  });
}

export type ListRecentArtifactsActionInput = ListRecentArtifactsInput & {
  readonly context: AppActionContext;
};

export function listRecentArtifactsAction(
  input: ListRecentArtifactsActionInput,
): readonly ArtifactRecord[] {
  return input.context.repositories.artifacts.listRecent({
    limit: input.limit,
  });
}

function cleanupCapturedArtifact(input: { readonly artifactDirectoryPath: string }): void {
  try {
    rmSync(input.artifactDirectoryPath, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup should not hide the original persistence error.
  }
}
