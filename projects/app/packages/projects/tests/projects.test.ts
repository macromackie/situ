import { Database } from "bun:sqlite";

import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";
import { ConflictError, NotFoundError, ValidationError } from "@situ/errors";

import {
  archiveProjectRecord,
  createProjectRecord,
  createProjectRepository,
  projectsSchemaFragment,
} from "../src/index.js";

function createTestDatabase(): Database {
  const database = new Database(":memory:");

  for (const statement of projectsSchemaFragment.statements) {
    database.exec(statement);
  }

  return database;
}

test("exports project schema statements", () => {
  const expectedPackageName: "projects" = projectsSchemaFragment.packageName;

  expect(expectedPackageName).toBe("projects");
  expect(projectsSchemaFragment.statements).toHaveLength(3);
});

test("creates active project records with normalized fields", () => {
  const project = createProjectRecord({
    id: "project_123" as SituId<"project">,
    name: "  Spelling Corrector  ",
    repositoryPath: "  /tmp/repo  ",
    goalMarkdown: "  Reach 8.2+ score  ",
    createdBy: {
      actorKind: "local_agent",
      actorId: "  scientist-1  ",
      displayName: "  Scientist 1  ",
    },
    now: "2026-05-13T08:00:00.000-04:00",
  });

  expect(project).toEqual({
    id: "project_123",
    name: "Spelling Corrector",
    repositoryPath: "/tmp/repo",
    goalMarkdown: "Reach 8.2+ score",
    status: "active",
    createdBy: {
      actorKind: "local_agent",
      actorId: "scientist-1",
      displayName: "Scientist 1",
    },
    metadata: {
      createdAt: "2026-05-13T12:00:00.000Z",
      updatedAt: "2026-05-13T12:00:00.000Z",
    },
  });
});

test("rejects invalid project records", () => {
  expect(() =>
    createProjectRecord({
      name: "",
      repositoryPath: "/tmp/repo",
      goalMarkdown: "goal",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
    }),
  ).toThrow(ValidationError);

  expect(() =>
    createProjectRecord({
      name: "Project",
      repositoryPath: "relative/repo",
      goalMarkdown: "goal",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
    }),
  ).toThrow(ValidationError);
});

