import { expect, test } from "bun:test";

import type { SituId, TargetKind, TargetRef } from "@situ/common";
import { ConflictError, NotFoundError } from "@situ/errors";

import { createAppActionContext } from "../actions/context.js";
import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import {
  collectProjectReportSnapshot,
  generateProjectReportHtml,
  generateProjectReportMarkdown,
  renderProjectReportHtml,
  renderProjectReportMarkdown,
} from "./index.js";

type TestContext = ReturnType<typeof createAppActionContext>;
type TestDatabase = ReturnType<typeof openAppDatabase>;
type CountedTable =
  | "projects"
  | "tasks"
  | "baselines"
  | "experiments"
  | "measurements"
  | "artifacts"
  | "reviews"
  | "reports"
  | "comments"
  | "events"
  | "notifications";

type CountRow = {
  readonly count: number;
};

type PopulatedFixture = {
  readonly projectId: SituId<"project">;
  readonly baselineId: SituId<"baseline">;
  readonly firstTaskId: SituId<"task">;
  readonly secondTaskId: SituId<"task">;
  readonly firstExperimentId: SituId<"experiment">;
  readonly secondExperimentId: SituId<"experiment">;
  readonly measurementId: SituId<"measurement">;
  readonly reviewId: SituId<"review">;
};

function target<TKind extends TargetKind>(
  targetKind: TKind,
  targetId: SituId<TKind>,
): TargetRef<TKind> {
  return {
    targetKind,
    targetId,
  };
}

function countRows(input: { readonly database: TestDatabase; readonly tableName: CountedTable }) {
  return (
    input.database.query<CountRow, []>(`SELECT COUNT(*) AS count FROM ${input.tableName}`).get()
      ?.count ?? 0
  );
}

function countReportGenerationTables(input: {
  readonly database: TestDatabase;
}): Record<CountedTable, number> {
  return {
    projects: countRows({ database: input.database, tableName: "projects" }),
    tasks: countRows({ database: input.database, tableName: "tasks" }),
    baselines: countRows({ database: input.database, tableName: "baselines" }),
    experiments: countRows({ database: input.database, tableName: "experiments" }),
    measurements: countRows({ database: input.database, tableName: "measurements" }),
    artifacts: countRows({ database: input.database, tableName: "artifacts" }),
    reviews: countRows({ database: input.database, tableName: "reviews" }),
    reports: countRows({ database: input.database, tableName: "reports" }),
    comments: countRows({ database: input.database, tableName: "comments" }),
    events: countRows({ database: input.database, tableName: "events" }),
    notifications: countRows({ database: input.database, tableName: "notifications" }),
  };
}

