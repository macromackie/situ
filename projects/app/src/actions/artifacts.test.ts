import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { SituId, TargetRef } from "@situ/common";
import { NotFoundError, ValidationError } from "@situ/errors";

import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import {
  captureArtifactFileAction,
  createAppActionContext,
  createArtifactAction,
  getArtifactAction,
  listArtifactsAction,
  listRecentArtifactsAction,
} from "./index.js";

type CountRow = {
  readonly count: number;
};

type ArtifactTextMetadataRow = {
  readonly id: string;
  readonly target_kind: string;
  readonly target_id: string;
  readonly title: string;
  readonly summary_markdown: string;
  readonly uri: string;
  readonly media_type: string | null;
  readonly sha256: string | null;
  readonly created_by_kind: string;
  readonly created_by_id: string;
  readonly created_by_display_name: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

function countRows(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
  readonly tableName: "events" | "notifications";
}): number {
  return (
    input.database.query<CountRow, []>(`SELECT COUNT(*) AS count FROM ${input.tableName}`).get()
      ?.count ?? 0
  );
}

function expectNoEventsOrNotifications(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
}): void {
  expect(countRows({ database: input.database, tableName: "events" })).toBe(0);
  expect(countRows({ database: input.database, tableName: "notifications" })).toBe(0);
}

const taskTarget = {
  targetKind: "task",
  targetId: "task_artifact_actions",
} as TargetRef;

function withTempRoot(run: (rootPath: string) => void): void {
  const rootPath = mkdtempSync(join(tmpdir(), "situ-artifact-actions-"));

  try {
    run(rootPath);
  } finally {
    rmSync(rootPath, { recursive: true, force: true });
  }
}

function createProjectFixture(input: {
  readonly context: ReturnType<typeof createAppActionContext>;
  readonly id: SituId<"project">;
}): void {
  input.context.repositories.projects.create({
    id: input.id,
    name: "Artifact Capture Project",
    repositoryPath: "/tmp/artifact-capture-project",
    goalMarkdown: "Capture artifact evidence.",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  });
}

