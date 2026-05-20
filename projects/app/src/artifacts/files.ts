import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  copyFileSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  rmSync,
  statSync,
  type Stats,
} from "node:fs";
import { basename, dirname, isAbsolute, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

import type { SituId } from "@situ/common";
import { ConflictError, ValidationError } from "@situ/errors";

export type CaptureLocalArtifactFileInput = {
  readonly stateHomePath: string;
  readonly projectId: SituId<"project">;
  readonly artifactId: SituId<"artifact">;
  readonly sourcePath: string;
};

export type CapturedLocalArtifactFile = {
  readonly artifactDirectoryPath: string;
  readonly destinationPath: string;
  readonly uri: string;
  readonly byteSize: number;
  readonly sha256: string;
};

const storageSegmentPattern = /^[A-Za-z0-9_-]+$/;
const hashChunkSize = 64 * 1024;

/**
 * Copies a local file into Situ artifact storage.
 *
 * This helper owns the physical write boundary for artifact capture. It derives
 * destination storage from the Situ state home and validated product ids, and
 * only preserves the caller-selected source basename. Capture does not scan,
 * preview, summarize, classify, or log file contents; byte reads after copying
 * are limited to deriving size and SHA-256 metadata.
 */
export function captureLocalArtifactFile(
  input: CaptureLocalArtifactFileInput,
): CapturedLocalArtifactFile {
  const stateHomePath = requireAbsoluteStateHomePath({ stateHomePath: input.stateHomePath });
  const sourcePath = requireAbsoluteSourcePath({ sourcePath: input.sourcePath });
  const projectId = requireSafeStorageSegment({ segment: input.projectId });
  const artifactId = requireSafeStorageSegment({ segment: input.artifactId });
  const sourceStats = statSourceFile({ sourcePath });
  requireSafeCapturedFileSize({ byteSize: sourceStats.size });
  const resolvedSourcePath = realpathSync(sourcePath);
  const artifactDirectoryPath = join(stateHomePath, "projects", projectId, "artifacts", artifactId);
  const destinationPath = join(artifactDirectoryPath, basename(sourcePath));

  mkdirSync(dirname(artifactDirectoryPath), { recursive: true });
  createArtifactDirectory({ artifactDirectoryPath });

  try {
    copyFileSync(resolvedSourcePath, destinationPath, constants.COPYFILE_EXCL);
    const byteSize = byteSizeForCopiedFile({ destinationPath });

    return {
      artifactDirectoryPath,
      destinationPath,
      uri: pathToFileURL(destinationPath).href,
      byteSize,
      sha256: hashFileSha256({ path: destinationPath }),
    };
  } catch (error) {
    rmSync(artifactDirectoryPath, { recursive: true, force: true });

    throw error;
  }
}

function requireAbsoluteStateHomePath(input: { readonly stateHomePath: string }): string {
  if (isAbsolute(input.stateHomePath)) {
    return normalize(input.stateHomePath);
  }

  throw new ValidationError({
    message: "Expected an absolute state home path.",
    details: { field: "stateHomePath" },
  });
}

function requireAbsoluteSourcePath(input: { readonly sourcePath: string }): string {
  if (isAbsolute(input.sourcePath)) {
    return normalize(input.sourcePath);
  }

  throw new ValidationError({
    message: "Expected an absolute source path.",
    details: { field: "sourcePath" },
  });
}

function requireSafeStorageSegment(input: { readonly segment: string }): string {
  if (storageSegmentPattern.test(input.segment)) {
    return input.segment;
  }

  throw new ValidationError({
    message: "Expected a safe artifact storage path segment.",
    details: { segment: input.segment },
  });
}

function statSourceFile(input: { readonly sourcePath: string }): Stats {
  let sourceStats: Stats;

  try {
    sourceStats = statSync(input.sourcePath, { bigint: false });
  } catch (error) {
    if (isNodeErrorCode({ error, code: "ENOENT" })) {
      throw new ValidationError({
        message: "Source file was not found.",
        details: { sourcePath: input.sourcePath },
      });
    }

    throw error;
  }

  if (sourceStats.isFile()) {
    return sourceStats;
  }

  throw new ValidationError({
    message: "Expected source path to be a file.",
    details: { sourcePath: input.sourcePath },
  });
}

function byteSizeForCopiedFile(input: { readonly destinationPath: string }): number {
  const byteSize = statSync(input.destinationPath, { bigint: false }).size;

  return requireSafeCapturedFileSize({ byteSize });
}

function requireSafeCapturedFileSize(input: { readonly byteSize: number }): number {
  const byteSize = input.byteSize;

  if (Number.isSafeInteger(byteSize) && byteSize >= 0) {
    return byteSize;
  }

  throw new ValidationError({
    message: "Expected captured file size to be a safe integer.",
    details: { byteSize },
  });
}

function createArtifactDirectory(input: { readonly artifactDirectoryPath: string }): void {
  try {
    mkdirSync(input.artifactDirectoryPath);
  } catch (error) {
    if (isNodeErrorCode({ error, code: "EEXIST" })) {
      throw new ConflictError({
        message: "Artifact storage already exists.",
        details: { artifactDirectoryPath: input.artifactDirectoryPath },
      });
    }

    throw error;
  }
}

function hashFileSha256(input: { readonly path: string }): string {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(hashChunkSize);
  const file = openSync(input.path, "r");

  try {
    let bytesRead = readSync(file, buffer, 0, buffer.byteLength, null);

    while (bytesRead > 0) {
      hash.update(buffer.subarray(0, bytesRead));
      bytesRead = readSync(file, buffer, 0, buffer.byteLength, null);
    }
  } finally {
    closeSync(file);
  }

  return hash.digest("hex");
}

function isNodeErrorCode(input: { readonly error: unknown; readonly code: string }): boolean {
  return input.error instanceof Error && "code" in input.error && input.error.code === input.code;
}
