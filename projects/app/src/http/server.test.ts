import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { ErrorKind, ValidationError } from "@situ/errors";
import { startSituHttpServer } from "@situ/app";

async function withTempDatabasePath(
  run: (databasePath: string) => Promise<void> | void,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "situ-http-server-"));

  try {
    await run(join(directory, "situ.db"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("serves health on an operating-system assigned port", async () => {
  const server = startSituHttpServer({ port: 0 });

  try {
    expect(server.hostname).toBe("127.0.0.1");
    expect(server.port).toBeGreaterThan(0);
    expect(server.url).toBe(`http://127.0.0.1:${server.port}`);

    const response = await fetch(`${server.url}/health`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(text).toBe('{"ok":true}\n');
  } finally {
    await server.stop();
  }
});

test("processes Replicache push and pull through the live server", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const server = startSituHttpServer({
      port: 0,
      databasePath,
    });

    try {
      const pushResponse = await fetch(`${server.url}/replicache/push`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pushVersion: 1,
          clientGroupID: "client-group-live-server",
          profileID: "profile-live-server",
          schemaVersion: "schema-live-server",
          mutations: [
            {
              clientID: "client-live-server",
              id: 1,
              name: "projects.create",
              args: {
                id: "project_live_server",
                eventId: "event_live_server_project",
                name: "Live Server Project",
                repositoryPath: "/tmp/live-server-project",
                goalMarkdown: "Exercise the live HTTP server.",
                createdBy: {
                  actorKind: "human",
                  actorId: "scott",
                },
                now: "2026-05-14T12:00:00.000Z",
              },
              timestamp: 1,
            },
          ],
        }),
      });

      expect(pushResponse.status).toBe(200);
      expect(JSON.parse(await pushResponse.text())).toEqual({
        ok: true,
        processedMutationCount: 1,
        skippedMutationCount: 0,
        permanentErrorCount: 0,
        permanentErrors: [],
      });

      const pullResponse = await fetch(`${server.url}/replicache/pull`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pullVersion: 1,
          clientGroupID: "client-group-live-server",
          cookie: null,
          profileID: "profile-live-server",
          schemaVersion: "schema-live-server",
        }),
      });
      const pullBody = JSON.parse(await pullResponse.text()) as {
        readonly lastMutationIDChanges: Record<string, number>;
        readonly patch: readonly unknown[];
      };

      expect(pullResponse.status).toBe(200);
      expect(pullBody.lastMutationIDChanges).toEqual({
        "client-live-server": 1,
      });
      expect(pullBody.patch).toContainEqual({
        op: "put",
        key: "projects/project_live_server",
        value: expect.objectContaining({
          id: "project_live_server",
          name: "Live Server Project",
        }),
      });
    } finally {
      await server.stop();
    }
  });
});

test("stop is safe to call more than once and concurrently", async () => {
  const server = startSituHttpServer({ port: 0 });

  await Promise.all([server.stop(), server.stop()]);
  await server.stop();
});

test("rejects invalid server hosts and ports with validation errors", () => {
  for (const hostname of ["", "  ", "0.0.0.0", "192.168.1.10", "situ.example.com"]) {
    expect(() => startSituHttpServer({ hostname, port: 0 })).toThrow(ValidationError);
  }

  for (const port of [-1, 1.5, 65536, Number.NaN]) {
    expect(() => startSituHttpServer({ port })).toThrow(ValidationError);
  }
});

test("health with a nested database path does not create database files", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-http-server-health-"));
  const databasePath = join(directory, "nested", "situ.db");
  const server = startSituHttpServer({
    port: 0,
    databasePath,
  });

  try {
    const response = await fetch(`${server.url}/health`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"ok":true}\n');
    expect(existsSync(dirname(databasePath))).toBe(false);
    expect(existsSync(databasePath)).toBe(false);
  } finally {
    await server.stop();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("server validation errors are structured", () => {
  try {
    startSituHttpServer({ hostname: "0.0.0.0", port: 0 });
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({
      kind: ErrorKind.Validation,
      message: "Expected a loopback host.",
      details: { field: "hostname" },
    });
    return;
  }

  throw new Error("Expected startSituHttpServer to reject the host.");
});
