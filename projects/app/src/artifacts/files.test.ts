import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";
import { ConflictError, ValidationError } from "@situ/errors";

import { captureLocalArtifactFile } from "./index.js";

function withTempRoot(run: (rootPath: string) => void): void {
  const rootPath = mkdtempSync(join(tmpdir(), "situ-artifact-files-"));

  try {
    run(rootPath);
  } finally {
    rmSync(rootPath, { recursive: true, force: true });
  }
}

test("copies a source file into project artifact storage", () => {
  withTempRoot((rootPath) => {
    const stateHomePath = join(rootPath, "state home");
    const sourcePath = join(rootPath, "score #1.txt");
    const sourceContent = "score: 8.7\n";
    writeFileSync(sourcePath, sourceContent);

    const captured = captureLocalArtifactFile({
      stateHomePath,
      projectId: "project_file_capture" as SituId<"project">,
      artifactId: "artifact_file_capture" as SituId<"artifact">,
      sourcePath,
    });

    expect(captured).toEqual({
      artifactDirectoryPath: join(
        stateHomePath,
        "projects",
        "project_file_capture",
        "artifacts",
        "artifact_file_capture",
      ),
      destinationPath: join(
        stateHomePath,
        "projects",
        "project_file_capture",
        "artifacts",
        "artifact_file_capture",
        "score #1.txt",
      ),
      uri: pathToFileURL(
        join(
          stateHomePath,
          "projects",
          "project_file_capture",
          "artifacts",
          "artifact_file_capture",
          "score #1.txt",
        ),
      ).href,
      byteSize: Buffer.byteLength(sourceContent),
      sha256: createHash("sha256").update(sourceContent).digest("hex"),
    });
    expect(readFileSync(captured.destinationPath, "utf8")).toBe(sourceContent);
    expect(captured.uri).toContain("score%20%231.txt");
  });
});

test("preserves caller-provided symlink basename", () => {
  withTempRoot((rootPath) => {
    const sourcePath = join(rootPath, "real-score.json");
    const linkPath = join(rootPath, "link-score.json");
    writeFileSync(sourcePath, "{}\n");
    symlinkSync(sourcePath, linkPath);

    const captured = captureLocalArtifactFile({
      stateHomePath: join(rootPath, "state"),
      projectId: "project_symlink" as SituId<"project">,
      artifactId: "artifact_symlink" as SituId<"artifact">,
      sourcePath: linkPath,
    });

    expect(captured.destinationPath.endsWith("link-score.json")).toBe(true);
  });
});

test("rejects invalid file capture inputs", () => {
  withTempRoot((rootPath) => {
    const sourcePath = join(rootPath, "source.txt");
    const directorySourcePath = join(rootPath, "directory-source");
    writeFileSync(sourcePath, "ok");
    mkdirSync(directorySourcePath);

    const baseInput = {
      stateHomePath: join(rootPath, "state"),
      projectId: "project_capture" as SituId<"project">,
      artifactId: "artifact_capture" as SituId<"artifact">,
      sourcePath,
    };

    expect(() =>
      captureLocalArtifactFile({
        ...baseInput,
        stateHomePath: "relative-state",
      }),
    ).toThrow(ValidationError);
    expect(() =>
      captureLocalArtifactFile({
        ...baseInput,
        sourcePath: "relative-source",
      }),
    ).toThrow(ValidationError);
    expect(() =>
      captureLocalArtifactFile({
        ...baseInput,
        sourcePath: join(rootPath, "missing.txt"),
      }),
    ).toThrow("Source file was not found.");
    expect(() =>
      captureLocalArtifactFile({
        ...baseInput,
        sourcePath: directorySourcePath,
      }),
    ).toThrow("Expected source path to be a file.");
    expect(() =>
      captureLocalArtifactFile({
        ...baseInput,
        projectId: "../project" as SituId<"project">,
      }),
    ).toThrow("Expected a safe artifact storage path segment.");
    expect(() =>
      captureLocalArtifactFile({
        ...baseInput,
        artifactId: "artifact/bad" as SituId<"artifact">,
      }),
    ).toThrow("Expected a safe artifact storage path segment.");
    expect(() =>
      captureLocalArtifactFile({
        ...baseInput,
        projectId: "..foo" as SituId<"project">,
      }),
    ).toThrow("Expected a safe artifact storage path segment.");

    captureLocalArtifactFile(baseInput);
    expect(() => captureLocalArtifactFile(baseInput)).toThrow(ConflictError);
  });
});

test("rejects unsafe source file sizes when sparse files are available", () => {
  withTempRoot((rootPath) => {
    const sourcePath = join(rootPath, "oversized.bin");
    const stateHomePath = join(rootPath, "state");
    const artifactDirectoryPath = join(
      stateHomePath,
      "projects",
      "project_big_file",
      "artifacts",
      "artifact_big_file",
    );

    if (!tryCreateUnsafeSparseFile({ sourcePath })) {
      return;
    }

    expect(() =>
      captureLocalArtifactFile({
        stateHomePath,
        projectId: "project_big_file" as SituId<"project">,
        artifactId: "artifact_big_file" as SituId<"artifact">,
        sourcePath,
      }),
    ).toThrow("Expected captured file size to be a safe integer.");
    expect(existsSync(artifactDirectoryPath)).toBe(false);
  });
});

test("cleans up artifact storage when copying fails after directory creation", () => {
  withTempRoot((rootPath) => {
    const sourcePath = join(rootPath, "unreadable.txt");
    const stateHomePath = join(rootPath, "state");
    const artifactDirectoryPath = join(
      stateHomePath,
      "projects",
      "project_unreadable",
      "artifacts",
      "artifact_unreadable",
    );
    writeFileSync(sourcePath, "secret");
    chmodSync(sourcePath, 0o000);

    try {
      expect(() =>
        captureLocalArtifactFile({
          stateHomePath,
          projectId: "project_unreadable" as SituId<"project">,
          artifactId: "artifact_unreadable" as SituId<"artifact">,
          sourcePath,
        }),
      ).toThrow();
      expect(existsSync(artifactDirectoryPath)).toBe(false);
    } finally {
      chmodSync(sourcePath, 0o600);
    }
  });
});

function tryCreateUnsafeSparseFile(input: { readonly sourcePath: string }): boolean {
  try {
    return Bun.spawnSync(["truncate", "-s", "9007199254740992", input.sourcePath]).exitCode === 0;
  } catch {
    return false;
  }
}
