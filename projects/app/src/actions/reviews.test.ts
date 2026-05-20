import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";

import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import {
  createAppActionContext,
  createReviewAction,
  getReviewAction,
  listRecentReviewsAction,
  listReviewsAction,
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
    id: input.id ?? ("project_review_actions" as SituId<"project">),
    name: "Review Actions Project",
    repositoryPath: "/tmp/review-actions-project",
    goalMarkdown: "Exercise review actions",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  });

  return project.id;
}

function createTask(input: {
  readonly context: ReturnType<typeof createAppActionContext>;
  readonly projectId: SituId<"project">;
  readonly id?: SituId<"task">;
}): SituId<"task"> {
  const task = input.context.repositories.tasks.create({
    id: input.id ?? ("task_review_actions" as SituId<"task">),
    projectId: input.projectId,
    title: "Review Actions Task",
    bodyMarkdown: "Exercise review actions",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  });

  return task.id;
}

function createExperiment(input: {
  readonly context: ReturnType<typeof createAppActionContext>;
  readonly projectId: SituId<"project">;
  readonly taskId: SituId<"task">;
  readonly id?: SituId<"experiment">;
}): SituId<"experiment"> {
  const experiment = input.context.repositories.experiments.create({
    id: input.id ?? ("experiment_review_actions" as SituId<"experiment">),
    projectId: input.projectId,
    taskId: input.taskId,
    title: "Review Action",
    summaryMarkdown: "Initial summary",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:01:00.000Z",
  });

  return experiment.id;
}

function createExperimentFixture(input: {
  readonly context: ReturnType<typeof createAppActionContext>;
  readonly experimentId?: SituId<"experiment">;
}): SituId<"experiment"> {
  const projectId = createProject({
    context: input.context,
    id:
      input.experimentId === undefined
        ? undefined
        : (`project_${input.experimentId}` as SituId<"project">),
  });
  const taskId = createTask({
    context: input.context,
    projectId,
    id:
      input.experimentId === undefined
        ? undefined
        : (`task_${input.experimentId}` as SituId<"task">),
  });

  return createExperiment({
    context: input.context,
    projectId,
    taskId,
    id: input.experimentId,
  });
}

test("creates a passive review through the app action", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const experimentId = createExperimentFixture({ context });
    const experimentBefore = context.repositories.experiments.getById({ id: experimentId });

    if (experimentBefore === undefined) {
      throw new Error("Expected experiment fixture to exist.");
    }

    const taskBefore = context.repositories.tasks.getById({ id: experimentBefore.taskId });

    if (taskBefore === undefined) {
      throw new Error("Expected task fixture to exist.");
    }

    const result = createReviewAction({
      context,
      id: "review_action_create" as SituId<"review">,
      experimentId,
      revisionNumber: 2,
      decision: "approved",
      bodyMarkdown: "Looks ready.",
      reviewer: {
        actorKind: "local_agent",
        actorId: "reviewer-1",
        displayName: "Reviewer 1",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(result.review).toMatchObject({
      id: "review_action_create",
      experimentId,
      revisionNumber: 2,
      decision: "approved",
      bodyMarkdown: "Looks ready.",
      reviewer: {
        actorKind: "local_agent",
        actorId: "reviewer-1",
        displayName: "Reviewer 1",
      },
      metadata: {
        createdAt: "2026-05-13T12:02:00.000Z",
        updatedAt: "2026-05-13T12:02:00.000Z",
      },
    });
    expect(context.repositories.reviews.getById({ id: result.review.id })).toEqual(result.review);
    expect(context.repositories.experiments.getById({ id: experimentId })).toEqual(
      experimentBefore,
    );
    expect(context.repositories.tasks.getById({ id: experimentBefore.taskId })).toEqual(taskBefore);
    expectNoCommentsEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("gets an existing and missing review without emitting events or notifications", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const experimentId = createExperimentFixture({ context });
    const review = context.repositories.reviews.create({
      id: "review_action_get" as SituId<"review">,
      experimentId,
      revisionNumber: 1,
      decision: "commented",
      bodyMarkdown: "Leaving a non-blocking note.",
      reviewer: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(getReviewAction({ context, id: review.id })).toEqual(review);
    expect(
      getReviewAction({
        context,
        id: "review_missing" as SituId<"review">,
      }),
    ).toBeUndefined();
    expectNoCommentsEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("lists reviews for an experiment with combined revision and decision filters", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const experimentId = createExperimentFixture({ context });
    const otherExperimentId = createExperimentFixture({
      context,
      experimentId: "experiment_review_other" as SituId<"experiment">,
    });
    const matching = context.repositories.reviews.create({
      id: "review_action_list_match" as SituId<"review">,
      experimentId,
      revisionNumber: 2,
      decision: "changes_requested",
      bodyMarkdown: "Please address the failing case.",
      reviewer: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });
    context.repositories.reviews.create({
      id: "review_action_list_revision_miss" as SituId<"review">,
      experimentId,
      revisionNumber: 1,
      decision: "changes_requested",
      bodyMarkdown: "Wrong revision.",
      reviewer: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:03:00.000Z",
    });
    context.repositories.reviews.create({
      id: "review_action_list_decision_miss" as SituId<"review">,
      experimentId,
      revisionNumber: 2,
      decision: "approved",
      bodyMarkdown: "Wrong decision.",
      reviewer: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:04:00.000Z",
    });
    context.repositories.reviews.create({
      id: "review_action_list_experiment_miss" as SituId<"review">,
      experimentId: otherExperimentId,
      revisionNumber: 2,
      decision: "changes_requested",
      bodyMarkdown: "Wrong experiment.",
      reviewer: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:05:00.000Z",
    });

    expect(
      listReviewsAction({
        context,
        experimentId,
        revisionNumber: 2,
        decision: "changes_requested",
      }),
    ).toEqual([matching]);
    expectNoCommentsEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("lists recent reviews", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const experimentId = createExperimentFixture({ context });
    const first = context.repositories.reviews.create({
      id: "review_action_recent_first" as SituId<"review">,
      experimentId,
      revisionNumber: 1,
      decision: "commented",
      bodyMarkdown: "First review.",
      reviewer: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });
    const second = context.repositories.reviews.create({
      id: "review_action_recent_second" as SituId<"review">,
      experimentId,
      revisionNumber: 2,
      decision: "approved",
      bodyMarkdown: "Second review.",
      reviewer: {
        actorKind: "local_agent",
        actorId: "reviewer-1",
      },
      now: "2026-05-13T12:03:00.000Z",
    });

    expect(listRecentReviewsAction({ context, limit: 1 })).toEqual([second]);
    expect(listRecentReviewsAction({ context })).toEqual([second, first]);
    expectNoCommentsEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});

test("repository errors propagate from the review app action", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const experimentId = createExperimentFixture({ context });
    createReviewAction({
      context,
      id: "review_action_duplicate" as SituId<"review">,
      experimentId,
      revisionNumber: 1,
      decision: "approved",
      bodyMarkdown: "First review.",
      reviewer: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(() =>
      createReviewAction({
        context,
        id: "review_action_duplicate" as SituId<"review">,
        experimentId,
        revisionNumber: 1,
        decision: "commented",
        bodyMarkdown: "Duplicate review.",
        reviewer: {
          actorKind: "human",
          actorId: "scott",
        },
        now: "2026-05-13T12:03:00.000Z",
      }),
    ).toThrow("Review could not be created because it conflicts with existing state.");
    expectNoCommentsEventsOrNotifications({ database });
  } finally {
    database.close();
  }
});
