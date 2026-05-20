import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";
import { ValidationError } from "@situ/errors";

import { createAppActionContext } from "../actions/index.js";
import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import { setLastMutationId } from "./client-mutations.js";
import { processReplicachePull } from "./pull.js";
import type { JsonValue, ReplicachePullRequest } from "./types.js";
import { parseReplicachePullRequest } from "./validation.js";

type CountRow = {
  readonly count: number;
};

type ProductTableName =
  | "projects"
  | "tasks"
  | "baselines"
  | "experiments"
  | "measurements"
  | "reviews"
  | "artifacts"
  | "reports"
  | "comments"
  | "events"
  | "notifications";

function pull(input?: {
  readonly clientGroupID?: string;
  readonly cookie?: JsonValue;
}): ReplicachePullRequest {
  return {
    pullVersion: 1,
    clientGroupID: input?.clientGroupID ?? "client-group-1",
    cookie: input?.cookie ?? null,
    profileID: "profile-1",
    schemaVersion: "schema-1",
  };
}

function countRows(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
  readonly tableName: ProductTableName;
}): number {
  return (
    input.database.query<CountRow, []>(`SELECT COUNT(*) AS count FROM ${input.tableName}`).get()
      ?.count ?? 0
  );
}

function productCounts(input: {
  readonly database: ReturnType<typeof openAppDatabase>;
}): Record<ProductTableName, number> {
  return {
    projects: countRows({ database: input.database, tableName: "projects" }),
    tasks: countRows({ database: input.database, tableName: "tasks" }),
    baselines: countRows({ database: input.database, tableName: "baselines" }),
    experiments: countRows({ database: input.database, tableName: "experiments" }),
    measurements: countRows({ database: input.database, tableName: "measurements" }),
    reviews: countRows({ database: input.database, tableName: "reviews" }),
    artifacts: countRows({ database: input.database, tableName: "artifacts" }),
    reports: countRows({ database: input.database, tableName: "reports" }),
    comments: countRows({ database: input.database, tableName: "comments" }),
    events: countRows({ database: input.database, tableName: "events" }),
    notifications: countRows({ database: input.database, tableName: "notifications" }),
  };
}