function createPopulatedFixture(input: { readonly context: TestContext }): PopulatedFixture {
  const project = input.context.repositories.projects.create({
    id: "project_report_generation" as SituId<"project">,
    name: "Report Generation Project",
    repositoryPath: "/tmp/report-generation",
    goalMarkdown: "Compare candidate implementations.",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  });
  const firstTask = input.context.repositories.tasks.create({
    id: "task_report_generation_first" as SituId<"task">,
    projectId: project.id,
    title: "First task",
    bodyMarkdown: "Investigate the primary candidate.",
    status: "in_progress",
    assignedTo: {
      actorKind: "local_agent",
      actorId: "worker-1",
      displayName: "Worker 1",
    },
    createdBy: {
      actorKind: "human",
      actorId: "scott",
      displayName: "Scott",
    },
    now: "2026-05-13T12:01:00.000Z",
  });
  const secondTask = input.context.repositories.tasks.create({
    id: "task_report_generation_second" as SituId<"task">,
    projectId: project.id,
    title: "Second task",
    bodyMarkdown: "Keep the follow-up work visible.",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:02:00.000Z",
  });
  const baseline = input.context.repositories.baselines.create({
    id: "baseline_report_generation" as SituId<"baseline">,
    projectId: project.id,
    title: "Native baseline",
    summaryMarkdown: "Unmodified benchmark output.",
    createdBy: {
      actorKind: "local_agent",
      actorId: "manager",
      displayName: "Manager",
    },
    now: "2026-05-13T12:02:30.000Z",
  });
  input.context.repositories.measurements.create({
    id: "measurement_report_generation_baseline" as SituId<"measurement">,
    baselineId: baseline.id,
    metricName: "latency_ms",
    numericValue: 57,
    unit: "ms",
    summaryMarkdown: "Baseline latency.",
    measuredBy: {
      actorKind: "local_agent",
      actorId: "manager",
      displayName: "Manager",
    },
    now: "2026-05-13T12:02:40.000Z",
  });
  const firstExperiment = input.context.repositories.experiments.create({
    id: "experiment_report_generation_first" as SituId<"experiment">,
    projectId: project.id,
    taskId: firstTask.id,
    title: "Primary candidate",
    summaryMarkdown: "The first candidate changes the core path.",
    status: "running",
    baseRef: "main",
    branchName: "situ/report-generation",
    worktreePath: "/tmp/report-generation-worktree",
    assignedTo: {
      actorKind: "local_agent",
      actorId: "worker-1",
      displayName: "Worker 1",
    },
    createdBy: {
      actorKind: "local_agent",
      actorId: "worker-1",
      displayName: "Worker 1",
    },
    now: "2026-05-13T12:03:00.000Z",
  });
  const secondExperiment = input.context.repositories.experiments.create({
    id: "experiment_report_generation_second" as SituId<"experiment">,
    projectId: project.id,
    taskId: secondTask.id,
    title: "Follow-up candidate",
    summaryMarkdown: "The second candidate is only linked to the second task.",
    createdBy: {
      actorKind: "local_agent",
      actorId: "worker-2",
    },
    now: "2026-05-13T12:04:00.000Z",
  });
  const measurement = input.context.repositories.measurements.create({
    id: "measurement_report_generation" as SituId<"measurement">,
    experimentId: firstExperiment.id,
    revisionNumber: 1,
    metricName: "latency_ms",
    numericValue: 42,
    unit: "ms",
    summaryMarkdown: "Latency improved.",
    detailsMarkdown: "Measured with the local benchmark.",
    measuredBy: {
      actorKind: "local_agent",
      actorId: "verifier-1",
      displayName: "Verifier 1",
    },
    now: "2026-05-13T12:05:00.000Z",
  });
  const review = input.context.repositories.reviews.create({
    id: "review_report_generation" as SituId<"review">,
    experimentId: firstExperiment.id,
    revisionNumber: 1,
    decision: "changes_requested",
    bodyMarkdown: "Please tighten the regression evidence.",
    reviewer: {
      actorKind: "human",
      actorId: "reviewer-1",
      displayName: "Reviewer 1",
    },
    now: "2026-05-13T12:06:00.000Z",
  });

  input.context.repositories.comments.create({
    id: "comment_report_generation_project" as SituId<"comment">,
    target: target("project", project.id),
    bodyMarkdown: "Project comment body.",
    author: {
      actorKind: "human",
      actorId: "researcher-1",
      displayName: "Researcher 1",
    },
    now: "2026-05-13T12:07:00.000Z",
  });
  input.context.repositories.events.create({
    id: "event_report_generation_task" as SituId<"event">,
    target: target("task", firstTask.id),
    summaryMarkdown: "Task moved into progress.",
    bodyMarkdown: "The candidate is ready for measurement.",
    actor: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:08:00.000Z",
  });
  input.context.repositories.artifacts.create({
    id: "artifact_report_generation_experiment" as SituId<"artifact">,
    target: target("experiment", firstExperiment.id),
    title: "Benchmark output",
    summaryMarkdown: "Benchmark output summary.",
    uri: "file:///tmp/report-generation/benchmark.txt",
    mediaType: "text/plain",
    byteSize: 128,
    sha256: "a".repeat(64),
    createdBy: {
      actorKind: "local_agent",
      actorId: "worker-1",
    },
    now: "2026-05-13T12:09:00.000Z",
  });
  input.context.repositories.reports.create({
    id: "report_report_generation_measurement" as SituId<"report">,
    projectId: project.id,
    target: target("measurement", measurement.id),
    title: "Measurement note",
    bodyMarkdown: "Measurement report body.",
    generatedBy: {
      actorKind: "local_agent",
      actorId: "reporter-1",
      displayName: "Reporter 1",
    },
    now: "2026-05-13T12:10:00.000Z",
  });
  input.context.repositories.comments.create({
    id: "comment_report_generation_measurement" as SituId<"comment">,
    target: target("measurement", measurement.id),
    bodyMarkdown: "Measurement comment body.",
    author: {
      actorKind: "human",
      actorId: "reviewer-1",
    },
    now: "2026-05-13T12:11:00.000Z",
  });
  input.context.repositories.reports.create({
    id: "report_report_generation_review" as SituId<"report">,
    projectId: project.id,
    target: target("review", review.id),
    title: "Review follow-up",
    bodyMarkdown: "Review report body.",
    generatedBy: {
      actorKind: "human",
      actorId: "reviewer-1",
    },
    now: "2026-05-13T12:12:00.000Z",
  });
  input.context.repositories.notifications.create({
    id: "notification_report_generation" as SituId<"notification">,
    recipient: {
      recipientId: "scott",
    },
    target: target("project", project.id),
    createdBy: {
      actorKind: "system",
      actorId: "situ",
    },
    summaryMarkdown: "Inbox-only summary.",
    bodyMarkdown: "Inbox-only body.",
    now: "2026-05-13T12:13:00.000Z",
  });

  return {
    projectId: project.id,
    baselineId: baseline.id,
    firstTaskId: firstTask.id,
    secondTaskId: secondTask.id,
    firstExperimentId: firstExperiment.id,
    secondExperimentId: secondExperiment.id,
    measurementId: measurement.id,
    reviewId: review.id,
  };
}