test("creates an artifact through the app action without emitting events or notifications", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const result = createArtifactAction({
      context,
      id: "artifact_action_create" as SituId<"artifact">,
      target: taskTarget,
      title: "Benchmark output",
      summaryMarkdown: "Captured benchmark log.",
      uri: "file:///tmp/benchmark.log",
      mediaType: "text/plain",
      byteSize: 42,
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      createdBy: {
        actorKind: "local_agent",
        actorId: "verifier-1",
        displayName: "Verifier 1",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(result.artifact).toMatchObject({
      id: "artifact_action_create",
      target: taskTarget,
      title: "Benchmark output",
      summaryMarkdown: "Captured benchmark log.",
      uri: "file:///tmp/benchmark.log",
      mediaType: "text/plain",
      byteSize: 42,
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      createdBy: {
        actorKind: "local_agent",
        actorId: "verifier-1",
        displayName: "Verifier 1",
      },
      metadata: {
        createdAt: "2026-05-13T12:02:00.000Z",
        updatedAt: "2026-05-13T12:02:00.000Z",
      },
    });
    expect(context.repositories.artifacts.getById({ id: result.artifact.id })).toEqual(
      result.artifact,
    );
    expectNoEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("captures a local artifact file through the app action", () => {
  withTempRoot((rootPath) => {
    const database = openAppDatabase({ databasePath: memoryDatabasePath });
    const sourcePath = join(rootPath, "source log.txt");
    const stateHomePath = join(rootPath, "state");
    const sourceContentCanary = "captured-file-content-canary-0078";
    const sourceContent = `${sourceContentCanary}\nbenchmark score: 8.4\n`;
    writeFileSync(sourcePath, sourceContent);

    try {
      const context = createAppActionContext({ database });
      const projectId = "project_artifact_capture" as SituId<"project">;
      createProjectFixture({ context, id: projectId });

      const result = captureArtifactFileAction({
        context,
        stateHomePath,
        projectId,
        id: "artifact_action_capture" as SituId<"artifact">,
        target: {
          targetKind: "project",
          targetId: projectId,
        },
        title: "Benchmark log",
        summaryMarkdown: "Captured benchmark output.",
        sourcePath,
        mediaType: "text/plain",
        createdBy: {
          actorKind: "local_agent",
          actorId: "verifier-1",
        },
        now: "2026-05-13T12:05:00.000Z",
      });
      const destinationPath = join(
        stateHomePath,
        "projects",
        projectId,
        "artifacts",
        "artifact_action_capture",
        "source log.txt",
      );

      expect(result.artifact).toMatchObject({
        id: "artifact_action_capture",
        target: {
          targetKind: "project",
          targetId: projectId,
        },
        title: "Benchmark log",
        summaryMarkdown: "Captured benchmark output.",
        uri: pathToFileURL(destinationPath).href,
        mediaType: "text/plain",
        byteSize: Buffer.byteLength(sourceContent),
        sha256: createHash("sha256").update(sourceContent).digest("hex"),
      });
      const textMetadata = database
        .query<ArtifactTextMetadataRow, [string]>(
          `SELECT
            id,
            target_kind,
            target_id,
            title,
            summary_markdown,
            uri,
            media_type,
            sha256,
            created_by_kind,
            created_by_id,
            created_by_display_name,
            created_at,
            updated_at
          FROM artifacts
          WHERE id = ?`,
        )
        .get(result.artifact.id);

      expect(textMetadata).not.toBeNull();
      expect(JSON.stringify(textMetadata)).not.toContain(sourceContentCanary);
      expect(existsSync(destinationPath)).toBe(true);
      expectNoEventsOrNotifications({ database });
    } finally {
      database.close();
    }
  });
});

test("generated artifact ids are accepted when capturing files", () => {
  withTempRoot((rootPath) => {
    const database = openAppDatabase({ databasePath: memoryDatabasePath });
    const sourcePath = join(rootPath, "generated.txt");
    writeFileSync(sourcePath, "generated id");

    try {
      const context = createAppActionContext({ database });
      const projectId = "project_artifact_generated" as SituId<"project">;
      createProjectFixture({ context, id: projectId });

      const result = captureArtifactFileAction({
        context,
        stateHomePath: join(rootPath, "state"),
        projectId,
        target: {
          targetKind: "task",
          targetId: "task_artifact_generated",
        } as TargetRef,
        title: "Generated artifact",
        summaryMarkdown: "Generated artifact id.",
        sourcePath,
        createdBy: {
          actorKind: "human",
          actorId: "scott",
        },
      });

      expect(result.artifact.id.startsWith("artifact_")).toBe(true);
      expect(existsSync(fileURLToPath(result.artifact.uri))).toBe(true);
      expectNoEventsOrNotifications({ database });
    } finally {
      database.close();
    }
  });
});

test("capture validates project state before copying", () => {
  withTempRoot((rootPath) => {
    const database = openAppDatabase({ databasePath: memoryDatabasePath });
    const sourcePath = join(rootPath, "missing-project.txt");
    const stateHomePath = join(rootPath, "state");
    writeFileSync(sourcePath, "missing project");

    try {
      const context = createAppActionContext({ database });
      expect(() =>
        captureArtifactFileAction({
          context,
          stateHomePath,
          projectId: "project_missing_capture" as SituId<"project">,
          id: "artifact_missing_project" as SituId<"artifact">,
          target: {
            targetKind: "project",
            targetId: "project_missing_capture",
          },
          title: "Missing project",
          summaryMarkdown: "Should fail.",
          sourcePath,
          createdBy: {
            actorKind: "human",
            actorId: "scott",
          },
        }),
      ).toThrow(NotFoundError);
      expect(existsSync(join(stateHomePath, "projects"))).toBe(false);
      expectNoEventsOrNotifications({ database });
    } finally {
      database.close();
    }
  });
});

test("capture validates project target before copying", () => {
  withTempRoot((rootPath) => {
    const database = openAppDatabase({ databasePath: memoryDatabasePath });
    const sourcePath = join(rootPath, "mismatch.txt");
    const stateHomePath = join(rootPath, "state");
    writeFileSync(sourcePath, "mismatch");

    try {
      const context = createAppActionContext({ database });
      const projectId = "project_artifact_mismatch" as SituId<"project">;
      createProjectFixture({ context, id: projectId });

      expect(() =>
        captureArtifactFileAction({
          context,
          stateHomePath,
          projectId,
          id: "artifact_mismatch" as SituId<"artifact">,
          target: {
            targetKind: "project",
            targetId: "project_other",
          },
          title: "Mismatch",
          summaryMarkdown: "Should fail.",
          sourcePath,
          createdBy: {
            actorKind: "human",
            actorId: "scott",
          },
        }),
      ).toThrow(ValidationError);
      expect(existsSync(join(stateHomePath, "projects"))).toBe(false);
      expectNoEventsOrNotifications({ database });
    } finally {
      database.close();
    }
  });
});

test("capture cleans up copied storage after duplicate artifact failures", () => {
  withTempRoot((rootPath) => {
    const database = openAppDatabase({ databasePath: memoryDatabasePath });
    const sourcePath = join(rootPath, "duplicate.txt");
    const stateHomePath = join(rootPath, "state");
    const projectId = "project_artifact_duplicate" as SituId<"project">;
    const artifactId = "artifact_duplicate_capture" as SituId<"artifact">;
    writeFileSync(sourcePath, "duplicate");

    try {
      const context = createAppActionContext({ database });
      createProjectFixture({ context, id: projectId });
      context.repositories.artifacts.create({
        id: artifactId,
        target: taskTarget,
        title: "Existing artifact",
        summaryMarkdown: "Already exists.",
        uri: "file:///tmp/existing.txt",
        createdBy: {
          actorKind: "human",
          actorId: "scott",
        },
      });

      expect(() =>
        captureArtifactFileAction({
          context,
          stateHomePath,
          projectId,
          id: artifactId,
          target: taskTarget,
          title: "Duplicate artifact",
          summaryMarkdown: "Should fail.",
          sourcePath,
          createdBy: {
            actorKind: "human",
            actorId: "scott",
          },
        }),
      ).toThrow("Artifact already exists.");
      expect(existsSync(join(stateHomePath, "projects", projectId, "artifacts", artifactId))).toBe(
        false,
      );
      expectNoEventsOrNotifications({ database });
    } finally {
      database.close();
    }
  });
});

test("gets an existing and missing artifact without emitting events or notifications", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const artifact = context.repositories.artifacts.create({
      id: "artifact_action_get" as SituId<"artifact">,
      target: taskTarget,
      title: "Screenshot",
      summaryMarkdown: "Captured UI state.",
      uri: "file:///tmp/screenshot.png",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(getArtifactAction({ context, id: artifact.id })).toEqual(artifact);
    expect(
      getArtifactAction({
        context,
        id: "artifact_missing" as SituId<"artifact">,
      }),
    ).toBeUndefined();
    expectNoEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("lists artifacts for a target", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const matching = context.repositories.artifacts.create({
      id: "artifact_action_list_match" as SituId<"artifact">,
      target: taskTarget,
      title: "Task log",
      summaryMarkdown: "Log for the task.",
      uri: "file:///tmp/task.log",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });
    context.repositories.artifacts.create({
      id: "artifact_action_list_miss" as SituId<"artifact">,
      target: {
        targetKind: "review",
        targetId: "review_artifact_actions",
      } as TargetRef,
      title: "Review log",
      summaryMarkdown: "Log for the review.",
      uri: "file:///tmp/review.log",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:03:00.000Z",
    });

    expect(
      listArtifactsAction({
        context,
        target: taskTarget,
      }),
    ).toEqual([matching]);
    expectNoEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("lists recent artifacts", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const first = context.repositories.artifacts.create({
      id: "artifact_action_recent_first" as SituId<"artifact">,
      target: taskTarget,
      title: "First artifact",
      summaryMarkdown: "First artifact summary.",
      uri: "file:///tmp/first.txt",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });
    const second = context.repositories.artifacts.create({
      id: "artifact_action_recent_second" as SituId<"artifact">,
      target: taskTarget,
      title: "Second artifact",
      summaryMarkdown: "Second artifact summary.",
      uri: "file:///tmp/second.txt",
      createdBy: {
        actorKind: "local_agent",
        actorId: "verifier-1",
      },
      now: "2026-05-13T12:03:00.000Z",
    });

    expect(listRecentArtifactsAction({ context, limit: 1 })).toEqual([second]);
    expect(listRecentArtifactsAction({ context })).toEqual([second, first]);
    expectNoEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("repository errors propagate from the artifact app action", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    createArtifactAction({
      context,
      id: "artifact_action_duplicate" as SituId<"artifact">,
      target: taskTarget,
      title: "First artifact",
      summaryMarkdown: "First artifact summary.",
      uri: "file:///tmp/first.txt",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(() =>
      createArtifactAction({
        context,
        id: "artifact_action_duplicate" as SituId<"artifact">,
        target: taskTarget,
        title: "Duplicate artifact",
        summaryMarkdown: "Duplicate artifact summary.",
        uri: "file:///tmp/duplicate.txt",
        createdBy: {
          actorKind: "human",
          actorId: "scott",
        },
        now: "2026-05-13T12:03:00.000Z",
      }),
    ).toThrow("Artifact already exists.");
    expectNoEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});