test("builds a full reset patch for projects, tasks, baselines, experiments, evidence, reports, comments, events, and notifications", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });

    context.repositories.projects.create({
      id: "project_pull_1" as SituId<"project">,
      name: "Pull Project",
      repositoryPath: "/tmp/pull-project",
      goalMarkdown: "Exercise Replicache pull.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    context.repositories.tasks.create({
      id: "task_pull_done" as SituId<"task">,
      projectId: "project_pull_1" as SituId<"project">,
      title: "Pulled Done Task",
      bodyMarkdown: "A terminal task should still be pulled.",
      status: "done",
      createdBy: {
        actorKind: "local_agent",
        actorId: "worker-1",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    context.repositories.projects.archive({
      id: "project_pull_1" as SituId<"project">,
      now: "2026-05-13T12:02:00.000Z",
    });
    context.repositories.baselines.create({
      id: "baseline_pull_native" as SituId<"baseline">,
      projectId: "project_pull_1" as SituId<"project">,
      title: "Native baseline",
      summaryMarkdown: "Unmodified harness output.",
      createdBy: {
        actorKind: "local_agent",
        actorId: "baseline-manager",
      },
      now: "2026-05-13T12:02:15.000Z",
    });
    context.repositories.experiments.create({
      id: "experiment_pull_ready" as SituId<"experiment">,
      projectId: "project_pull_1" as SituId<"project">,
      taskId: "task_pull_done" as SituId<"task">,
      title: "Try beam search",
      summaryMarkdown: "Improve the scorer pass.",
      status: "ready_for_review",
      baseRef: "main",
      branchName: "experiment/beam-search",
      worktreePath: "/tmp/situ/worktrees/beam-search",
      assignedTo: {
        actorKind: "local_agent",
        actorId: "verifier-1",
        displayName: "Verifier 1",
      },
      createdBy: {
        actorKind: "local_agent",
        actorId: "scientist-1",
        displayName: "Scientist 1",
      },
      now: "2026-05-13T12:02:30.000Z",
    });
    context.repositories.experiments.create({
      id: "experiment_pull_minimal" as SituId<"experiment">,
      projectId: "project_pull_1" as SituId<"project">,
      taskId: "task_pull_done" as SituId<"task">,
      title: "Minimal experiment",
      summaryMarkdown: "No optional refs.",
      createdBy: {
        actorKind: "local_agent",
        actorId: "scientist-2",
      },
      now: "2026-05-13T12:02:45.000Z",
    });
    context.repositories.measurements.create({
      id: "measurement_pull_score" as SituId<"measurement">,
      experimentId: "experiment_pull_ready" as SituId<"experiment">,
      revisionNumber: 1,
      metricName: "goal score",
      numericValue: 8.7,
      unit: "points",
      summaryMarkdown: "Improved the target score.",
      detailsMarkdown: "Measured against the spelling-corrector fixture.",
      measuredBy: {
        actorKind: "local_agent",
        actorId: "scientist-1",
      },
      now: "2026-05-13T12:02:46.000Z",
    });
    context.repositories.measurements.create({
      id: "measurement_pull_minimal" as SituId<"measurement">,
      experimentId: "experiment_pull_minimal" as SituId<"experiment">,
      revisionNumber: 1,
      metricName: "tests passed",
      numericValue: 42,
      summaryMarkdown: "No optional measurement fields.",
      measuredBy: {
        actorKind: "human",
        actorId: "scott",
        displayName: "Scott",
      },
      now: "2026-05-13T12:02:47.000Z",
    });
    context.repositories.reviews.create({
      id: "review_pull_changes" as SituId<"review">,
      experimentId: "experiment_pull_ready" as SituId<"experiment">,
      revisionNumber: 1,
      decision: "changes_requested",
      bodyMarkdown: "The approach works, but update the edge-case handling.",
      reviewer: {
        actorKind: "local_agent",
        actorId: "verifier-1",
        displayName: "Verifier 1",
      },
      now: "2026-05-13T12:02:48.000Z",
    });
    context.repositories.artifacts.create({
      id: "artifact_pull_review_log" as SituId<"artifact">,
      target: {
        targetKind: "review",
        targetId: "review_pull_changes" as SituId<"review">,
      },
      title: "Review log",
      summaryMarkdown: "Captured verifier output.",
      uri: "file:///tmp/situ/review.log",
      mediaType: "text/plain",
      byteSize: 42,
      sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      createdBy: {
        actorKind: "local_agent",
        actorId: "verifier-1",
      },
      now: "2026-05-13T12:02:49.000Z",
    });
    context.repositories.artifacts.create({
      id: "artifact_pull_minimal" as SituId<"artifact">,
      target: {
        targetKind: "measurement",
        targetId: "measurement_pull_score" as SituId<"measurement">,
      },
      title: "Minimal artifact",
      summaryMarkdown: "No optional artifact metadata.",
      uri: "file:///tmp/situ/minimal.log",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
        displayName: "Scott",
      },
      now: "2026-05-13T12:02:50.000Z",
    });
    context.repositories.reports.create({
      id: "report_pull_findings" as SituId<"report">,
      projectId: "project_pull_1" as SituId<"project">,
      target: {
        targetKind: "experiment",
        targetId: "experiment_pull_ready" as SituId<"experiment">,
      },
      title: "Spelling Corrector Run",
      bodyMarkdown: "# Findings\n\nThe best experiment reached 8.7.",
      generatedBy: {
        actorKind: "local_agent",
        actorId: "scientist-1",
      },
      now: "2026-05-13T12:02:51.000Z",
    });
    context.repositories.events.create({
      id: "event_pull_experiment" as SituId<"event">,
      target: {
        targetKind: "experiment",
        targetId: "experiment_pull_ready" as SituId<"experiment">,
      },
      actor: {
        actorKind: "local_agent",
        actorId: "scientist-1",
      },
      summaryMarkdown: "Experiment is ready for review.",
      now: "2026-05-13T12:02:52.000Z",
    });
    context.repositories.events.create({
      id: "event_pull_comment" as SituId<"event">,
      target: {
        targetKind: "comment",
        targetId: "comment_pull_handoff" as SituId<"comment">,
      },
      actor: {
        actorKind: "local_agent",
        actorId: "worker-1",
        displayName: "Worker 1",
      },
      summaryMarkdown: "Commented on the handoff.",
      bodyMarkdown: "The reviewer should inspect the task handoff.",
      now: "2026-05-13T12:03:30.000Z",
    });
    context.repositories.comments.create({
      id: "comment_pull_handoff" as SituId<"comment">,
      target: {
        targetKind: "task",
        targetId: "task_pull_done" as SituId<"task">,
      },
      bodyMarkdown: "Ready for review.",
      author: {
        actorKind: "local_agent",
        actorId: "worker-1",
        displayName: "Worker 1",
      },
      now: "2026-05-13T12:03:00.000Z",
    });
    context.repositories.notifications.create({
      id: "notification_pull_handoff" as SituId<"notification">,
      recipient: {
        recipientId: "scott",
      },
      target: {
        targetKind: "comment",
        targetId: "comment_pull_handoff" as SituId<"comment">,
      },
      createdBy: {
        actorKind: "local_agent",
        actorId: "worker-1",
        displayName: "Worker 1",
      },
      summaryMarkdown: "Review handoff comment.",
      bodyMarkdown: "Please inspect the attached comment.",
      now: "2026-05-13T12:04:00.000Z",
    });
    context.repositories.notifications.markRead({
      id: "notification_pull_handoff" as SituId<"notification">,
      now: "2026-05-13T12:05:00.000Z",
    });
    context.repositories.notifications.dismiss({
      id: "notification_pull_handoff" as SituId<"notification">,
      now: "2026-05-13T12:06:00.000Z",
    });
    setLastMutationId({
      database,
      clientGroupID: "client-group-1",
      clientID: "client-2",
      lastMutationID: 8,
    });
    setLastMutationId({
      database,
      clientGroupID: "client-group-1",
      clientID: "client-1",
      lastMutationID: 3,
    });
    setLastMutationId({
      database,
      clientGroupID: "other-client-group",
      clientID: "client-ignored",
      lastMutationID: 11,
    });

    const countsBeforePull = productCounts({ database });
    const result = processReplicachePull({
      database,
      pullRequest: pull({ cookie: { ignored: [1, null, true] } }),
    });

    expect(result).toEqual({
      cookie: null,
      lastMutationIDChanges: {
        "client-1": 3,
        "client-2": 8,
      },
      patch: [
        { op: "clear" },
        {
          op: "put",
          key: "projects/project_pull_1",
          value: {
            id: "project_pull_1",
            name: "Pull Project",
            repositoryPath: "/tmp/pull-project",
            goalMarkdown: "Exercise Replicache pull.",
            status: "archived",
            createdBy: {
              actorKind: "human",
              actorId: "scott",
            },
            metadata: {
              createdAt: "2026-05-13T12:00:00.000Z",
              updatedAt: "2026-05-13T12:02:00.000Z",
            },
          },
        },
        {
          op: "put",
          key: "tasks/task_pull_done",
          value: {
            id: "task_pull_done",
            projectId: "project_pull_1",
            title: "Pulled Done Task",
            bodyMarkdown: "A terminal task should still be pulled.",
            status: "done",
            createdBy: {
              actorKind: "local_agent",
              actorId: "worker-1",
            },
            metadata: {
              createdAt: "2026-05-13T12:01:00.000Z",
              updatedAt: "2026-05-13T12:01:00.000Z",
            },
          },
        },
        {
          op: "put",
          key: "baselines/baseline_pull_native",
          value: {
            id: "baseline_pull_native",
            projectId: "project_pull_1",
            title: "Native baseline",
            summaryMarkdown: "Unmodified harness output.",
            status: "active",
            createdBy: {
              actorKind: "local_agent",
              actorId: "baseline-manager",
            },
            metadata: {
              createdAt: "2026-05-13T12:02:15.000Z",
              updatedAt: "2026-05-13T12:02:15.000Z",
            },
          },
        },
        {
          op: "put",
          key: "experiments/experiment_pull_ready",
          value: {
            id: "experiment_pull_ready",
            projectId: "project_pull_1",
            taskId: "task_pull_done",
            title: "Try beam search",
            summaryMarkdown: "Improve the scorer pass.",
            status: "ready_for_review",
            revisionNumber: 1,
            baseRef: "main",
            branchName: "experiment/beam-search",
            worktreePath: "/tmp/situ/worktrees/beam-search",
            assignedTo: {
              actorKind: "local_agent",
              actorId: "verifier-1",
              displayName: "Verifier 1",
            },
            createdBy: {
              actorKind: "local_agent",
              actorId: "scientist-1",
              displayName: "Scientist 1",
            },
            metadata: {
              createdAt: "2026-05-13T12:02:30.000Z",
              updatedAt: "2026-05-13T12:02:30.000Z",
            },
          },
        },
        {
          op: "put",
          key: "experiments/experiment_pull_minimal",
          value: {
            id: "experiment_pull_minimal",
            projectId: "project_pull_1",
            taskId: "task_pull_done",
            title: "Minimal experiment",
            summaryMarkdown: "No optional refs.",
            status: "planned",
            revisionNumber: 1,
            createdBy: {
              actorKind: "local_agent",
              actorId: "scientist-2",
            },
            metadata: {
              createdAt: "2026-05-13T12:02:45.000Z",
              updatedAt: "2026-05-13T12:02:45.000Z",
            },
          },
        },
        {
          op: "put",
          key: "measurements/measurement_pull_score",
          value: {
            id: "measurement_pull_score",
            experimentId: "experiment_pull_ready",
            revisionNumber: 1,
            metricName: "goal score",
            numericValue: 8.7,
            unit: "points",
            summaryMarkdown: "Improved the target score.",
            detailsMarkdown: "Measured against the spelling-corrector fixture.",
            measuredBy: {
              actorKind: "local_agent",
              actorId: "scientist-1",
            },
            metadata: {
              createdAt: "2026-05-13T12:02:46.000Z",
              updatedAt: "2026-05-13T12:02:46.000Z",
            },
          },
        },
        {
          op: "put",
          key: "measurements/measurement_pull_minimal",
          value: {
            id: "measurement_pull_minimal",
            experimentId: "experiment_pull_minimal",
            revisionNumber: 1,
            metricName: "tests passed",
            numericValue: 42,
            summaryMarkdown: "No optional measurement fields.",
            measuredBy: {
              actorKind: "human",
              actorId: "scott",
              displayName: "Scott",
            },
            metadata: {
              createdAt: "2026-05-13T12:02:47.000Z",
              updatedAt: "2026-05-13T12:02:47.000Z",
            },
          },
        },
        {
          op: "put",
          key: "reviews/review_pull_changes",
          value: {
            id: "review_pull_changes",
            experimentId: "experiment_pull_ready",
            revisionNumber: 1,
            decision: "changes_requested",
            bodyMarkdown: "The approach works, but update the edge-case handling.",
            reviewer: {
              actorKind: "local_agent",
              actorId: "verifier-1",
              displayName: "Verifier 1",
            },
            metadata: {
              createdAt: "2026-05-13T12:02:48.000Z",
              updatedAt: "2026-05-13T12:02:48.000Z",
            },
          },
        },
        {
          op: "put",
          key: "artifacts/artifact_pull_review_log",
          value: {
            id: "artifact_pull_review_log",
            target: {
              targetKind: "review",
              targetId: "review_pull_changes",
            },
            title: "Review log",
            summaryMarkdown: "Captured verifier output.",
            uri: "file:///tmp/situ/review.log",
            mediaType: "text/plain",
            byteSize: 42,
            sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            createdBy: {
              actorKind: "local_agent",
              actorId: "verifier-1",
            },
            metadata: {
              createdAt: "2026-05-13T12:02:49.000Z",
              updatedAt: "2026-05-13T12:02:49.000Z",
            },
          },
        },
        {
          op: "put",
          key: "artifacts/artifact_pull_minimal",
          value: {
            id: "artifact_pull_minimal",
            target: {
              targetKind: "measurement",
              targetId: "measurement_pull_score",
            },
            title: "Minimal artifact",
            summaryMarkdown: "No optional artifact metadata.",
            uri: "file:///tmp/situ/minimal.log",
            createdBy: {
              actorKind: "human",
              actorId: "scott",
              displayName: "Scott",
            },
            metadata: {
              createdAt: "2026-05-13T12:02:50.000Z",
              updatedAt: "2026-05-13T12:02:50.000Z",
            },
          },
        },
        {
          op: "put",
          key: "reports/report_pull_findings",
          value: {
            id: "report_pull_findings",
            projectId: "project_pull_1",
            target: {
              targetKind: "experiment",
              targetId: "experiment_pull_ready",
            },
            title: "Spelling Corrector Run",
            bodyMarkdown: "# Findings\n\nThe best experiment reached 8.7.",
            generatedBy: {
              actorKind: "local_agent",
              actorId: "scientist-1",
            },
            metadata: {
              createdAt: "2026-05-13T12:02:51.000Z",
              updatedAt: "2026-05-13T12:02:51.000Z",
            },
          },
        },
        {
          op: "put",
          key: "comments/comment_pull_handoff",
          value: {
            id: "comment_pull_handoff",
            target: {
              targetKind: "task",
              targetId: "task_pull_done",
            },
            bodyMarkdown: "Ready for review.",
            author: {
              actorKind: "local_agent",
              actorId: "worker-1",
              displayName: "Worker 1",
            },
            metadata: {
              createdAt: "2026-05-13T12:03:00.000Z",
              updatedAt: "2026-05-13T12:03:00.000Z",
            },
          },
        },
        {
          op: "put",
          key: "events/event_pull_experiment",
          value: {
            id: "event_pull_experiment",
            target: {
              targetKind: "experiment",
              targetId: "experiment_pull_ready",
            },
            actor: {
              actorKind: "local_agent",
              actorId: "scientist-1",
            },
            summaryMarkdown: "Experiment is ready for review.",
            metadata: {
              createdAt: "2026-05-13T12:02:52.000Z",
              updatedAt: "2026-05-13T12:02:52.000Z",
            },
          },
        },
        {
          op: "put",
          key: "events/event_pull_comment",
          value: {
            id: "event_pull_comment",
            target: {
              targetKind: "comment",
              targetId: "comment_pull_handoff",
            },
            actor: {
              actorKind: "local_agent",
              actorId: "worker-1",
              displayName: "Worker 1",
            },
            summaryMarkdown: "Commented on the handoff.",
            bodyMarkdown: "The reviewer should inspect the task handoff.",
            metadata: {
              createdAt: "2026-05-13T12:03:30.000Z",
              updatedAt: "2026-05-13T12:03:30.000Z",
            },
          },
        },
        {
          op: "put",
          key: "notifications/notification_pull_handoff",
          value: {
            id: "notification_pull_handoff",
            recipient: {
              recipientId: "scott",
            },
            target: {
              targetKind: "comment",
              targetId: "comment_pull_handoff",
            },
            createdBy: {
              actorKind: "local_agent",
              actorId: "worker-1",
              displayName: "Worker 1",
            },
            summaryMarkdown: "Review handoff comment.",
            bodyMarkdown: "Please inspect the attached comment.",
            readAt: "2026-05-13T12:05:00.000Z",
            dismissedAt: "2026-05-13T12:06:00.000Z",
            metadata: {
              createdAt: "2026-05-13T12:04:00.000Z",
              updatedAt: "2026-05-13T12:06:00.000Z",
            },
          },
        },
      ],
    });
    expect(productCounts({ database })).toEqual(countsBeforePull);
  } finally {
    database.close();
  }
});