test("missing project returns NotFoundError with documented message", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });

    try {
      collectProjectReportSnapshot({
        context,
        projectId: "project_report_generation_missing" as SituId<"project">,
      });
      throw new Error("Expected collectProjectReportSnapshot to throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).message).toBe("Project was not found.");
      expect((error as NotFoundError).details).toEqual({
        id: "project_report_generation_missing",
      });
    }
  } finally {
    database.close();
  }
});

test("inconsistent experiment task ownership returns ConflictError", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const project = context.repositories.projects.create({
      id: "project_report_generation_inconsistent" as SituId<"project">,
      name: "Inconsistent Project",
      repositoryPath: "/tmp/report-generation-inconsistent",
      goalMarkdown: "Expose inconsistent experiment state.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    const otherProject = context.repositories.projects.create({
      id: "project_report_generation_other" as SituId<"project">,
      name: "Other Project",
      repositoryPath: "/tmp/report-generation-other",
      goalMarkdown: "Own the other task.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    const otherTask = context.repositories.tasks.create({
      id: "task_report_generation_other" as SituId<"task">,
      projectId: otherProject.id,
      title: "Other task",
      bodyMarkdown: "This task belongs to the other project.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });
    const experiment = context.repositories.experiments.create({
      id: "experiment_report_generation_inconsistent" as SituId<"experiment">,
      projectId: project.id,
      taskId: otherTask.id,
      title: "Inconsistent experiment",
      summaryMarkdown: "This experiment points at another project's task.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:03:00.000Z",
    });

    try {
      collectProjectReportSnapshot({
        context,
        projectId: project.id,
      });
      throw new Error("Expected collectProjectReportSnapshot to throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).message).toBe(
        "Project report could not be generated because experiment state is inconsistent.",
      );
      expect((error as ConflictError).details).toEqual({
        projectId: project.id,
        experimentId: experiment.id,
        taskId: otherTask.id,
      });
    }
  } finally {
    database.close();
  }
});

test("snapshot collection includes nested records and target attachments", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const fixture = createPopulatedFixture({ context });
    const snapshot = collectProjectReportSnapshot({
      context,
      projectId: fixture.projectId,
    });

    expect(snapshot.project.id).toBe(fixture.projectId);
    expect(snapshot.baselines.map((baselineSnapshot) => baselineSnapshot.baseline.id)).toEqual([
      fixture.baselineId,
    ]);
    expect(snapshot.target.comments.map((comment) => comment.id)).toEqual([
      "comment_report_generation_project",
    ]);
    expect(snapshot.tasks.map((taskSnapshot) => taskSnapshot.task.id)).toEqual([
      fixture.firstTaskId,
      fixture.secondTaskId,
    ]);
    expect(snapshot.tasks[0]?.target.events.map((event) => event.id)).toEqual([
      "event_report_generation_task",
    ]);
    expect(
      snapshot.tasks[0]?.experiments.map((experimentSnapshot) => experimentSnapshot.experiment.id),
    ).toEqual([fixture.firstExperimentId]);
    expect(
      snapshot.tasks[1]?.experiments.map((experimentSnapshot) => experimentSnapshot.experiment.id),
    ).toEqual([fixture.secondExperimentId]);

    const firstExperiment = snapshot.tasks[0]?.experiments[0];

    expect(firstExperiment?.target.artifacts.map((artifact) => artifact.id)).toEqual([
      "artifact_report_generation_experiment",
    ]);
    expect(firstExperiment?.measurements.map((measurement) => measurement.measurement.id)).toEqual([
      fixture.measurementId,
    ]);
    expect(firstExperiment?.measurements[0]?.target.comments.map((comment) => comment.id)).toEqual([
      "comment_report_generation_measurement",
    ]);
    expect(firstExperiment?.measurements[0]?.target.reports.map((report) => report.id)).toEqual([
      "report_report_generation_measurement",
    ]);
    expect(firstExperiment?.reviews.map((review) => review.review.id)).toEqual([fixture.reviewId]);
    expect(firstExperiment?.reviews[0]?.target.reports.map((report) => report.id)).toEqual([
      "report_report_generation_review",
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("Inbox-only");
  } finally {
    database.close();
  }
});