test("archives project records", () => {
  const project = createProjectRecord({
    id: "project_123" as SituId<"project">,
    name: "Project",
    repositoryPath: "/tmp/repo",
    goalMarkdown: "goal",
    createdBy: {
      actorKind: "human",
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  });

  expect(
    archiveProjectRecord({
      project,
      now: "2026-05-13T12:01:00.000Z",
    }),
  ).toEqual({
    ...project,
    status: "archived",
    metadata: {
      createdAt: "2026-05-13T12:00:00.000Z",
      updatedAt: "2026-05-13T12:01:00.000Z",
    },
  });
});

test("creates and reads persisted projects", () => {
  const database = createTestDatabase();
  const repository = createProjectRepository({ database });

  try {
    const project = repository.create({
      id: "project_a" as SituId<"project">,
      name: "Project A",
      repositoryPath: "/tmp/project-a",
      goalMarkdown: "Goal A",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(repository.getById({ id: project.id })).toEqual(project);
    expect(repository.getById({ id: "project_missing" as SituId<"project"> })).toBeUndefined();
  } finally {
    database.close();
  }
});

test("lists projects ordered by creation time and id", () => {
  const database = createTestDatabase();
  const repository = createProjectRepository({ database });

  try {
    repository.create({
      id: "project_b" as SituId<"project">,
      name: "Project B",
      repositoryPath: "/tmp/project-b",
      goalMarkdown: "Goal B",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "project_a" as SituId<"project">,
      name: "Project A",
      repositoryPath: "/tmp/project-a",
      goalMarkdown: "Goal A",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    const archivedProject = repository.create({
      id: "project_c" as SituId<"project">,
      name: "Project C",
      repositoryPath: "/tmp/project-c",
      goalMarkdown: "Goal C",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    repository.archive({
      id: archivedProject.id,
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(repository.list().map((project) => project.id)).toEqual([
      "project_a",
      "project_b",
      "project_c",
    ]);
    expect(repository.list({ status: "active" }).map((project) => project.id)).toEqual([
      "project_a",
      "project_b",
    ]);
    expect(repository.list({ status: "archived" }).map((project) => project.id)).toEqual([
      "project_c",
    ]);
  } finally {
    database.close();
  }
});

test("lists projects by exact repository path", () => {
  const database = createTestDatabase();
  const repository = createProjectRepository({ database });

  try {
    repository.create({
      id: "project_repo_a" as SituId<"project">,
      name: "Project Repo A",
      repositoryPath: "/tmp/shared-repo",
      goalMarkdown: "Goal A",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "project_repo_b" as SituId<"project">,
      name: "Project Repo B",
      repositoryPath: "/tmp/shared-repo-nested",
      goalMarkdown: "Goal B",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    repository.create({
      id: "project_repo_c" as SituId<"project">,
      name: "Project Repo C",
      repositoryPath: "/tmp/shared-repo",
      goalMarkdown: "Goal C",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(
      repository.list({ repositoryPath: "/tmp/shared-repo" }).map((project) => project.id),
    ).toEqual(["project_repo_a", "project_repo_c"]);
  } finally {
    database.close();
  }
});

test("lists projects by repository path and status while preserving order", () => {
  const database = createTestDatabase();
  const repository = createProjectRepository({ database });

  try {
    repository.create({
      id: "project_repo_status_b" as SituId<"project">,
      name: "Project Repo Status B",
      repositoryPath: "/tmp/status-repo",
      goalMarkdown: "Goal B",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    repository.create({
      id: "project_repo_status_a" as SituId<"project">,
      name: "Project Repo Status A",
      repositoryPath: "/tmp/status-repo",
      goalMarkdown: "Goal A",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    const archived = repository.create({
      id: "project_repo_status_c" as SituId<"project">,
      name: "Project Repo Status C",
      repositoryPath: "/tmp/status-repo",
      goalMarkdown: "Goal C",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    repository.create({
      id: "project_repo_status_other" as SituId<"project">,
      name: "Project Repo Status Other",
      repositoryPath: "/tmp/other-status-repo",
      goalMarkdown: "Goal Other",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:02:00.000Z",
    });
    repository.archive({
      id: archived.id,
      now: "2026-05-13T12:03:00.000Z",
    });

    expect(
      repository
        .list({
          repositoryPath: "/tmp/status-repo",
          status: "active",
        })
        .map((project) => project.id),
    ).toEqual(["project_repo_status_a", "project_repo_status_b"]);
    expect(
      repository
        .list({
          repositoryPath: "/tmp/status-repo",
          status: "archived",
        })
        .map((project) => project.id),
    ).toEqual(["project_repo_status_c"]);
  } finally {
    database.close();
  }
});

test("archives persisted projects", () => {
  const database = createTestDatabase();
  const repository = createProjectRepository({ database });

  try {
    const project = repository.create({
      id: "project_a" as SituId<"project">,
      name: "Project A",
      repositoryPath: "/tmp/project-a",
      goalMarkdown: "Goal A",
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    const archivedProject = repository.archive({
      id: project.id,
      now: "2026-05-13T12:01:00.000Z",
    });

    expect(archivedProject.status).toBe("archived");
    expect(archivedProject.metadata).toEqual({
      createdAt: "2026-05-13T12:00:00.000Z",
      updatedAt: "2026-05-13T12:01:00.000Z",
    });
  } finally {
    database.close();
  }
});

test("reports repository create conflicts and missing archives", () => {
  const database = createTestDatabase();
  const repository = createProjectRepository({ database });
  const input = {
    id: "project_a" as SituId<"project">,
    name: "Project A",
    repositoryPath: "/tmp/project-a",
    goalMarkdown: "Goal A",
    createdBy: {
      actorKind: "human" as const,
      actorId: "scott",
    },
    now: "2026-05-13T12:00:00.000Z",
  };

  try {
    repository.create(input);

    expect(() => repository.create(input)).toThrow(ConflictError);
    expect(() =>
      repository.archive({
        id: "project_missing" as SituId<"project">,
      }),
    ).toThrow(NotFoundError);
  } finally {
    database.close();
  }
});