test("returns clear-only patch and empty mutation changes for an empty product database", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const result = processReplicachePull({
      database,
      pullRequest: pull({ clientGroupID: "client-group-empty" }),
    });

    expect(result).toEqual({
      cookie: null,
      lastMutationIDChanges: {},
      patch: [{ op: "clear" }],
    });
  } finally {
    database.close();
  }
});

test("validates pull request envelopes", () => {
  expect(
    parseReplicachePullRequest({
      pullVersion: 1,
      clientGroupID: "client-group-1",
      cookie: { nested: ["value", 1, null] },
      profileID: "profile-1",
      schemaVersion: "schema-1",
    }),
  ).toEqual({
    pullVersion: 1,
    clientGroupID: "client-group-1",
    cookie: { nested: ["value", 1, null] },
    profileID: "profile-1",
    schemaVersion: "schema-1",
  });

  expect(() =>
    parseReplicachePullRequest({
      pullVersion: 2,
      clientGroupID: "client-group-1",
      cookie: null,
      profileID: "profile-1",
      schemaVersion: "schema-1",
    }),
  ).toThrow(ValidationError);

  expect(() =>
    parseReplicachePullRequest({
      pullVersion: 1,
      clientGroupID: "",
      cookie: null,
      profileID: "profile-1",
      schemaVersion: "schema-1",
    }),
  ).toThrow(ValidationError);

  expect(() =>
    parseReplicachePullRequest({
      pullVersion: 1,
      clientGroupID: "client-group-1",
      profileID: "profile-1",
      schemaVersion: "schema-1",
    }),
  ).toThrow(ValidationError);

  expect(() =>
    parseReplicachePullRequest({
      pullVersion: 1,
      clientGroupID: "client-group-1",
      cookie: Number.NaN,
      profileID: "profile-1",
      schemaVersion: "schema-1",
    }),
  ).toThrow(ValidationError);
});
