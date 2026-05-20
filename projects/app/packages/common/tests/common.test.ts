import { expect, test } from "bun:test";

import { ValidationError } from "@situ/errors";

import {
  type ActorRef,
  type SituId,
  type TargetRef,
  compareIsoTimestamps,
  commonPackageName,
  createId,
  createSyncMetadata,
  diffIsoTimestampsInHours,
  nowTimestamp,
  touchSyncMetadata,
} from "../src/index.js";

test("exports the package marker", () => {
  const expectedPackageName: "common" = commonPackageName;
  expect(expectedPackageName).toBe("common");
});

test("creates ids with stable prefixes", () => {
  const projectId = createId({
    prefix: "project",
    randomUUID: () => "00000000-0000-4000-8000-000000000001",
  });

  const taskId = createId({
    prefix: "task",
    randomUUID: () => "00000000-0000-4000-8000-000000000002",
  });

  expect(projectId).toBe("project_00000000000040008000000000000001");
  expect(taskId).toBe("task_00000000000040008000000000000002");
  expect(projectId).not.toBe(taskId);

  const typedProjectId: SituId<"project"> = projectId;
  void typedProjectId;
});

test("keeps actor refs to product attribution fields", () => {
  const actor: ActorRef = {
    actorKind: "local_agent",
    actorId: "codex",
    displayName: "Codex",
  };

  expect(actor).toEqual({
    actorKind: "local_agent",
    actorId: "codex",
    displayName: "Codex",
  });
});

test("links target refs to ordinary product records", () => {
  const taskId = createId({
    prefix: "task",
    randomUUID: () => "00000000-0000-4000-8000-000000000003",
  });

  const target: TargetRef<"task"> = {
    targetKind: "task",
    targetId: taskId,
  };

  expect(target).toEqual({
    targetKind: "task",
    targetId: "task_00000000000040008000000000000003",
  });
});

test("creates UTC ISO timestamps", () => {
  const timestamp = nowTimestamp();

  expect(timestamp).toEndWith("Z");
  expect(Date.parse(timestamp)).not.toBeNaN();
});

test("creates sync metadata with matching timestamps", () => {
  const metadata = createSyncMetadata({
    now: "2026-05-13T08:00:00.000-04:00",
  });

  expect(metadata.createdAt).toBe(metadata.updatedAt);
  expect(metadata).toEqual({
    createdAt: "2026-05-13T12:00:00.000Z",
    updatedAt: "2026-05-13T12:00:00.000Z",
  });
});

test("touches sync metadata without changing the creation timestamp", () => {
  const metadata = createSyncMetadata({
    now: "2026-05-13T12:00:00.000Z",
  });

  const touchedMetadata = touchSyncMetadata({
    metadata,
    now: "2026-05-13T12:00:01.000Z",
  });

  expect(touchedMetadata.createdAt).toBe(metadata.createdAt);
  expect(touchedMetadata.updatedAt).toBe("2026-05-13T12:00:01.000Z");
  expect(
    compareIsoTimestamps({
      left: metadata.updatedAt,
      right: touchedMetadata.updatedAt,
    }),
  ).toBe(-1);
});

test("compares ISO timestamps by represented instant", () => {
  expect(
    compareIsoTimestamps({
      left: "2026-05-13T12:00:00.000Z",
      right: "2026-05-13T12:00:00.000Z",
    }),
  ).toBe(0);

  expect(
    compareIsoTimestamps({
      left: "2026-05-13T11:59:59.999Z",
      right: "2026-05-13T12:00:00.000Z",
    }),
  ).toBe(-1);

  expect(
    compareIsoTimestamps({
      left: "2026-05-13T08:00:00.000-04:00",
      right: "2026-05-13T11:59:59.999Z",
    }),
  ).toBe(1);
});

test("measures fractional hours between ISO timestamps", () => {
  expect(
    diffIsoTimestampsInHours({
      earlier: "2026-05-12T10:52:15.600Z",
      later: "2026-05-13T12:00:00.000Z",
    }),
  ).toBeCloseTo(25.129, 3);

  expect(
    diffIsoTimestampsInHours({
      earlier: "2026-05-13T08:00:00.000-04:00",
      later: "2026-05-13T13:30:00.000Z",
    }),
  ).toBe(1.5);

  expect(
    diffIsoTimestampsInHours({
      earlier: "2026-05-13T13:30:00.000Z",
      later: "2026-05-13T12:00:00.000Z",
    }),
  ).toBe(-1.5);
});

test("rejects invalid ISO timestamps during comparison", () => {
  expect(() =>
    compareIsoTimestamps({
      left: "not-a-timestamp",
      right: "2026-05-13T12:00:00.000Z",
    }),
  ).toThrow(ValidationError);
});

test("rejects invalid sync metadata timestamps", () => {
  expect(() =>
    createSyncMetadata({
      now: "not-a-timestamp",
    }),
  ).toThrow(ValidationError);
});

test("rejects invalid ISO timestamps during hour measurement", () => {
  expect(() =>
    diffIsoTimestampsInHours({
      earlier: "not-a-timestamp",
      later: "2026-05-13T12:00:00.000Z",
    }),
  ).toThrow(ValidationError);
});