test("rendering an empty project produces stable Markdown with no task output", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const project = context.repositories.projects.create({
      id: "project_report_generation_empty" as SituId<"project">,
      name: "Empty Report Project",
      repositoryPath: "/tmp/report-generation-empty",
      goalMarkdown: "Study empty report generation.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
        displayName: "Scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    const snapshot = collectProjectReportSnapshot({
      context,
      projectId: project.id,
    });

    expect(renderProjectReportMarkdown({ snapshot })).toBe(`# Project Report: Empty Report Project

- Project: project_report_generation_empty
- Status: active
- Repository: /tmp/report-generation-empty
- Created: 2026-05-13T12:00:00.000Z
- Created by: Scott

## Goal

Study empty report generation.

## Project Attachments

Comments

None.

Events

None.

Artifacts

None.

Reports

None.

## Baselines

None.

## Tasks

None.
`);
  } finally {
    database.close();
  }
});

test("rendering a populated snapshot includes project state and nested evidence", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const fixture = createPopulatedFixture({ context });
    const snapshot = collectProjectReportSnapshot({
      context,
      projectId: fixture.projectId,
    });
    const markdown = renderProjectReportMarkdown({
      snapshot,
      generatedAt: "2026-05-13T12:30:00.000Z",
    });

    expect(markdown).toContain("- Created by: human/scott");
    expect(markdown).toContain("- Generated: 2026-05-13T12:30:00.000Z");
    expect(markdown).toContain("### Baseline: Native baseline (baseline_report_generation)");
    expect(markdown).toContain(
      "- measurement_report_generation_baseline baseline latency_ms: 57 ms",
    );
    expect(markdown).toContain("Investigate the primary candidate.");
    expect(markdown).toContain("- Worktree: /tmp/report-generation-worktree");
    expect(markdown).toContain("- measurement_report_generation r1 latency_ms: 42 ms");
    expect(markdown).toContain("  Measured with the local benchmark.");
    expect(markdown).toContain("- review_report_generation r1 changes_requested by Reviewer 1");
    expect(markdown).toContain("  Please tighten the regression evidence.");
    expect(markdown).toContain(
      "- 2026-05-13T12:07:00.000Z Researcher 1 (comment_report_generation_project): Project comment body.",
    );
    expect(markdown).toContain(
      "- 2026-05-13T12:08:00.000Z human/scott (event_report_generation_task): Task moved into progress.",
    );
    expect(markdown).toContain("  The candidate is ready for measurement.");
    expect(markdown).toContain("- Benchmark output (artifact_report_generation_experiment)");
    expect(markdown).toContain(
      "  mediaType=text/plain byteSize=128 sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(markdown).toContain(
      "- Measurement note (report_report_generation_measurement) generated by Reporter 1",
    );
    expect(markdown).toContain("  Attachments:");
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  } finally {
    database.close();
  }
});

