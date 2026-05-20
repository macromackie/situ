import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";

import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import {
  archiveProjectAction,
  createAppActionContext,
  createProjectAction,
  getProjectAction,
  listProjectsAction,
} from "./index.js";

type CountRow = {
  readonly count: number;
};

function countEvents(input: { readonly database: ReturnType<typeof openAppDatabase> }): number {
  return (
    input.database.query<CountRow, []>("SELECT COUNT(*) AS count FROM events").get()?.count ?? 0
  );
}

test("creates a project and one exact event", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const result = createProjectAction({
      context,
      id: "project_action_create" as SituId<"project">,
      eventId: "event_project_created" as SituId<"event">,
      name: "Project Action Create",
      repositoryPath: "/tmp/project-action-create",
      goalMarkdown: "Create the project",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
        displayName: "Scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(result.project.id).toBe("project_action_create");
    expect(result.event).toEqual({
      id: "event_project_created",
      target: {
        targetKind: "project",
        targetId: result.project.id,
      },
      actor: result.project.createdBy,
      summaryMarkdown: "Created project",
      bodyMarkdown: undefined,
      metadata: {
        createdAt: "2026-05-13T12:00:00.000Z",
        updatedAt: "2026-05-13T12:00:00.000Z",
      },
    });
    expect(context.repositories.projects.getById({ id: result.project.id })).toEqual(
      result.project,
    );
    expect(countEvents({ database })).toBe(1);
  } finally {
    database.close();
  }
});

test("archives a project and one exact event", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const project = context.repositories.projects.create({
      id: "project_action_archive" as SituId<"project">,
      name: "Project Action Archive",
      repositoryPath: "/tmp/project-action-archive",
      goalMarkdown: "Archive the project",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    const actor = {
      actorKind: "local_agent" as const,
      actorId: "archiver-1",
      displayName: "Archiver 1",
    };
    const result = archiveProjectAction({
      context,
      id: project.id,
      actor,
      eventId: "event_project_archived" as SituId<"event">,
      now: "2026-05-13T12:01:00.000Z",
    });

    expect(result.project.status).toBe("archived");
    expect(result.event).toEqual({
      id: "event_project_archived",
      target: {
        targetKind: "project",
        targetId: project.id,
      },
      actor,
      summaryMarkdown: "Archived project",
      bodyMarkdown: undefined,
      metadata: {
        createdAt: "2026-05-13T12:01:00.000Z",
        updatedAt: "2026-05-13T12:01:00.000Z",
      },
    });
    expect(countEvents({ database })).toBe(1);
  } finally {
    database.close();
  }
});

test("rolls back project creation when event creation fails", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    context.repositories.events.create({
      id: "event_duplicate" as SituId<"event">,
      target: {
        targetKind: "project",
        targetId: "project_existing" as SituId<"project">,
      },
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
      summaryMarkdown: "Existing event",
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(() =>
      createProjectAction({
        context,
        id: "project_rolled_back" as SituId<"project">,
        eventId: "event_duplicate" as SituId<"event">,
        name: "Rolled Back",
        repositoryPath: "/tmp/project-rolled-back",
        goalMarkdown: "Rollback",
        createdBy: {
          actorKind: "human",
          actorId: "scott",
        },
        now: "2026-05-13T12:01:00.000Z",
      }),
    ).toThrow();

    expect(
      context.repositories.projects.getById({
        id: "project_rolled_back" as SituId<"project">,
      }),
    ).toBeUndefined();
    expect(countEvents({ database })).toBe(1);
  } finally {
    database.close();
  }
});

test("rolls back project archival when event creation fails", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const project = context.repositories.projects.create({
      id: "project_archive_rolled_back" as SituId<"project">,
      name: "Project Archive Rolled Back",
      repositoryPath: "/tmp/project-archive-rolled-back",
      goalMarkdown: "Rollback archive",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    context.repositories.events.create({
      id: "event_duplicate_archive" as SituId<"event">,
      target: {
        targetKind: "project",
        targetId: project.id,
      },
      actor: {
        actorKind: "human",
        actorId: "scott",
      },
      summaryMarkdown: "Existing event",
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(() =>
      archiveProjectAction({
        context,
        id: project.id,
        actor: {
          actorKind: "human",
          actorId: "scott",
        },
        eventId: "event_duplicate_archive" as SituId<"event">,
        now: "2026-05-13T12:01:00.000Z",
      }),
    ).toThrow();

    expect(context.repositories.projects.getById({ id: project.id })?.status).toBe("active");
    expect(countEvents({ database })).toBe(1);
  } finally {
    database.close();
  }
});

test("does not create a project event when the primary write fails", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });

    expect(() =>
      archiveProjectAction({
        context,
        id: "project_missing" as SituId<"project">,
        actor: {
          actorKind: "human",
          actorId: "scott",
        },
        eventId: "event_not_created" as SituId<"event">,
        now: "2026-05-13T12:00:00.000Z",
      }),
    ).toThrow();

    expect(countEvents({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("project read actions return repository results without creating events", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const project = context.repositories.projects.create({
      id: "project_read_action" as SituId<"project">,
      name: "Project Read Action",
      repositoryPath: "/tmp/project-read-action",
      goalMarkdown: "Read the project",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(getProjectAction({ context, id: project.id })).toEqual(project);
    expect(listProjectsAction({ context, status: "active" })).toEqual([project]);
    expect(countEvents({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("listProjectsAction forwards repository path filters", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const matchingProject = context.repositories.projects.create({
      id: "project_action_repository_match" as SituId<"project">,
      name: "Project Action Repository Match",
      repositoryPath: "/tmp/action-repository",
      goalMarkdown: "Read by repository.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    context.repositories.projects.create({
      id: "project_action_repository_other" as SituId<"project">,
      name: "Project Action Repository Other",
      repositoryPath: "/tmp/action-repository-other",
      goalMarkdown: "Do not read by repository.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });

    expect(
      listProjectsAction({
        context,
        repositoryPath: "/tmp/action-repository",
      }),
    ).toEqual([matchingProject]);
    expect(countEvents({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("listProjectsAction returns an empty list for an unused repository path", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    context.repositories.projects.create({
      id: "project_action_repository_unused" as SituId<"project">,
      name: "Project Action Repository Unused",
      repositoryPath: "/tmp/action-repository-used",
      goalMarkdown: "Do not match the unused path.",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(
      listProjectsAction({
        context,
        repositoryPath: "/tmp/action-repository-unused",
      }),
    ).toEqual([]);
    expect(countEvents({ database })).toBe(0);
  } finally {
    database.close();
  }
});
