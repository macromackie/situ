import { expect, test } from "bun:test";

import type { SituId, TargetRef } from "@situ/common";

import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import {
  createAppActionContext,
  createReportAction,
  getReportAction,
  listRecentReportsAction,
  listReportsForProjectAction,
  listReportsForTargetAction,
} from "./index.js";

type CountRow = {
  readonly count: number;
};

function countRows(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
  readonly tableName: "comments" | "events" | "notifications";
}): number {
  return (
    input.database.query<CountRow, []>(`SELECT COUNT(*) AS count FROM ${input.tableName}`).get()
      ?.count ?? 0
  );
}

function expectNoCommentsEventsOrNotifications(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
}): void {
  expect(countRows({ database: input.database, tableName: "comments" })).toBe(0);
  expect(countRows({ database: input.database, tableName: "events" })).toBe(0);
  expect(countRows({ database: input.database, tableName: "notifications" })).toBe(0);
}

function createProject(input: {
  readonly context: ReturnType<typeof createAppActionContext>;
  readonly id?: SituId<"project">;
}): SituId<"project"> {
  const project = input.context.repositories.projects.create({
    id: input.id ?? ("project_report_actions" as SituId<"project">),
    name: "Report Actions Project",
    repositoryPath: "/tmp/report-actions-project",
    goalMarkdown: "Exercise report actions",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  });

  return project.id;
}

const taskTarget = {
  targetKind: "task",
  targetId: "task_report_actions",
} as TargetRef;

test("creates a passive report through the app action", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const projectBefore = context.repositories.projects.getById({ id: projectId });

    if (projectBefore === undefined) {
      throw new Error("Expected project fixture to exist.");
    }

    const result = createReportAction({
      context,
      id: "report_action_create" as SituId<"report">,
      projectId,
      target: taskTarget,
      title: "Final findings",
      bodyMarkdown: "The candidate is ready to ship.",
      generatedBy: {
        actorKind: "local_agent",
        actorId: "reporter-1",
        displayName: "Reporter 1",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(result.report).toMatchObject({
      id: "report_action_create",
      projectId,
      target: taskTarget,
      title: "Final findings",
      bodyMarkdown: "The candidate is ready to ship.",
      generatedBy: {
        actorKind: "local_agent",
        actorId: "reporter-1",
        displayName: "Reporter 1",
      },
      metadata: {
        createdAt: "2026-05-13T12:02:00.000Z",
        updatedAt: "2026-05-13T12:02:00.000Z",
      },
    });
    expect(context.repositories.reports.getById({ id: result.report.id })).toEqual(result.report);
    expect(context.repositories.projects.getById({ id: projectId })).toEqual(projectBefore);
    expectNoCommentsEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("creates a report for a missing target record when the parent project exists", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const missingTarget = {
      targetKind: "review",
      targetId: "review_missing_target",
    } as TargetRef;

    const result = createReportAction({
      context,
      id: "report_action_missing_target" as SituId<"report">,
      projectId,
      target: missingTarget,
      title: "Missing target report",
      bodyMarkdown: "The target may be created later.",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(result.report.target).toEqual(missingTarget);
    expect(context.repositories.reports.getById({ id: result.report.id })).toEqual(result.report);
    expectNoCommentsEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("gets an existing and missing report without emitting events or notifications", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const report = context.repositories.reports.create({
      id: "report_action_get" as SituId<"report">,
      projectId,
      target: taskTarget,
      title: "Existing report",
      bodyMarkdown: "Existing report body.",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(getReportAction({ context, id: report.id })).toEqual(report);
    expect(
      getReportAction({
        context,
        id: "report_missing" as SituId<"report">,
      }),
    ).toBeUndefined();
    expectNoCommentsEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("lists reports for a project", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const otherProjectId = createProject({
      context,
      id: "project_report_actions_other" as SituId<"project">,
    });
    const matching = context.repositories.reports.create({
      id: "report_action_list_project_match" as SituId<"report">,
      projectId,
      target: taskTarget,
      title: "Project report",
      bodyMarkdown: "Report for the selected project.",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });
    context.repositories.reports.create({
      id: "report_action_list_project_miss" as SituId<"report">,
      projectId: otherProjectId,
      target: taskTarget,
      title: "Other project report",
      bodyMarkdown: "Report for another project.",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:03:00.000Z",
    });

    expect(
      listReportsForProjectAction({
        context,
        projectId,
      }),
    ).toEqual([matching]);
    expectNoCommentsEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("lists reports for a target", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const matching = context.repositories.reports.create({
      id: "report_action_list_target_match" as SituId<"report">,
      projectId,
      target: taskTarget,
      title: "Target report",
      bodyMarkdown: "Report for the selected target.",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });
    context.repositories.reports.create({
      id: "report_action_list_target_miss" as SituId<"report">,
      projectId,
      target: {
        targetKind: "review",
        targetId: "review_report_actions",
      } as TargetRef,
      title: "Review report",
      bodyMarkdown: "Report for another target.",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:03:00.000Z",
    });

    expect(
      listReportsForTargetAction({
        context,
        target: taskTarget,
      }),
    ).toEqual([matching]);
    expectNoCommentsEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("lists recent reports", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    const first = context.repositories.reports.create({
      id: "report_action_recent_first" as SituId<"report">,
      projectId,
      target: taskTarget,
      title: "First report",
      bodyMarkdown: "First report body.",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });
    const second = context.repositories.reports.create({
      id: "report_action_recent_second" as SituId<"report">,
      projectId,
      target: taskTarget,
      title: "Second report",
      bodyMarkdown: "Second report body.",
      generatedBy: {
        actorKind: "local_agent",
        actorId: "reporter-1",
      },
      now: "2026-05-13T12:03:00.000Z",
    });

    expect(listRecentReportsAction({ context, limit: 1 })).toEqual([second]);
    expect(listRecentReportsAction({ context })).toEqual([second, first]);
    expectNoCommentsEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("repository errors propagate from the report app action", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const projectId = createProject({ context });
    createReportAction({
      context,
      id: "report_action_duplicate" as SituId<"report">,
      projectId,
      target: taskTarget,
      title: "First report",
      bodyMarkdown: "First report body.",
      generatedBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(() =>
      createReportAction({
        context,
        id: "report_action_duplicate" as SituId<"report">,
        projectId,
        target: taskTarget,
        title: "Duplicate report",
        bodyMarkdown: "Duplicate report body.",
        generatedBy: {
          actorKind: "human",
          actorId: "scott",
        },
        now: "2026-05-13T12:03:00.000Z",
      }),
    ).toThrow("Report already exists.");
    expectNoCommentsEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});