test("rendering a populated snapshot produces a standalone visual research report", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const fixture = createPopulatedFixture({ context });
    const snapshot = collectProjectReportSnapshot({
      context,
      projectId: fixture.projectId,
    });
    const html = renderProjectReportHtml({
      snapshot,
      generatedAt: "2026-05-13T12:30:00.000Z",
    });

    expect(html.startsWith("<!doctype html>\n")).toBe(true);
    expect(html.endsWith("\n")).toBe(true);
    expect(html.endsWith("\n\n")).toBe(false);
    expect(html).toContain("<title>Report Generation Project — situ research report</title>");
    expect(html).toContain("Situ research report");

    // Stable section anchors named in ADR 0096.
    for (const anchor of [
      "masthead",
      "figure-progress",
      "metadata",
      "abstract",
      "goal",
      "progress",
      "lineage",
      "parallelism",
      "outcomes",
      "evidence",
      "appendix",
      "colophon",
    ]) {
      expect(html).toContain(`id="${anchor}"`);
    }

    // Section headings.
    expect(html).toContain("Abstract");
    expect(html).toContain("Goal and method");
    expect(html).toContain("Progress");
    expect(html).toContain("Branch lineage");
    expect(html).toContain("Parallel work");
    expect(html).toContain("Experiment outcomes");
    expect(html).toContain("Evidence");
    expect(html).toContain("Appendix");

    // Captioned figures.
    expect(html).toContain("Figure 1.");
    expect(html).toContain("Figure 3.");
    expect(html).toContain("Figure 4.");

    // Required structural elements.
    expect(html).toContain('<figure class="hero-figure"');
    expect(html).toContain('<figure class="lineage-figure"');
    expect(html).toContain('<figure class="swimlane-figure"');
    expect(html).toContain('<table class="outcomes-table">');

    // Record-derived strings from the fixture.
    expect(html).toContain("latency_ms");
    expect(html).toContain("Native baseline");
    expect(html).toContain("Primary candidate");
    expect(html).toContain("situ/report-generation");
    expect(html).toContain("/tmp/report-generation-worktree");
    expect(html).toContain("Verifier 1");
    expect(html).toContain("Benchmark output");
    expect(html).toContain("2026-05-13T12:30:00.000Z");

    // Static document constraints.
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
  } finally {
    database.close();
  }
});

test("visual report rendering escapes HTML-shaped record text", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const project = context.repositories.projects.create({
      id: "project_report_generation_escape" as SituId<"project">,
      name: "Escape <Project>",
      repositoryPath: "/tmp/report-generation-escape",
      goalMarkdown: "Inspect <script>alert(1)</script> safely.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    const snapshot = collectProjectReportSnapshot({
      context,
      projectId: project.id,
    });
    const html = renderProjectReportHtml({ snapshot });

    expect(html).toContain("Escape &lt;Project&gt;");
    expect(html).toContain("Inspect &lt;script&gt;alert(1)&lt;/script&gt; safely.");
    expect(html).not.toContain("<script>alert(1)</script>");
  } finally {
    database.close();
  }
});

test("generatedAt is included only when provided", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const fixture = createPopulatedFixture({ context });
    const snapshot = collectProjectReportSnapshot({
      context,
      projectId: fixture.projectId,
    });

    expect(renderProjectReportMarkdown({ snapshot })).not.toContain("- Generated:");
    expect(
      renderProjectReportMarkdown({
        snapshot,
        generatedAt: "2026-05-13T12:30:00.000Z",
      }),
    ).toContain("- Generated: 2026-05-13T12:30:00.000Z");
  } finally {
    database.close();
  }
});

test("generateProjectReportMarkdown matches explicit collection and rendering", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const fixture = createPopulatedFixture({ context });
    const generatedAt = "2026-05-13T12:30:00.000Z";
    const snapshot = collectProjectReportSnapshot({
      context,
      projectId: fixture.projectId,
    });

    expect(
      generateProjectReportMarkdown({
        context,
        projectId: fixture.projectId,
        generatedAt,
      }),
    ).toBe(
      renderProjectReportMarkdown({
        snapshot,
        generatedAt,
      }),
    );
  } finally {
    database.close();
  }
});

test("generateProjectReportHtml matches explicit collection and rendering (no authored report)", async () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const fixture = createPopulatedFixture({ context });
    const generatedAt = "2026-05-13T12:30:00.000Z";
    const snapshot = collectProjectReportSnapshot({
      context,
      projectId: fixture.projectId,
    });

    expect(
      await generateProjectReportHtml({
        context,
        projectId: fixture.projectId,
        generatedAt,
      }),
    ).toBe(
      renderProjectReportHtml({
        snapshot,
        generatedAt,
      }),
    );
  } finally {
    database.close();
  }
});

test("generation does not create product records", async () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const fixture = createPopulatedFixture({ context });
    const beforeCounts = countReportGenerationTables({ database });

    generateProjectReportMarkdown({
      context,
      projectId: fixture.projectId,
      generatedAt: "2026-05-13T12:30:00.000Z",
    });
    await generateProjectReportHtml({
      context,
      projectId: fixture.projectId,
      generatedAt: "2026-05-13T12:30:00.000Z",
    });

    expect(countReportGenerationTables({ database })).toEqual(beforeCounts);
  } finally {
    database.close();
  }
});
