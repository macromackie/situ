import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { ErrorKind } from "@situ/errors";
import { handleSituHttpRequest, openAppDatabase } from "@situ/app";
import type { HandleSituHttpRequestInput, SituHttpMethod } from "@situ/app";

const supportedMethods: readonly SituHttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function request(input: {
  readonly method: string;
  readonly path: string;
  readonly body?: string;
  readonly headers?: HeadersInit;
}): Request {
  return new Request(`http://situ.local${input.path}`, {
    method: input.method,
    body: input.body,
    headers: input.headers,
  });
}

async function responseText(input: {
  readonly method: string;
  readonly path: string;
  readonly body?: string;
  readonly headers?: HeadersInit;
  readonly databasePath?: string;
  readonly environment?: NodeJS.ProcessEnv;
}): Promise<{ readonly response: Response; readonly text: string }> {
  const handlerInput: HandleSituHttpRequestInput = {
    request: request({
      method: input.method,
      path: input.path,
      body: input.body,
      headers: input.headers,
    }),
    databasePath: input.databasePath,
    environment: input.environment,
  };
  const response = await handleSituHttpRequest(handlerInput);

  return {
    response,
    text: await response.text(),
  };
}

async function withTempDatabasePath(
  run: (databasePath: string) => Promise<void> | void,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "situ-http-"));

  try {
    await run(join(directory, "situ.db"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("exports the public HTTP request contract from the app root", () => {
  expect(supportedMethods).toEqual(["GET", "POST", "PUT", "PATCH", "DELETE"]);
  expect(typeof handleSituHttpRequest).toBe("function");
});

test("returns health without opening or validating the database", async () => {
  const { response, text } = await responseText({
    method: "GET",
    path: "/health",
    databasePath: "relative-path-would-fail-if-resolved.db",
    environment: {},
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(text).toBe('{"ok":true}\n');
});

test("serves the live report shell without opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-http-live-shell-"));
  const databasePath = join(directory, "nested", "situ.db");

  try {
    const root = await responseText({
      method: "GET",
      path: "/",
      databasePath,
      environment: {},
    });
    const { response, text } = await responseText({
      method: "GET",
      path: "/projects/project_123",
      databasePath,
      environment: {},
    });

    expect(root.response.status).toBe(200);
    expect(root.text).toContain('<script type="module" src="/assets/live-report.js"></script>');
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(text).toContain('<div id="root">');
    expect(text).toContain('<script type="module" src="/assets/live-report.js"></script>');
    expect(existsSync(dirname(databasePath))).toBe(false);
    expect(existsSync(databasePath)).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("serves the live report browser bundle", async () => {
  const { response, text } = await responseText({
    method: "GET",
    path: "/assets/live-report.js",
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/javascript; charset=utf-8");
  expect(text).toContain("situ-live-report");
});

test("returns 405 and Allow for unsupported live UI methods", async () => {
  const { response, text } = await responseText({
    method: "POST",
    path: "/projects/project_123",
  });

  expect(response.status).toBe(405);
  expect(response.headers.get("allow")).toBe("GET");
  expect(JSON.parse(text)).toEqual({
    error: {
      kind: ErrorKind.Validation,
      message: "HTTP method is not supported for this path.",
      details: {
        method: "POST",
        path: "/projects/project_123",
        allowedMethods: ["GET"],
      },
    },
  });
  expect(text.endsWith("\n")).toBe(true);
});

test("ignores query strings for health route matching", async () => {
  const { response, text } = await responseText({
    method: "GET",
    path: "/health?x=1",
  });

  expect(response.status).toBe(200);
  expect(text).toBe('{"ok":true}\n');
});

test("returns 404 JSON for unknown routes", async () => {
  const { response, text } = await responseText({
    method: "GET",
    path: "/missing",
  });

  expect(response.status).toBe(404);
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(text).toBe(
    `${JSON.stringify({
      error: {
        kind: ErrorKind.NotFound,
        message: "HTTP route was not found.",
        details: { path: "/missing" },
      },
    })}\n`,
  );
});

test("matches health path exactly and case-sensitively", async () => {
  const trailingSlash = await responseText({
    method: "GET",
    path: "/health/",
  });
  const differentCase = await responseText({
    method: "GET",
    path: "/Health",
  });

  expect(trailingSlash.response.status).toBe(404);
  expect(JSON.parse(trailingSlash.text)).toEqual({
    error: {
      kind: ErrorKind.NotFound,
      message: "HTTP route was not found.",
      details: { path: "/health/" },
    },
  });
  expect(trailingSlash.text.endsWith("\n")).toBe(true);
  expect(differentCase.response.status).toBe(404);
  expect(JSON.parse(differentCase.text)).toEqual({
    error: {
      kind: ErrorKind.NotFound,
      message: "HTTP route was not found.",
      details: { path: "/Health" },
    },
  });
  expect(differentCase.text.endsWith("\n")).toBe(true);
});

test("returns 405 and Allow for unsupported health methods", async () => {
  const { response, text } = await responseText({
    method: "POST",
    path: "/health",
  });

  expect(response.status).toBe(405);
  expect(response.headers.get("allow")).toBe("GET");
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(text).toBe(
    `${JSON.stringify({
      error: {
        kind: ErrorKind.Validation,
        message: "HTTP method is not supported for this path.",
        details: {
          method: "POST",
          path: "/health",
          allowedMethods: ["GET"],
        },
      },
    })}\n`,
  );
});

test("returns 405 for HEAD, OPTIONS, and non-Situ health methods", async () => {
  const methodResponses = await Promise.all(
    ["HEAD", "OPTIONS", "TRACE"].map(async (method) => {
      const result = await responseText({
        method,
        path: "/health",
      });

      return {
        method,
        response: result.response,
        text: result.text,
      };
    }),
  );

  for (const { method, response, text } of methodResponses) {
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(JSON.parse(text)).toEqual({
      error: {
        kind: ErrorKind.Validation,
        message: "HTTP method is not supported for this path.",
        details: {
          method,
          path: "/health",
          allowedMethods: ["GET"],
        },
      },
    });
    expect(text.endsWith("\n")).toBe(true);
  }
});

test("returns 404 before method checks for unknown paths", async () => {
  const { response, text } = await responseText({
    method: "POST",
    path: "/missing",
  });

  expect(response.status).toBe(404);
  expect(response.headers.has("allow")).toBe(false);
  expect(JSON.parse(text)).toEqual({
    error: {
      kind: ErrorKind.NotFound,
      message: "HTTP route was not found.",
      details: { path: "/missing" },
    },
  });
  expect(text.endsWith("\n")).toBe(true);
});

test("processes Replicache push requests", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const { response, text } = await responseText({
      method: "POST",
      path: "/replicache/push",
      databasePath,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pushVersion: 1,
        clientGroupID: "client-group-1",
        profileID: "profile-1",
        schemaVersion: "schema-1",
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "projects.create",
            args: {
              id: "project_http_push",
              eventId: "event_http_push_project",
              name: "HTTP Push Project",
              repositoryPath: "/tmp/http-push-project",
              goalMarkdown: "Exercise HTTP push.",
              createdBy: {
                actorKind: "human",
                actorId: "scott",
              },
              now: "2026-05-13T12:00:00.000Z",
            },
            timestamp: 1,
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(JSON.parse(text)).toEqual({
      ok: true,
      processedMutationCount: 1,
      skippedMutationCount: 0,
      permanentErrorCount: 0,
      permanentErrors: [],
    });
    expect(text.endsWith("\n")).toBe(true);

    const database = openAppDatabase({ databasePath });

    try {
      expect(
        database
          .query<{ readonly count: number }, []>(
            "SELECT COUNT(*) AS count FROM projects WHERE id = 'project_http_push'",
          )
          .get()?.count,
      ).toBe(1);
    } finally {
      database.close();
    }
  });
});

test("processes Replicache pull requests", async () => {
  await withTempDatabasePath(async (databasePath) => {
    await responseText({
      method: "POST",
      path: "/replicache/push",
      databasePath,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pushVersion: 1,
        clientGroupID: "client-group-1",
        profileID: "profile-1",
        schemaVersion: "schema-1",
        mutations: [
          {
            clientID: "client-1",
            id: 1,
            name: "projects.create",
            args: {
              id: "project_http_pull",
              eventId: "event_http_pull_project",
              name: "HTTP Pull Project",
              repositoryPath: "/tmp/http-pull-project",
              goalMarkdown: "Exercise HTTP pull.",
              createdBy: {
                actorKind: "human",
                actorId: "scott",
              },
              now: "2026-05-13T12:00:00.000Z",
            },
            timestamp: 1,
          },
          {
            clientID: "client-1",
            id: 2,
            name: "tasks.create",
            args: {
              id: "task_http_pull",
              eventId: "event_http_pull_task",
              projectId: "project_http_pull",
              title: "HTTP Pull Task",
              bodyMarkdown: "Exercise HTTP pull task.",
              status: "backlog",
              createdBy: {
                actorKind: "local_agent",
                actorId: "worker-1",
              },
              now: "2026-05-13T12:01:00.000Z",
            },
            timestamp: 2,
          },
        ],
      }),
    });

    const { response, text } = await responseText({
      method: "POST",
      path: "/replicache/pull",
      databasePath,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pullVersion: 1,
        clientGroupID: "client-group-1",
        cookie: null,
        profileID: "profile-1",
        schemaVersion: "schema-1",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(JSON.parse(text)).toEqual({
      cookie: null,
      lastMutationIDChanges: {
        "client-1": 2,
      },
      patch: [
        { op: "clear" },
        {
          op: "put",
          key: "projects/project_http_pull",
          value: {
            id: "project_http_pull",
            name: "HTTP Pull Project",
            repositoryPath: "/tmp/http-pull-project",
            goalMarkdown: "Exercise HTTP pull.",
            status: "active",
            createdBy: {
              actorKind: "human",
              actorId: "scott",
            },
            metadata: {
              createdAt: "2026-05-13T12:00:00.000Z",
              updatedAt: "2026-05-13T12:00:00.000Z",
            },
          },
        },
        {
          op: "put",
          key: "tasks/task_http_pull",
          value: {
            id: "task_http_pull",
            projectId: "project_http_pull",
            title: "HTTP Pull Task",
            bodyMarkdown: "Exercise HTTP pull task.",
            status: "backlog",
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
          key: "events/event_http_pull_project",
          value: {
            id: "event_http_pull_project",
            target: {
              targetKind: "project",
              targetId: "project_http_pull",
            },
            actor: {
              actorKind: "human",
              actorId: "scott",
            },
            summaryMarkdown: "Created project",
            metadata: {
              createdAt: "2026-05-13T12:00:00.000Z",
              updatedAt: "2026-05-13T12:00:00.000Z",
            },
          },
        },
        {
          op: "put",
          key: "events/event_http_pull_task",
          value: {
            id: "event_http_pull_task",
            target: {
              targetKind: "task",
              targetId: "task_http_pull",
            },
            actor: {
              actorKind: "local_agent",
              actorId: "worker-1",
            },
            summaryMarkdown: "Created task",
            metadata: {
              createdAt: "2026-05-13T12:01:00.000Z",
              updatedAt: "2026-05-13T12:01:00.000Z",
            },
          },
        },
      ],
    });
    expect(text.endsWith("\n")).toBe(true);
  });
});

test("validates Replicache push before opening the database", async () => {
  const { response, text } = await responseText({
    method: "POST",
    path: "/replicache/push",
    databasePath: "relative-path-would-fail-if-resolved.db",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pushVersion: 2,
      clientGroupID: "client-group-1",
      mutations: [],
      profileID: "profile-1",
      schemaVersion: "schema-1",
    }),
  });

  expect(response.status).toBe(400);
  expect(JSON.parse(text)).toEqual({
    error: {
      kind: ErrorKind.Validation,
      message: "Expected Replicache pushVersion 1.",
      details: { field: "pushVersion" },
    },
  });
});

test("validates Replicache pull before opening the database", async () => {
  const { response, text } = await responseText({
    method: "POST",
    path: "/replicache/pull",
    databasePath: "relative-path-would-fail-if-resolved.db",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pullVersion: 2,
      clientGroupID: "client-group-1",
      cookie: null,
      profileID: "profile-1",
      schemaVersion: "schema-1",
    }),
  });

  expect(response.status).toBe(400);
  expect(JSON.parse(text)).toEqual({
    error: {
      kind: ErrorKind.Validation,
      message: "Expected Replicache pullVersion 1.",
      details: { field: "pullVersion" },
    },
  });
});

test("rejects invalid Replicache push JSON and methods", async () => {
  const invalidJson = await responseText({
    method: "POST",
    path: "/replicache/push",
    databasePath: "relative-path-would-fail-if-resolved.db",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  const wrongContentType = await responseText({
    method: "POST",
    path: "/replicache/push",
    headers: { "content-type": "text/plain" },
    body: "{}",
  });
  const wrongMethod = await responseText({
    method: "GET",
    path: "/replicache/push",
  });

  expect(invalidJson.response.status).toBe(400);
  expect(JSON.parse(invalidJson.text).error).toEqual({
    kind: ErrorKind.Validation,
    message: "Expected a valid JSON request body.",
    details: { body: "json" },
  });
  expect(wrongContentType.response.status).toBe(400);
  expect(JSON.parse(wrongContentType.text).error).toEqual({
    kind: ErrorKind.Validation,
    message: "Expected a JSON request body.",
    details: { header: "content-type" },
  });
  expect(wrongMethod.response.status).toBe(405);
  expect(wrongMethod.response.headers.get("allow")).toBe("POST");
  expect(JSON.parse(wrongMethod.text).error).toEqual({
    kind: ErrorKind.Validation,
    message: "HTTP method is not supported for this path.",
    details: {
      method: "GET",
      path: "/replicache/push",
      allowedMethods: ["POST"],
    },
  });
});

test("rejects invalid Replicache pull JSON and methods", async () => {
  const invalidJson = await responseText({
    method: "POST",
    path: "/replicache/pull",
    databasePath: "relative-path-would-fail-if-resolved.db",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  const wrongContentType = await responseText({
    method: "POST",
    path: "/replicache/pull",
    headers: { "content-type": "text/plain" },
    body: "{}",
  });
  const wrongMethod = await responseText({
    method: "GET",
    path: "/replicache/pull",
  });

  expect(invalidJson.response.status).toBe(400);
  expect(JSON.parse(invalidJson.text).error).toEqual({
    kind: ErrorKind.Validation,
    message: "Expected a valid JSON request body.",
    details: { body: "json" },
  });
  expect(wrongContentType.response.status).toBe(400);
  expect(JSON.parse(wrongContentType.text).error).toEqual({
    kind: ErrorKind.Validation,
    message: "Expected a JSON request body.",
    details: { header: "content-type" },
  });
  expect(wrongMethod.response.status).toBe(405);
  expect(wrongMethod.response.headers.get("allow")).toBe("POST");
  expect(JSON.parse(wrongMethod.text).error).toEqual({
    kind: ErrorKind.Validation,
    message: "HTTP method is not supported for this path.",
    details: {
      method: "GET",
      path: "/replicache/pull",
      allowedMethods: ["POST"],
    },
  });
});
