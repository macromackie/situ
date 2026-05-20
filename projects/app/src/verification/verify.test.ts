import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";

import { createAppActionContext } from "../actions/index.js";
import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import { verifySitu } from "./index.js";

test("verifies project completion evidence", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const project = context.repositories.projects.create({
      id: "project_verify" as SituId<"project">,
      name: "Verify Project",
      repositoryPath: "/tmp/verify",
      goalMarkdown: "Exercise verification summaries.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    const task = context.repositories.tasks.create({
      id: "task_verify" as SituId<"task">,
      projectId: project.id,
      title: "Verify task",
      bodyMarkdown: "Verify task body.",
      status: "done",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const experiment = context.repositories.experiments.create({
      id: "experiment_verify" as SituId<"experiment">,
      projectId: project.id,
      taskId: task.id,
      title: "Accepted experiment",
      summaryMarkdown: "Accepted experiment summary.",
      status: "accepted",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(
      verifySitu({
        database,
        projectId: project.id,
        generatedAt: "2026-05-13T13:00:00.000Z",
      }),
    ).toMatchObject({
      projectIds: [project.id],
      ok: false,
      checks: [
        { name: "has-project", ok: true },
        { name: "no-active-tasks", ok: true },
        { name: "no-active-experiments", ok: true },
        { name: "accepted-experiments-reviewed", ok: false },
        { name: "accepted-experiments-have-evidence", ok: false },
        { name: "final-report-present", ok: false },
      ],
    });

    context.repositories.reviews.create({
      id: "review_verify" as SituId<"review">,
      experimentId: experiment.id,
      revisionNumber: 1,
      decision: "approved",
      bodyMarkdown: "Approved.",
      reviewer: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:03:00.000Z",
    });
    context.repositories.measurements.create({
      id: "measurement_verify" as SituId<"measurement">,
      experimentId: experiment.id,
      revisionNumber: 1,
      metricName: "score",
      numericValue: 8.2,
      summaryMarkdown: "Reached target score.",
      measuredBy: {
        actorKind: "local_agent",
        actorId: "manager",
      },
      now: "2026-05-13T12:04:00.000Z",
    });
    context.repositories.reports.create({
      id: "report_verify" as SituId<"report">,
      projectId: project.id,
      target: {
        targetKind: "project",
        targetId: project.id,
      },
      title: "Final report",
      bodyMarkdown: "Final report body.",
      generatedBy: {
        actorKind: "local_agent",
        actorId: "manager",
      },
      now: "2026-05-13T12:05:00.000Z",
    });

    expect(
      verifySitu({
        database,
        projectId: project.id,
        generatedAt: "2026-05-13T13:00:00.000Z",
      }),
    ).toMatchObject({
      projectIds: [project.id],
      ok: true,
    });
  } finally {
    database.close();
  }
});
