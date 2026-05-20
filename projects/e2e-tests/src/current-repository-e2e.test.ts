import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runSituCli } from "@situ/app";
import { materializeFixtureRepository, tinyAutoresearchFixture } from "@situ/fixtures";

import { createCurrentRepositoryE2eResult } from "./index.js";

test("current repository fixture e2e test exercises init, current, current task, and assignment inbox CLI flow", async () => {
  const rootPath = mkdtempSync(join(tmpdir(), "situ-current-repository-e2e-"));

  try {
    const materialized = materializeFixtureRepository({
      fixture: tinyAutoresearchFixture,
      rootPath,
    });

    const databasePath = join(rootPath, "situ.db");
    const repositoryPath = materialized.repositoryPath;
    const projectId = "project_e2e_current_repository";
    const eventId = "event_e2e_current_repository";
    const taskId = "task_e2e_current_repository";
    const taskEventId = "event_e2e_current_repository_task";
    const actorKind = "local_agent";
    const actorId = "e2e-agent";
    const now = "2026-05-14T12:00:00.000Z";
    const assignedTaskId = "task_e2e_current_repository_assigned";
    const assignedTaskEventId = "event_e2e_current_repository_assigned_task";
    const assignedTaskTitle = "Review fixture repository";
    const assignedToKind = "local_agent";
    const assignedToId = "verifier-agent";
    const assignedToDisplayName = "Verifier Agent";

    expect(existsSync(join(repositoryPath, "README.md"))).toBe(true);

    const initResult = await runSituCli({
      args: [
        "--db",
        databasePath,
        "projects",
        "init",
        "--id",
        projectId,
        "--event-id",
        eventId,
        "--name",
        tinyAutoresearchFixture.name,
        "--goal",
        tinyAutoresearchFixture.goal,
        "--actor-kind",
        actorKind,
        "--actor-id",
        actorId,
        "--now",
        now,
      ],
      cwd: repositoryPath,
    });

    const currentTextResult = await runSituCli({
      args: ["--db", databasePath, "projects", "current", "--status", "active"],
      cwd: repositoryPath,
    });

    const currentJsonResult = await runSituCli({
      args: ["--json", "--db", databasePath, "projects", "current", "--status", "active"],
      cwd: repositoryPath,
    });

    const taskCreateResult = await runSituCli({
      args: [
        "--db",
        databasePath,
        "tasks",
        "create",
        "--id",
        taskId,
        "--event-id",
        taskEventId,
        "--project-id",
        projectId,
        "--title",
        "Inspect fixture repository",
        "--body",
        tinyAutoresearchFixture.goal,
        "--actor-kind",
        actorKind,
        "--actor-id",
        actorId,
        "--now",
        now,
      ],
      cwd: repositoryPath,
    });

    const taskListResult = await runSituCli({
      args: ["--db", databasePath, "tasks", "list", "--project-id", projectId],
      cwd: repositoryPath,
    });

    const currentTasksTextResult = await runSituCli({
      args: ["--db", databasePath, "tasks", "current", "--project-status", "active"],
      cwd: repositoryPath,
    });

    const currentTasksJsonResult = await runSituCli({
      args: ["--json", "--db", databasePath, "tasks", "current", "--project-status", "active"],
      cwd: repositoryPath,
    });

    expect(initResult.exitCode).toBe(0);
    expect(initResult.stdout).toBe(
      "Initialized project project_e2e_current_repository (event event_e2e_current_repository)\n",
    );

    expect(currentTextResult.exitCode).toBe(0);
    expect(currentTextResult.stdout).toBe(
      "project_e2e_current_repository\tactive\ttiny-autoresearch\n",
    );

    expect(currentJsonResult.exitCode).toBe(0);
    const currentJsonOutput = JSON.parse(currentJsonResult.stdout) as {
      readonly projects: readonly [
        {
          readonly id: string;
          readonly name: string;
          readonly repositoryPath: string;
          readonly goalMarkdown: string;
          readonly status: string;
          readonly createdBy: {
            readonly actorKind: string;
            readonly actorId: string;
          };
          readonly metadata: {
            readonly createdAt: string;
            readonly updatedAt: string;
          };
        },
      ];
    };
    expect(currentJsonOutput.projects).toHaveLength(1);
    expect(currentJsonOutput.projects[0]).toMatchObject({
      id: projectId,
      name: tinyAutoresearchFixture.name,
      repositoryPath,
      goalMarkdown: tinyAutoresearchFixture.goal,
      status: "active",
      createdBy: {
        actorKind,
        actorId,
      },
      metadata: {
        createdAt: now,
        updatedAt: now,
      },
    });

    expect(taskCreateResult.exitCode).toBe(0);
    expect(taskListResult.exitCode).toBe(0);
    expect(taskListResult.stdout).toBe(
      "task_e2e_current_repository\ttriage\tInspect fixture repository\n",
    );

    expect(currentTasksTextResult.exitCode).toBe(0);
    expect(currentTasksTextResult.stdout).toBe(
      "task_e2e_current_repository\ttriage\tInspect fixture repository\n",
    );

    expect(currentTasksJsonResult.exitCode).toBe(0);
    const currentTasksJsonOutput = JSON.parse(currentTasksJsonResult.stdout) as {
      readonly projects: readonly [
        {
          readonly id: string;
          readonly name: string;
          readonly repositoryPath: string;
          readonly goalMarkdown: string;
          readonly status: string;
          readonly createdBy: {
            readonly actorKind: string;
            readonly actorId: string;
          };
          readonly metadata: {
            readonly createdAt: string;
            readonly updatedAt: string;
          };
        },
      ];
      readonly tasks: readonly [
        {
          readonly id: string;
          readonly projectId: string;
          readonly title: string;
          readonly bodyMarkdown: string;
          readonly status: string;
          readonly assignedTo?: unknown;
          readonly createdBy: {
            readonly actorKind: string;
            readonly actorId: string;
          };
          readonly metadata: {
            readonly createdAt: string;
            readonly updatedAt: string;
          };
        },
      ];
    };
    expect(Object.keys(currentTasksJsonOutput)).toEqual(["projects", "tasks"]);
    expect(currentTasksJsonOutput.projects).toHaveLength(1);
    expect(currentTasksJsonOutput.projects[0]).toMatchObject({
      id: projectId,
      name: tinyAutoresearchFixture.name,
      repositoryPath,
      goalMarkdown: tinyAutoresearchFixture.goal,
      status: "active",
      createdBy: {
        actorKind,
        actorId,
      },
      metadata: {
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(currentTasksJsonOutput.tasks).toHaveLength(1);
    expect(currentTasksJsonOutput.tasks[0]).toMatchObject({
      id: taskId,
      projectId,
      title: "Inspect fixture repository",
      bodyMarkdown: tinyAutoresearchFixture.goal,
      status: "triage",
      createdBy: {
        actorKind,
        actorId,
      },
      metadata: {
        createdAt: now,
        updatedAt: now,
      },
    });
    expect("assignedTo" in currentTasksJsonOutput.tasks[0]).toBe(false);

    const assignedTaskCreateResult = await runSituCli({
      args: [
        "--db",
        databasePath,
        "tasks",
        "create",
        "--id",
        assignedTaskId,
        "--event-id",
        assignedTaskEventId,
        "--project-id",
        projectId,
        "--title",
        assignedTaskTitle,
        "--body",
        tinyAutoresearchFixture.goal,
        "--actor-kind",
        actorKind,
        "--actor-id",
        actorId,
        "--assigned-to-kind",
        assignedToKind,
        "--assigned-to-id",
        assignedToId,
        "--assigned-to-display-name",
        assignedToDisplayName,
        "--now",
        now,
      ],
      cwd: repositoryPath,
    });

    const notificationListTextResult = await runSituCli({
      args: ["--db", databasePath, "notifications", "list", "--recipient-id", assignedToId],
      cwd: repositoryPath,
    });

    const notificationListJsonResult = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "notifications",
        "list",
        "--recipient-id",
        assignedToId,
      ],
      cwd: repositoryPath,
    });

    expect(assignedTaskCreateResult.exitCode).toBe(0);
    expect(assignedTaskCreateResult.stdout).toBe(
      "Created task task_e2e_current_repository_assigned (event event_e2e_current_repository_assigned_task)\n",
    );

    expect(notificationListTextResult.exitCode).toBe(0);
    const notificationTextLines = notificationListTextResult.stdout.split("\n");
    expect(notificationTextLines).toHaveLength(2);
    expect(notificationTextLines[1]).toBe("");
    const notificationFields = notificationTextLines[0].split("\t");
    expect(notificationFields).toHaveLength(5);
    const notificationId = notificationFields[0];
    expect(notificationId.startsWith("notification_")).toBe(true);
    expect(notificationFields).toEqual([
      notificationId,
      "verifier-agent",
      "task/task_e2e_current_repository_assigned",
      "unread",
      "Assigned task: Review fixture repository",
    ]);

    expect(notificationListJsonResult.exitCode).toBe(0);
    expect(notificationListJsonResult.stdout.endsWith("\n")).toBe(true);
    const notificationJsonOutput = JSON.parse(notificationListJsonResult.stdout) as {
      readonly notifications: readonly [
        {
          readonly id: string;
          readonly recipient: {
            readonly recipientId: string;
            readonly displayName: string;
          };
          readonly target: {
            readonly targetKind: string;
            readonly targetId: string;
          };
          readonly createdBy: {
            readonly actorKind: string;
            readonly actorId: string;
          };
          readonly summaryMarkdown: string;
          readonly bodyMarkdown?: unknown;
          readonly readAt?: unknown;
          readonly dismissedAt?: unknown;
          readonly metadata: {
            readonly createdAt: string;
            readonly updatedAt: string;
          };
        },
      ];
    };
    expect(Object.keys(notificationJsonOutput)).toEqual(["notifications"]);
    expect(notificationJsonOutput.notifications).toHaveLength(1);
    const notification = notificationJsonOutput.notifications[0];
    expect(Object.keys(notification)).toEqual([
      "id",
      "recipient",
      "target",
      "createdBy",
      "summaryMarkdown",
      "metadata",
    ]);
    expect(notification.id).toBe(notificationId);
    expect(notification.recipient).toEqual({
      recipientId: "verifier-agent",
      displayName: "Verifier Agent",
    });
    expect(notification.target).toEqual({
      targetKind: "task",
      targetId: "task_e2e_current_repository_assigned",
    });
    expect(notification.createdBy).toEqual({
      actorKind: "local_agent",
      actorId: "e2e-agent",
    });
    expect(notification.summaryMarkdown).toBe("Assigned task: Review fixture repository");
    expect("bodyMarkdown" in notification).toBe(false);
    expect("readAt" in notification).toBe(false);
    expect("dismissedAt" in notification).toBe(false);
    expect(notification.metadata).toEqual({
      createdAt: "2026-05-14T12:00:00.000Z",
      updatedAt: "2026-05-14T12:00:00.000Z",
    });

    const e2eResult = createCurrentRepositoryE2eResult({
      repositoryPath,
      initResult,
      currentTextResult,
      currentJsonResult,
      taskCreateResult,
      taskListResult,
      currentTasksTextResult,
      currentTasksJsonResult,
      assignedTaskCreateResult,
      notificationListTextResult,
      notificationListJsonResult,
    });

    expect(e2eResult.fixture).toBe(tinyAutoresearchFixture);
    expect(e2eResult.repositoryPath).toBe(repositoryPath);
    expect(e2eResult.initResult).toBe(initResult);
    expect(e2eResult.currentTextResult).toBe(currentTextResult);
    expect(e2eResult.currentJsonResult).toBe(currentJsonResult);
    expect(e2eResult.taskCreateResult).toBe(taskCreateResult);
    expect(e2eResult.taskListResult).toBe(taskListResult);
    expect(e2eResult.currentTasksTextResult).toBe(currentTasksTextResult);
    expect(e2eResult.currentTasksJsonResult).toBe(currentTasksJsonResult);
    expect(e2eResult.assignedTaskCreateResult).toBe(assignedTaskCreateResult);
    expect(e2eResult.notificationListTextResult).toBe(notificationListTextResult);
    expect(e2eResult.notificationListJsonResult).toBe(notificationListJsonResult);
  } finally {
    rmSync(rootPath, { recursive: true, force: true });
  }
});
