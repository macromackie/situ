import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { SituId } from "@situ/common";

import { createAppActionContext } from "../actions/index.js";
import { openAppDatabase } from "../db/index.js";
import type { StartSituHttpServerInput, SituHttpServer } from "../http/server.js";
import { runSituCli as runSituCliFromIndex } from "./index.js";
import { runbookText } from "./runbook.js";
import { defaultSituVersion, mainSituCli, runSituCli } from "./situ.js";

const environment = {
  HOME: "/Users/tester",
} as NodeJS.ProcessEnv;

const expectedHelpText = `Usage: situ [global-options] <command>

Global options:
  --json             Print machine-readable JSON output for data commands.
  --db <path>        Use a specific SQLite database path.
  --database <path>  Use a specific SQLite database path.
  --help             Show this help text.
  --version          Print the Situ CLI version.

Commands:
  help      Show this help text.
  version   Print the Situ CLI version.
  doctor    Check local CLI configuration without mutating state.
  runbook   Print the operating runbook for autoresearch runs.
  self-update  Update situ to the latest release.
  serve     Start the local Situ HTTP server.
  artifacts  Manage artifact records.
  baselines  Manage baseline records.
  briefings  Manage live briefing records.
  comments  Manage comments attached to records.
  events    Manage event timeline records.
  experiments  Manage experiment records.
  live      Manage live presentation records.
  measurements  Manage measurement records.
  notifications  Manage notification inbox records.
  projects  Manage project records.
  reports  Manage report records.
  reviews  Manage review records.
  status    Summarize project and repository work status.
  tasks     Manage task records.
  verify    Verify project and repository completion evidence.
`;

async function withTempDatabasePath(run: (databasePath: string) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-"));

  try {
    await run(join(directory, "situ.db"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function forEachSequentially<T>(
  items: readonly T[],
  run: (item: T) => Promise<void>,
): Promise<void> {
  await items.reduce<Promise<void>>(
    (previous, item) => previous.then(() => run(item)),
    Promise.resolve(),
  );
}

function createCliNotificationFixture(input: {
  readonly databasePath: string;
  readonly id: string;
  readonly recipientId: string;
  readonly recipientDisplayName?: string;
  readonly targetId: string;
  readonly summary: string;
  readonly body?: string;
  readonly now?: string;
}): void {
  const database = openAppDatabase({
    databasePath: input.databasePath,
    environment,
  });

  try {
    createAppActionContext({ database }).repositories.notifications.create({
      id: input.id as SituId<"notification">,
      recipient: {
        recipientId: input.recipientId,
        displayName: input.recipientDisplayName,
      },
      target: {
        targetKind: "task",
        targetId: input.targetId as SituId<"task">,
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
        displayName: "Scott",
      },
      summaryMarkdown: input.summary,
      bodyMarkdown: input.body,
      now: input.now,
    });
  } finally {
    database.close();
  }
}

function createGitRepositoryFixture(input?: { readonly name?: string }): {
  readonly directory: string;
  readonly repositoryPath: string;
} {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-repository-"));
  const repositoryPath = join(directory, input?.name ?? "target-repository");

  mkdirSync(join(repositoryPath, ".git"), { recursive: true });

  return {
    directory,
    repositoryPath,
  };
}

async function createCliCurrentProjectFixture(input: {
  readonly databasePath: string;
  readonly repositoryPath: string;
  readonly projectId: string;
  readonly name: string;
  readonly now?: string;
}): Promise<void> {
  const args = [
    "--db",
    input.databasePath,
    "projects",
    "create",
    "--id",
    input.projectId,
    "--name",
    input.name,
    "--repository-path",
    input.repositoryPath,
    "--goal",
    `Goal for ${input.name}`,
    "--actor-kind",
    "human",
    "--actor-id",
    "scott",
  ];

  if (input.now !== undefined) {
    args.push("--now", input.now);
  }

  expect(
    (
      await runSituCli({
        args,
        environment,
      })
    ).exitCode,
  ).toBe(0);
}

async function createCliCurrentTaskFixture(input: {
  readonly databasePath: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly title: string;
  readonly status?: string;
  readonly assignedToKind?: string;
  readonly assignedToId?: string;
  readonly now?: string;
}): Promise<void> {
  const args = [
    "--db",
    input.databasePath,
    "tasks",
    "create",
    "--id",
    input.taskId,
    "--project-id",
    input.projectId,
    "--title",
    input.title,
    "--body",
    `Body for ${input.title}`,
    "--actor-kind",
    "human",
    "--actor-id",
    "scott",
  ];

  if (input.status !== undefined) {
    args.push("--status", input.status);
  }

  if (input.assignedToKind !== undefined && input.assignedToId !== undefined) {
    args.push("--assigned-to-kind", input.assignedToKind, "--assigned-to-id", input.assignedToId);
  }

  if (input.now !== undefined) {
    args.push("--now", input.now);
  }

  expect(
    (
      await runSituCli({
        args,
        environment,
      })
    ).exitCode,
  ).toBe(0);
}

async function createCliProjectFixture(input: {
  readonly databasePath: string;
  readonly prefix: string;
}): Promise<string> {
  const projectId = `project_${input.prefix}`;

  expect(
    (
      await runSituCli({
        args: [
          "--db",
          input.databasePath,
          "projects",
          "create",
          "--id",
          projectId,
          "--name",
          "CLI Report Project",
          "--repository-path",
          `/tmp/${input.prefix}-project`,
          "--goal",
          "Exercise report CLI",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
        ],
        environment,
      })
    ).exitCode,
  ).toBe(0);

  return projectId;
}

async function expectJsonCurrentRepositoryFailure(input: {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly databasePath: string;
}): Promise<void> {
  const result = await runSituCli({
    args: ["--json", "--db", input.databasePath, ...input.args],
    environment,
    cwd: input.cwd,
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr)).toEqual({
    error: {
      kind: "validation",
      message: "Current directory is not inside a git repository.",
      details: {
        cwd: input.cwd,
      },
    },
  });
  expect(result.stderr.endsWith("\n")).toBe(true);
  expect(existsSync(dirname(input.databasePath))).toBe(false);
}

async function runMainSituCliWithFakeServer(input: {
  readonly args: readonly string[];
  readonly environment?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly server?: Omit<SituHttpServer, "stop">;
}): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly starts: readonly StartSituHttpServerInput[];
  readonly stopCount: number;
  readonly waitCount: number;
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const starts: StartSituHttpServerInput[] = [];
  let stopCount = 0;
  let waitCount = 0;
  const server: SituHttpServer = {
    hostname: input.server?.hostname ?? "127.0.0.1",
    port: input.server?.port ?? 48001,
    url: input.server?.url ?? "http://127.0.0.1:48001",
    stop: async () => {
      stopCount += 1;
    },
  };
  const exitCode = await mainSituCli({
    args: input.args,
    environment: input.environment ?? environment,
    cwd: input.cwd,
    writeStdout: (text) => {
      stdout.push(text);
    },
    writeStderr: (text) => {
      stderr.push(text);
    },
    startHttpServer: (startInput) => {
      starts.push(startInput ?? {});
      return server;
    },
    waitForShutdown: async (startedServer) => {
      expect(startedServer).toBe(server);
      waitCount += 1;
    },
  });

  return {
    exitCode,
    stdout: stdout.join(""),
    stderr: stderr.join(""),
    starts,
    stopCount,
    waitCount,
  };
}

async function createCliGeneratedReportProjectFixture(input: {
  readonly databasePath: string;
  readonly prefix: string;
}): Promise<string> {
  const projectId = `project_${input.prefix}`;

  expect(
    (
      await runSituCli({
        args: [
          "--db",
          input.databasePath,
          "projects",
          "create",
          "--id",
          projectId,
          "--event-id",
          `event_${input.prefix}`,
          "--name",
          "CLI Generated Report Project",
          "--repository-path",
          `/tmp/${input.prefix}-project`,
          "--goal",
          "Exercise generated report CLI.",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
          "--actor-display-name",
          "Scott",
          "--now",
          "2026-05-13T12:00:00.000Z",
        ],
        environment,
      })
    ).exitCode,
  ).toBe(0);

  return projectId;
}

async function createCliExperimentFixture(input: {
  readonly databasePath: string;
  readonly prefix: string;
}): Promise<string> {
  const projectId = `project_${input.prefix}`;
  const taskId = `task_${input.prefix}`;
  const experimentId = `experiment_${input.prefix}`;

  expect(
    (
      await runSituCli({
        args: [
          "--db",
          input.databasePath,
          "projects",
          "create",
          "--id",
          projectId,
          "--name",
          "CLI Review Project",
          "--repository-path",
          `/tmp/${input.prefix}-project`,
          "--goal",
          "Exercise review CLI",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
        ],
        environment,
      })
    ).exitCode,
  ).toBe(0);
  expect(
    (
      await runSituCli({
        args: [
          "--db",
          input.databasePath,
          "tasks",
          "create",
          "--id",
          taskId,
          "--project-id",
          projectId,
          "--title",
          "CLI Review Task",
          "--body",
          "Exercise review CLI",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
        ],
        environment,
      })
    ).exitCode,
  ).toBe(0);
  expect(
    (
      await runSituCli({
        args: [
          "--db",
          input.databasePath,
          "experiments",
          "create",
          "--id",
          experimentId,
          "--project-id",
          projectId,
          "--task-id",
          taskId,
          "--title",
          "CLI Review Experiment",
          "--summary",
          "Exercise review CLI",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
        ],
        environment,
      })
    ).exitCode,
  ).toBe(0);

  return experimentId;
}

test("prints the root help contract for all root help entrypoints", async () => {
  await forEachSequentially(
    [[], ["help"], ["--help"], ["--json", "--help"]] as const,
    async (args) => {
      expect(await runSituCli({ args })).toEqual({
        exitCode: 0,
        stderr: "",
        stdout: expectedHelpText,
      });
    },
  );
});

test("prints contextual help without opening databases or resolving repositories", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-help-"));
  const databasePath = join(directory, "nested", "situ.db");
  const cwd = join(directory, "not-a-repository");
  mkdirSync(cwd);

  try {
    const taskHelp = await runSituCli({
      args: ["--json", "--db", databasePath, "tasks", "create", "--help"],
      environment,
      cwd,
    });
    const helpCommand = await runSituCli({
      args: ["--db", databasePath, "help", "tasks", "create"],
      environment,
      cwd,
    });
    const currentHelp = await runSituCli({
      args: ["--db", databasePath, "projects", "init", "--help"],
      environment,
      cwd,
    });
    const serveHelp = await runMainSituCliWithFakeServer({
      args: ["--db", databasePath, "serve", "--help"],
      environment,
      cwd,
    });

    expect(taskHelp).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: helpCommand.stdout,
    });
    expect(taskHelp.stdout).toContain("Usage: situ tasks create [flags]");
    expect(currentHelp.exitCode).toBe(0);
    expect(currentHelp.stdout).toContain("Usage: situ projects init [flags]");
    expect(serveHelp.exitCode).toBe(0);
    expect(serveHelp.stdout).toContain("Usage: situ serve [flags]");
    expect(serveHelp.starts).toHaveLength(0);
    expect(existsSync(dirname(databasePath))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("runSituCli validates serve but does not run the long-running server", async () => {
  expect(await runSituCli({ args: ["serve"], environment })).toEqual({
    exitCode: 1,
    stdout: "",
    stderr: "Error [validation]: Command serve must be run through mainSituCli.\n",
  });
});

test("mainSituCli starts serve through hooks and stops after shutdown", async () => {
  const result = await runMainSituCliWithFakeServer({
    args: ["serve", "--port", "0"],
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe("situ serving http://127.0.0.1:48001\n");
  expect(result.stderr).toBe("");
  expect(result.starts).toHaveLength(1);
  expect(result.starts[0]).toMatchObject({
    port: 0,
    databasePath: "/Users/tester/.situ/situ.db",
    environment,
  });
  expect(result.waitCount).toBe(1);
  expect(result.stopCount).toBe(1);
});

test("mainSituCli prints JSON serve readiness with the resolved database path", async () => {
  const result = await runMainSituCliWithFakeServer({
    args: ["--json", "serve", "--port", "0"],
    server: {
      hostname: "127.0.0.1",
      port: 49152,
      url: "http://127.0.0.1:49152",
    },
  });

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual({
    url: "http://127.0.0.1:49152",
    hostname: "127.0.0.1",
    port: 49152,
    databasePath: "/Users/tester/.situ/situ.db",
  });
  expect(result.stdout.endsWith("\n")).toBe(true);
  expect(result.starts).toHaveLength(1);
  expect(result.starts[0]).toMatchObject({
    port: 0,
    databasePath: "/Users/tester/.situ/situ.db",
    environment,
  });
  expect(result.stopCount).toBe(1);
});

test("serve parser validation fails before starting the server", async () => {
  const cases = [
    {
      args: ["serve", "--bad"],
      stderr: "Error [validation]: Unknown flag for serve: --bad.\n",
    },
    {
      args: ["serve", "--host"],
      stderr: "Error [validation]: Missing value for --host.\n",
    },
    {
      args: ["serve", "--host", "--port", "0"],
      stderr: "Error [validation]: Missing value for --host.\n",
    },
    {
      args: ["serve", "extra"],
      stderr: "Error [validation]: Command serve received extra positional arguments: extra\n",
    },
    {
      args: ["serve", "--host", ""],
      stderr: "Error [validation]: Expected a loopback host.\n",
    },
    {
      args: ["serve", "--host", "0.0.0.0"],
      stderr: "Error [validation]: Expected a loopback host.\n",
    },
    {
      args: ["serve", "--port", "-1"],
      stderr: "Error [validation]: Expected a port from 0 to 65535.\n",
    },
    {
      args: ["serve", "--port", "+1"],
      stderr: "Error [validation]: Expected a port from 0 to 65535.\n",
    },
    {
      args: ["serve", "--port", "1.5"],
      stderr: "Error [validation]: Expected a port from 0 to 65535.\n",
    },
    {
      args: ["serve", "--port", "1e2"],
      stderr: "Error [validation]: Expected a port from 0 to 65535.\n",
    },
    {
      args: ["serve", "--port", "65536"],
      stderr: "Error [validation]: Expected a port from 0 to 65535.\n",
    },
    {
      args: ["serve", "--port", "abc"],
      stderr: "Error [validation]: Expected a port from 0 to 65535.\n",
    },
  ] satisfies readonly {
    readonly args: readonly string[];
    readonly stderr: string;
  }[];

  const results = await Promise.all(
    cases.map(async (testCase) => ({
      testCase,
      result: await runMainSituCliWithFakeServer({
        args: testCase.args,
      }),
    })),
  );

  for (const { result, testCase } of results) {
    expect(result).toMatchObject({
      exitCode: 1,
      stdout: "",
      stderr: testCase.stderr,
      starts: [],
      stopCount: 0,
      waitCount: 0,
    });
  }
});

test("exports the public runner from situ and index entrypoints", async () => {
  expect(await runSituCli({ args: ["version"], version: "v1.2.3" })).toEqual(
    await runSituCliFromIndex({ args: ["version"], version: "v1.2.3" }),
  );
});

test("prints the build version as text", async () => {
  expect(await runSituCli({ args: ["--version"], version: "v1.2.3" })).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: "v1.2.3\n",
  });
});

test("prints the build version as JSON", async () => {
  expect(await runSituCli({ args: ["--json", "version"], version: "v1.2.3" })).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: '{"version":"v1.2.3"}\n',
  });
});

test("runs the doctor command as text", async () => {
  expect(await runSituCli({ args: ["doctor"], environment })).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: "situ doctor ok\n",
  });
});

test("runs the doctor command as JSON with the default database path", async () => {
  expect(
    await runSituCli({
      args: ["--json", "doctor"],
      version: "v1.2.3",
      environment,
    }),
  ).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: '{"ok":true,"version":"v1.2.3","databasePath":"/Users/tester/.situ/situ.db"}\n',
  });
});

test("runs the doctor command as JSON with an explicit database path", async () => {
  expect(
    await runSituCli({
      args: ["--json", "--db", "/tmp/situ.db", "doctor"],
      environment,
    }),
  ).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: `{"ok":true,"version":"${defaultSituVersion}","databasePath":"/tmp/situ.db"}\n`,
  });
});

test("prints the runbook as plain text", async () => {
  expect(await runSituCli({ args: ["runbook"], environment })).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: runbookText,
  });
});

test("prints the runbook as plain text even with --json", async () => {
  expect(await runSituCli({ args: ["--json", "runbook"], environment })).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: runbookText,
  });
});

test("prints runbook usage for both help entrypoints", async () => {
  const usage = `Usage: situ runbook

Print the operating runbook for autoresearch runs. Read-only: prints plain text,
ignores --json, and never opens the database.
`;
  expect(await runSituCli({ args: ["runbook", "--help"], environment })).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: usage,
  });
  expect(await runSituCli({ args: ["help", "runbook"], environment })).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: usage,
  });
});

test("rejects extra args after the runbook command", async () => {
  expect(await runSituCli({ args: ["runbook", "extra"], environment })).toEqual({
    exitCode: 1,
    stdout: "",
    stderr: "Error [validation]: Command runbook does not accept arguments: extra\n",
  });
});

test("runSituCli validates self-update but does not run it", async () => {
  expect(await runSituCli({ args: ["self-update"], environment })).toEqual({
    exitCode: 1,
    stdout: "",
    stderr: "Error [validation]: Command self-update must be run through mainSituCli.\n",
  });
});

test("prints self-update usage for both help entrypoints", async () => {
  const usage = `Usage: situ self-update [--check]

Update situ to the latest GitHub release by re-running the installer.
  --check   Report whether a newer release is available without installing it.

Respects SITU_RELEASE_REPO, SITU_INSTALL_HOME, and SITU_BIN_DIR.
`;
  expect(await runSituCli({ args: ["self-update", "--help"], environment })).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: usage,
  });
  expect(await runSituCli({ args: ["help", "self-update"], environment })).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: usage,
  });
});

test("mainSituCli self-update is a no-op on the latest release", async () => {
  const out: string[] = [];
  const exitCode = await mainSituCli({
    args: ["self-update"],
    version: "v0.0.2",
    environment,
    writeStdout: (text) => out.push(text),
    writeStderr: () => {},
    selfUpdateDeps: { fetchLatestVersion: async () => "v0.0.2" },
    stdoutIsTty: false,
    stdinIsTty: false,
  });
  expect(exitCode).toBe(0);
  expect(out.join("")).toContain("situ v0.0.2 is already the latest release.");
});

test("mainSituCli self-update installs a newer release through the injected installer", async () => {
  const out: string[] = [];
  const installed: string[] = [];
  const exitCode = await mainSituCli({
    args: ["self-update"],
    version: "v0.0.1",
    environment,
    writeStdout: (text) => out.push(text),
    writeStderr: () => {},
    selfUpdateDeps: {
      fetchLatestVersion: async () => "v0.0.2",
      runInstaller: async (version) => {
        installed.push(version);
        return 0;
      },
    },
    stdoutIsTty: false,
    stdinIsTty: false,
  });
  expect(exitCode).toBe(0);
  expect(installed).toEqual(["v0.0.2"]);
  expect(out.join("")).toContain("situ updated to v0.0.2");
});

test("uses the last parsed database path option", async () => {
  expect(
    await runSituCli({
      args: ["--json", "--db", "/tmp/a.db", "--database", "/tmp/b.db", "doctor"],
      environment,
    }),
  ).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: `{"ok":true,"version":"${defaultSituVersion}","databasePath":"/tmp/b.db"}\n`,
  });
});

test("allows duplicate JSON options", async () => {
  expect(await runSituCli({ args: ["--json", "--json", "version"] })).toEqual({
    exitCode: 0,
    stderr: "",
    stdout: `{"version":"${defaultSituVersion}"}\n`,
  });
});

test("accepts command-local equals syntax for value flags", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      await runSituCli({
        args: ["--db", databasePath, "measurements", "recent", "--limit=1"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
  });
});

test("returns a text validation error for an unknown global option before JSON mode", async () => {
  expect(await runSituCli({ args: ["--bogus", "--json", "doctor"], environment })).toEqual({
    exitCode: 1,
    stdout: "",
    stderr: "Error [validation]: Unknown global option: --bogus.\n",
  });
});

test("returns a JSON validation error after JSON mode is parsed", async () => {
  expect(await runSituCli({ args: ["--json", "--database"], environment })).toEqual({
    exitCode: 1,
    stdout: "",
    stderr:
      '{"error":{"kind":"validation","message":"Missing value for --database.","details":{"option":"--database"}}}\n',
  });
});

test("rejects database path options followed by another global option", async () => {
  expect(
    await runSituCli({ args: ["--json", "--db", "--database", "doctor"], environment }),
  ).toEqual({
    exitCode: 1,
    stdout: "",
    stderr:
      '{"error":{"kind":"validation","message":"Missing value for --db.","details":{"option":"--db"}}}\n',
  });
});

test("rejects extra args after base commands", async () => {
  expect(await runSituCli({ args: ["doctor", "--db", "/tmp/situ.db"], environment })).toEqual({
    exitCode: 1,
    stdout: "",
    stderr: "Error [validation]: Command doctor does not accept arguments: --db /tmp/situ.db\n",
  });
});

test("command aliases win before later tokens", async () => {
  expect(await runSituCli({ args: ["--help", "--version"] })).toEqual({
    exitCode: 1,
    stdout: "",
    stderr: "Error [validation]: Unknown help topic: --version.\n",
  });
});

test("appends help after unknown commands in text mode", async () => {
  const result = await runSituCli({ args: ["missing"], environment });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe(
    `Error [validation]: Unknown command: missing\nhint: Run \`situ help\` to see available commands.\n\n${expectedHelpText}`,
  );
});

test("does not append root help after unknown commands in JSON mode", async () => {
  expect(await runSituCli({ args: ["--json", "missing"], environment })).toEqual({
    exitCode: 1,
    stdout: "",
    stderr:
      '{"error":{"kind":"validation","message":"Unknown command: missing","details":{"command":"missing"}}}\n',
  });
});

test("returns JSON validation errors for doctor database path failures", async () => {
  expect(
    await runSituCli({
      args: ["--json", "--database", "relative.db", "doctor"],
      environment,
    }),
  ).toEqual({
    exitCode: 1,
    stdout: "",
    stderr:
      '{"error":{"kind":"validation","message":"Expected an absolute path.","details":{"field":"databasePath"}}}\n',
  });
});

test("creates, lists, gets, and archives projects", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const create = await runSituCli({
      args: [
        "--db",
        databasePath,
        "projects",
        "create",
        "--id",
        "project_cli_1",
        "--event-id",
        "event_project_cli_1",
        "--name",
        "CLI Project",
        "--repository-path",
        "/tmp/cli-project",
        "--goal",
        "Exercise project CLI",
        "--actor-kind",
        "human",
        "--actor-id",
        "scott",
        "--actor-display-name",
        "Scott",
        "--now",
        "2026-05-13T12:00:00.000Z",
      ],
      environment,
    });

    expect(create).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Created project project_cli_1 (event event_project_cli_1)\n",
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "projects", "list"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "project_cli_1\tactive\tCLI Project\n",
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "projects", "get", "project_cli_1"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "project_cli_1\tactive\tCLI Project\n",
    });

    const archive = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "projects",
        "archive",
        "project_cli_1",
        "--event-id",
        "event_project_cli_archive",
        "--actor-kind",
        "local_agent",
        "--actor-id",
        "agent-1",
        "--now",
        "2026-05-13T12:01:00.000Z",
      ],
      environment,
    });

    expect(archive.exitCode).toBe(0);
    expect(archive.stderr).toBe("");
    expect(JSON.parse(archive.stdout)).toMatchObject({
      project: {
        id: "project_cli_1",
        status: "archived",
        name: "CLI Project",
      },
      event: {
        id: "event_project_cli_archive",
        actor: {
          actorKind: "local_agent",
          actorId: "agent-1",
        },
      },
    });
  });
});

test("initializes a project from the current repository in text mode", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      expect(
        await runSituCli({
          args: [
            "--db",
            databasePath,
            "projects",
            "init",
            "--id",
            "project_cli_init_text",
            "--event-id",
            "event_cli_init_text",
            "--goal",
            "Improve the benchmark score.",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          environment,
          cwd: repository.repositoryPath,
        }),
      ).toEqual({
        exitCode: 0,
        stderr: "",
        stdout: "Initialized project project_cli_init_text (event event_cli_init_text)\n",
      });
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("initializes a project from the current repository in JSON mode", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      const result = await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "projects",
          "init",
          "--id",
          "project_cli_init_json",
          "--event-id",
          "event_cli_init_json",
          "--goal",
          "Improve the JSON path.",
          "--actor-kind",
          "local_agent",
          "--actor-id",
          "codex",
          "--actor-display-name",
          "Codex",
          "--now",
          "2026-05-14T12:00:00.000Z",
        ],
        environment,
        cwd: repository.repositoryPath,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        project: {
          id: "project_cli_init_json",
          name: "target-repository",
          repositoryPath: repository.repositoryPath,
          goalMarkdown: "Improve the JSON path.",
          createdBy: {
            actorKind: "local_agent",
            actorId: "codex",
            displayName: "Codex",
          },
        },
        event: {
          id: "event_cli_init_json",
          target: {
            targetKind: "project",
            targetId: "project_cli_init_json",
          },
        },
      });
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("projects init stores the detected repository root from a nested cwd", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();
    const nested = join(repository.repositoryPath, "packages", "app");
    mkdirSync(nested, { recursive: true });

    try {
      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "projects",
              "init",
              "--id",
              "project_cli_init_nested",
              "--event-id",
              "event_cli_init_nested",
              "--goal",
              "Store the repository root.",
              "--actor-kind",
              "human",
              "--actor-id",
              "scott",
            ],
            environment,
            cwd: nested,
          })
        ).exitCode,
      ).toBe(0);

      const get = await runSituCli({
        args: ["--json", "--db", databasePath, "projects", "get", "project_cli_init_nested"],
        environment,
      });

      expect(JSON.parse(get.stdout).project.repositoryPath).toBe(repository.repositoryPath);
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("projects init defaults name from repository basename and allows explicit override", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const defaultNameRepository = createGitRepositoryFixture({ name: "default-name-repo" });
    const explicitNameRepository = createGitRepositoryFixture({ name: "explicit-name-repo" });

    try {
      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "projects",
              "init",
              "--id",
              "project_cli_init_default_name",
              "--goal",
              "Use default name.",
              "--actor-kind",
              "human",
              "--actor-id",
              "scott",
            ],
            environment,
            cwd: defaultNameRepository.repositoryPath,
          })
        ).exitCode,
      ).toBe(0);
      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "projects",
              "init",
              "--id",
              "project_cli_init_explicit_name",
              "--name",
              "Explicit Project Name",
              "--goal",
              "Use explicit name.",
              "--actor-kind",
              "human",
              "--actor-id",
              "scott",
            ],
            environment,
            cwd: explicitNameRepository.repositoryPath,
          })
        ).exitCode,
      ).toBe(0);

      expect(
        JSON.parse(
          (
            await runSituCli({
              args: [
                "--json",
                "--db",
                databasePath,
                "projects",
                "get",
                "project_cli_init_default_name",
              ],
              environment,
            })
          ).stdout,
        ).project.name,
      ).toBe("default-name-repo");
      expect(
        JSON.parse(
          (
            await runSituCli({
              args: [
                "--json",
                "--db",
                databasePath,
                "projects",
                "get",
                "project_cli_init_explicit_name",
              ],
              environment,
            })
          ).stdout,
        ).project.name,
      ).toBe("Explicit Project Name");
    } finally {
      rmSync(defaultNameRepository.directory, { recursive: true, force: true });
      rmSync(explicitNameRepository.directory, { recursive: true, force: true });
    }
  });
});

test("projects init duplicate scalar flags use the last value", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      const result = await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "projects",
          "init",
          "--id",
          "project_ignored",
          "--id",
          "project_cli_init_last",
          "--event-id",
          "event_ignored",
          "--event-id",
          "event_cli_init_last",
          "--name",
          "Ignored Name",
          "--name",
          "Last Name",
          "--goal",
          "Ignored goal.",
          "--goal",
          "Last goal.",
          "--actor-kind",
          "system",
          "--actor-kind",
          "human",
          "--actor-id",
          "ignored",
          "--actor-id",
          "scott",
        ],
        environment,
        cwd: repository.repositoryPath,
      });

      expect(JSON.parse(result.stdout)).toMatchObject({
        project: {
          id: "project_cli_init_last",
          name: "Last Name",
          goalMarkdown: "Last goal.",
          createdBy: {
            actorKind: "human",
            actorId: "scott",
          },
        },
        event: {
          id: "event_cli_init_last",
        },
      });
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("projects init validates parser errors before repository detection and database open", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-init-validation-"));
  const databasePath = join(directory, "nested", "situ.db");
  const cwd = join(directory, "not-a-repository");
  mkdirSync(cwd);

  try {
    const cases = [
      {
        args: [
          "--db",
          databasePath,
          "projects",
          "init",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
        ],
        stderr: "Error [validation]: Missing required flag --goal.\n",
      },
      {
        args: [
          "--db",
          databasePath,
          "projects",
          "init",
          "--goal",
          "Goal",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
          "--missing",
          "value",
        ],
        stderr: "Error [validation]: Unknown flag for projects init: --missing.\n",
      },
      {
        args: [
          "--db",
          databasePath,
          "projects",
          "init",
          "--goal",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
        ],
        stderr: "Error [validation]: Missing value for --goal.\n",
      },
      {
        args: [
          "--db",
          databasePath,
          "projects",
          "init",
          "--goal",
          "Goal",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
          "extra",
        ],
        stderr:
          "Error [validation]: Command projects init received extra positional arguments: extra\n",
      },
      {
        args: [
          "--db",
          databasePath,
          "projects",
          "init",
          "--goal",
          "Goal",
          "--actor-kind",
          "robot",
          "--actor-id",
          "r2",
        ],
        stderr: "Error [validation]: Invalid actor kind for --actor-kind: robot.\n",
      },
    ] as const;

    await forEachSequentially(cases, async ({ args, stderr }) => {
      expect(await runSituCli({ args, environment, cwd })).toEqual({
        exitCode: 1,
        stdout: "",
        stderr,
      });
      expect(existsSync(dirname(databasePath))).toBe(false);
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("projects init repository detection errors happen before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-init-repository-"));
  const databasePath = join(directory, "nested", "situ.db");
  const cwd = join(directory, "not-a-repository");
  mkdirSync(cwd);

  try {
    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "projects",
          "init",
          "--goal",
          "Goal",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
        ],
        environment,
        cwd,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        "Error [validation]: Current directory is not inside a git repository.\nhint: Run from inside a git repository or pass an explicit project flag where supported.\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("projects init repository detection errors respect JSON output mode", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-init-repository-json-"));
  const databasePath = join(directory, "nested", "situ.db");
  const cwd = join(directory, "not-a-repository");
  mkdirSync(cwd);

  try {
    await expectJsonCurrentRepositoryFailure({
      args: ["projects", "init", "--goal", "Goal", "--actor-kind", "human", "--actor-id", "scott"],
      cwd,
      databasePath,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("current repository CLI commands route through app actions", () => {
  const projectsCommandSource = readFileSync(
    fileURLToPath(new URL("./commands/projects.ts", import.meta.url)),
    "utf8",
  );
  const tasksCommandSource = readFileSync(
    fileURLToPath(new URL("./commands/tasks.ts", import.meta.url)),
    "utf8",
  );

  expect(projectsCommandSource).toContain("createProjectAction");
  expect(projectsCommandSource).toContain("listProjectsAction");
  expect(tasksCommandSource).toContain("listProjectsAction");
  expect(tasksCommandSource).toContain("listTasksAction");
  expect(projectsCommandSource).not.toContain('from "@situ/projects"');
  expect(tasksCommandSource).not.toContain('from "@situ/projects"');
  expect(tasksCommandSource).not.toContain('from "@situ/tasks"');
});

test("projects init closes the database after post-open errors", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "projects",
              "init",
              "--id",
              "project_cli_init_close",
              "--event-id",
              "event_cli_init_close",
              "--goal",
              "Create once.",
              "--actor-kind",
              "human",
              "--actor-id",
              "scott",
            ],
            environment,
            cwd: repository.repositoryPath,
          })
        ).exitCode,
      ).toBe(0);

      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "projects",
              "init",
              "--id",
              "project_cli_init_close",
              "--goal",
              "Create twice.",
              "--actor-kind",
              "human",
              "--actor-id",
              "scott",
            ],
            environment,
            cwd: repository.repositoryPath,
          })
        ).exitCode,
      ).toBe(1);
      expect(
        await runSituCli({
          args: ["--db", databasePath, "projects", "list"],
          environment,
        }),
      ).toEqual({
        exitCode: 0,
        stderr: "",
        stdout: "project_cli_init_close\tactive\ttarget-repository\n",
      });
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("mainSituCli passes cwd through to finite commands", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-"));
  const databasePath = join(directory, "situ.db");
  const repository = createGitRepositoryFixture();

  try {
    const result = await runMainSituCliWithFakeServer({
      args: [
        "--db",
        databasePath,
        "projects",
        "init",
        "--id",
        "project_cli_main_cwd",
        "--event-id",
        "event_cli_main_cwd",
        "--goal",
        "Use main cwd.",
        "--actor-kind",
        "human",
        "--actor-id",
        "scott",
      ],
      environment,
      cwd: repository.repositoryPath,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      "Initialized project project_cli_main_cwd (event event_cli_main_cwd)\n",
    );
    expect(result.starts).toEqual([]);
  } finally {
    rmSync(repository.directory, { recursive: true, force: true });
    rmSync(directory, { recursive: true, force: true });
  }
});

test("projects current lists projects for the detected repository in text mode", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "projects",
              "create",
              "--id",
              "project_cli_current_text",
              "--name",
              "Current Text Project",
              "--repository-path",
              repository.repositoryPath,
              "--goal",
              "Find this project.",
              "--actor-kind",
              "human",
              "--actor-id",
              "scott",
            ],
            environment,
          })
        ).exitCode,
      ).toBe(0);
      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "projects",
              "create",
              "--id",
              "project_cli_current_other",
              "--name",
              "Other Project",
              "--repository-path",
              join(repository.repositoryPath, "other"),
              "--goal",
              "Do not find this project.",
              "--actor-kind",
              "human",
              "--actor-id",
              "scott",
            ],
            environment,
          })
        ).exitCode,
      ).toBe(0);

      expect(
        await runSituCli({
          args: ["--db", databasePath, "projects", "current"],
          environment,
          cwd: repository.repositoryPath,
        }),
      ).toEqual({
        exitCode: 0,
        stderr: "",
        stdout: "project_cli_current_text\tactive\tCurrent Text Project\n",
      });
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("projects current lists projects for the detected repository in JSON mode", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "projects",
              "create",
              "--id",
              "project_cli_current_json",
              "--name",
              "Current JSON Project",
              "--repository-path",
              repository.repositoryPath,
              "--goal",
              "Find this JSON project.",
              "--actor-kind",
              "local_agent",
              "--actor-id",
              "codex",
              "--now",
              "2026-05-14T12:00:00.000Z",
            ],
            environment,
          })
        ).exitCode,
      ).toBe(0);

      const result = await runSituCli({
        args: ["--json", "--db", databasePath, "projects", "current"],
        environment,
        cwd: repository.repositoryPath,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        projects: [
          {
            id: "project_cli_current_json",
            name: "Current JSON Project",
            repositoryPath: repository.repositoryPath,
            goalMarkdown: "Find this JSON project.",
            status: "active",
            createdBy: {
              actorKind: "local_agent",
              actorId: "codex",
            },
            metadata: {
              createdAt: "2026-05-14T12:00:00.000Z",
              updatedAt: "2026-05-14T12:00:00.000Z",
            },
          },
        ],
      });
      expect(result.stdout.endsWith("\n")).toBe(true);
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("projects current detects the repository root from a nested cwd", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();
    const nested = join(repository.repositoryPath, "packages", "app");
    mkdirSync(nested, { recursive: true });

    try {
      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "projects",
              "create",
              "--id",
              "project_cli_current_nested",
              "--name",
              "Current Nested Project",
              "--repository-path",
              repository.repositoryPath,
              "--goal",
              "Find from nested cwd.",
              "--actor-kind",
              "human",
              "--actor-id",
              "scott",
            ],
            environment,
          })
        ).exitCode,
      ).toBe(0);

      expect(
        (
          await runSituCli({
            args: ["--db", databasePath, "projects", "current"],
            environment,
            cwd: nested,
          })
        ).stdout,
      ).toBe("project_cli_current_nested\tactive\tCurrent Nested Project\n");
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("projects current supports status filtering and duplicate scalar flags", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "projects",
              "create",
              "--id",
              "project_cli_current_active",
              "--name",
              "Current Active Project",
              "--repository-path",
              repository.repositoryPath,
              "--goal",
              "Stay active.",
              "--actor-kind",
              "human",
              "--actor-id",
              "scott",
            ],
            environment,
          })
        ).exitCode,
      ).toBe(0);
      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "projects",
              "create",
              "--id",
              "project_cli_current_archived",
              "--name",
              "Current Archived Project",
              "--repository-path",
              repository.repositoryPath,
              "--goal",
              "Archive this project.",
              "--actor-kind",
              "human",
              "--actor-id",
              "scott",
            ],
            environment,
          })
        ).exitCode,
      ).toBe(0);
      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "projects",
              "archive",
              "project_cli_current_archived",
              "--actor-kind",
              "human",
              "--actor-id",
              "scott",
            ],
            environment,
          })
        ).exitCode,
      ).toBe(0);

      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "projects",
              "current",
              "--status",
              "active",
              "--status",
              "archived",
            ],
            environment,
            cwd: repository.repositoryPath,
          })
        ).stdout,
      ).toBe("project_cli_current_archived\tarchived\tCurrent Archived Project\n");
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("projects current returns empty text output with exit code zero when no projects match", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      expect(
        await runSituCli({
          args: ["--db", databasePath, "projects", "current"],
          environment,
          cwd: repository.repositoryPath,
        }),
      ).toEqual({
        exitCode: 0,
        stderr: "",
        stdout: "",
      });
      expect(
        (
          await runSituCli({
            args: ["--json", "--db", databasePath, "projects", "current"],
            environment,
            cwd: repository.repositoryPath,
          })
        ).stdout,
      ).toBe('{"projects":[]}\n');
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("projects current validates parser errors before repository detection and database open", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-current-validation-"));
  const databasePath = join(directory, "nested", "situ.db");
  const cwd = join(directory, "not-a-repository");
  mkdirSync(cwd);

  try {
    const cases = [
      {
        args: ["--db", databasePath, "projects", "current", "--missing", "value"],
        stderr: "Error [validation]: Unknown flag for projects current: --missing.\n",
      },
      {
        args: ["--db", databasePath, "projects", "current", "--status"],
        stderr: "Error [validation]: Missing value for --status.\n",
      },
      {
        args: ["--db", databasePath, "projects", "current", "extra"],
        stderr:
          "Error [validation]: Command projects current received extra positional arguments: extra\n",
      },
      {
        args: ["--db", databasePath, "projects", "current", "--status", "missing"],
        stderr: "Error [validation]: Invalid project status: missing.\n",
      },
    ] as const;

    await forEachSequentially(cases, async ({ args, stderr }) => {
      expect(await runSituCli({ args, environment, cwd })).toEqual({
        exitCode: 1,
        stdout: "",
        stderr,
      });
      expect(existsSync(dirname(databasePath))).toBe(false);
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("projects current repository detection errors happen before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-current-repository-"));
  const databasePath = join(directory, "nested", "situ.db");
  const cwd = join(directory, "not-a-repository");
  mkdirSync(cwd);

  try {
    expect(
      await runSituCli({
        args: ["--db", databasePath, "projects", "current"],
        environment,
        cwd,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        "Error [validation]: Current directory is not inside a git repository.\nhint: Run from inside a git repository or pass an explicit project flag where supported.\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("projects current repository detection errors respect JSON output mode", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-current-repository-json-"));
  const databasePath = join(directory, "nested", "situ.db");
  const cwd = join(directory, "not-a-repository");
  mkdirSync(cwd);

  try {
    await expectJsonCurrentRepositoryFailure({
      args: ["projects", "current"],
      cwd,
      databasePath,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("projects current closes the database after post-open errors", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-current-close-"));
  const databasePath = join(directory, "situ.db");
  const repository = createGitRepositoryFixture();
  let database: Database | undefined = new Database(databasePath);

  try {
    database.exec(`
CREATE TABLE _situ_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
INSERT INTO _situ_migrations (id, applied_at)
VALUES ('0001-initial-package-schema', '2026-05-13T12:00:00.000Z');
INSERT INTO _situ_migrations (id, applied_at)
VALUES ('0002-replicache-client-mutations', '2026-05-13T12:00:00.000Z');
`);
    database.close();
    database = undefined;

    expect(
      (
        await runSituCli({
          args: ["--db", databasePath, "projects", "current"],
          environment,
          cwd: repository.repositoryPath,
        })
      ).exitCode,
    ).toBe(1);

    expect(() => new Database(databasePath).close()).not.toThrow();
  } finally {
    database?.close();
    rmSync(repository.directory, { recursive: true, force: true });
    rmSync(directory, { recursive: true, force: true });
  }
});

test("tasks current lists tasks across multiple current-repository projects in text mode", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      await createCliCurrentProjectFixture({
        databasePath,
        repositoryPath: repository.repositoryPath,
        projectId: "project_cli_tasks_current_a",
        name: "Current Tasks A",
        now: "2026-05-14T12:00:00.000Z",
      });
      await createCliCurrentProjectFixture({
        databasePath,
        repositoryPath: repository.repositoryPath,
        projectId: "project_cli_tasks_current_b",
        name: "Current Tasks B",
        now: "2026-05-14T12:01:00.000Z",
      });
      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "projects",
              "archive",
              "project_cli_tasks_current_b",
              "--actor-kind",
              "human",
              "--actor-id",
              "scott",
            ],
            environment,
          })
        ).exitCode,
      ).toBe(0);
      await createCliCurrentProjectFixture({
        databasePath,
        repositoryPath: join(repository.repositoryPath, "other"),
        projectId: "project_cli_tasks_current_other",
        name: "Other Tasks",
      });
      await createCliCurrentTaskFixture({
        databasePath,
        projectId: "project_cli_tasks_current_b",
        taskId: "task_cli_tasks_current_later_project_earlier_task",
        title: "Earlier task in later project",
        status: "backlog",
        now: "2026-05-14T12:02:00.000Z",
      });
      await createCliCurrentTaskFixture({
        databasePath,
        projectId: "project_cli_tasks_current_a",
        taskId: "task_cli_tasks_current_older_project_later_task",
        title: "Later task in older project",
        status: "triage",
        now: "2026-05-14T12:03:00.000Z",
      });
      await createCliCurrentTaskFixture({
        databasePath,
        projectId: "project_cli_tasks_current_other",
        taskId: "task_cli_tasks_current_other",
        title: "Other repository task",
        status: "triage",
      });

      expect(
        await runSituCli({
          args: ["--db", databasePath, "tasks", "current"],
          environment,
          cwd: repository.repositoryPath,
        }),
      ).toEqual({
        exitCode: 0,
        stderr: "",
        stdout:
          "task_cli_tasks_current_later_project_earlier_task\tbacklog\tEarlier task in later project\n" +
          "task_cli_tasks_current_older_project_later_task\ttriage\tLater task in older project\n",
      });
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("tasks current JSON output contains matched projects and tasks", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      await createCliCurrentProjectFixture({
        databasePath,
        repositoryPath: repository.repositoryPath,
        projectId: "project_cli_tasks_current_json",
        name: "Current Tasks JSON",
        now: "2026-05-14T12:00:00.000Z",
      });
      await createCliCurrentTaskFixture({
        databasePath,
        projectId: "project_cli_tasks_current_json",
        taskId: "task_cli_tasks_current_json",
        title: "Current JSON Task",
        status: "in_progress",
        assignedToKind: "local_agent",
        assignedToId: "codex",
        now: "2026-05-14T12:01:00.000Z",
      });

      const result = await runSituCli({
        args: ["--json", "--db", databasePath, "tasks", "current"],
        environment,
        cwd: repository.repositoryPath,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        projects: [
          {
            id: "project_cli_tasks_current_json",
            name: "Current Tasks JSON",
            repositoryPath: repository.repositoryPath,
            goalMarkdown: "Goal for Current Tasks JSON",
            status: "active",
            createdBy: {
              actorKind: "human",
              actorId: "scott",
            },
            metadata: {
              createdAt: "2026-05-14T12:00:00.000Z",
              updatedAt: "2026-05-14T12:00:00.000Z",
            },
          },
        ],
        tasks: [
          {
            id: "task_cli_tasks_current_json",
            projectId: "project_cli_tasks_current_json",
            title: "Current JSON Task",
            bodyMarkdown: "Body for Current JSON Task",
            status: "in_progress",
            assignedTo: {
              actorKind: "local_agent",
              actorId: "codex",
            },
            createdBy: {
              actorKind: "human",
              actorId: "scott",
            },
            metadata: {
              createdAt: "2026-05-14T12:01:00.000Z",
              updatedAt: "2026-05-14T12:01:00.000Z",
            },
          },
        ],
      });
      expect(result.stdout.endsWith("\n")).toBe(true);
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("tasks current filters projects with project status", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      await createCliCurrentProjectFixture({
        databasePath,
        repositoryPath: repository.repositoryPath,
        projectId: "project_cli_tasks_current_active",
        name: "Current Active Tasks",
      });
      await createCliCurrentProjectFixture({
        databasePath,
        repositoryPath: repository.repositoryPath,
        projectId: "project_cli_tasks_current_archived",
        name: "Current Archived Tasks",
      });
      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "projects",
              "archive",
              "project_cli_tasks_current_archived",
              "--actor-kind",
              "human",
              "--actor-id",
              "scott",
            ],
            environment,
          })
        ).exitCode,
      ).toBe(0);
      await createCliCurrentTaskFixture({
        databasePath,
        projectId: "project_cli_tasks_current_active",
        taskId: "task_cli_tasks_current_active",
        title: "Active project task",
      });
      await createCliCurrentTaskFixture({
        databasePath,
        projectId: "project_cli_tasks_current_archived",
        taskId: "task_cli_tasks_current_archived",
        title: "Archived project task",
      });

      expect(
        (
          await runSituCli({
            args: ["--db", databasePath, "tasks", "current", "--project-status", "archived"],
            environment,
            cwd: repository.repositoryPath,
          })
        ).stdout,
      ).toBe("task_cli_tasks_current_archived\ttriage\tArchived project task\n");
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("tasks current filters tasks by status", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      await createCliCurrentProjectFixture({
        databasePath,
        repositoryPath: repository.repositoryPath,
        projectId: "project_cli_tasks_current_status",
        name: "Current Status Tasks",
      });
      await createCliCurrentTaskFixture({
        databasePath,
        projectId: "project_cli_tasks_current_status",
        taskId: "task_cli_tasks_current_status_triage",
        title: "Triage current task",
        status: "triage",
      });
      await createCliCurrentTaskFixture({
        databasePath,
        projectId: "project_cli_tasks_current_status",
        taskId: "task_cli_tasks_current_status_backlog",
        title: "Backlog current task",
        status: "backlog",
      });

      expect(
        (
          await runSituCli({
            args: ["--db", databasePath, "tasks", "current", "--status", "backlog"],
            environment,
            cwd: repository.repositoryPath,
          })
        ).stdout,
      ).toBe("task_cli_tasks_current_status_backlog\tbacklog\tBacklog current task\n");
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("tasks current filters tasks by assignee", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      await createCliCurrentProjectFixture({
        databasePath,
        repositoryPath: repository.repositoryPath,
        projectId: "project_cli_tasks_current_assignee",
        name: "Current Assignee Tasks",
      });
      await createCliCurrentTaskFixture({
        databasePath,
        projectId: "project_cli_tasks_current_assignee",
        taskId: "task_cli_tasks_current_assignee_codex",
        title: "Codex current task",
        assignedToKind: "local_agent",
        assignedToId: "codex",
      });
      await createCliCurrentTaskFixture({
        databasePath,
        projectId: "project_cli_tasks_current_assignee",
        taskId: "task_cli_tasks_current_assignee_human",
        title: "Human current task",
        assignedToKind: "human",
        assignedToId: "scott",
      });

      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "tasks",
              "current",
              "--assigned-to-kind",
              "local_agent",
              "--assigned-to-id",
              "codex",
            ],
            environment,
            cwd: repository.repositoryPath,
          })
        ).stdout,
      ).toBe("task_cli_tasks_current_assignee_codex\ttriage\tCodex current task\n");
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("tasks current duplicate scalar flags use the last value", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      await createCliCurrentProjectFixture({
        databasePath,
        repositoryPath: repository.repositoryPath,
        projectId: "project_cli_tasks_current_duplicate_active",
        name: "Duplicate Active Tasks",
      });
      await createCliCurrentProjectFixture({
        databasePath,
        repositoryPath: repository.repositoryPath,
        projectId: "project_cli_tasks_current_duplicate_archived",
        name: "Duplicate Archived Tasks",
      });
      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "projects",
              "archive",
              "project_cli_tasks_current_duplicate_archived",
              "--actor-kind",
              "human",
              "--actor-id",
              "scott",
            ],
            environment,
          })
        ).exitCode,
      ).toBe(0);
      await createCliCurrentTaskFixture({
        databasePath,
        projectId: "project_cli_tasks_current_duplicate_active",
        taskId: "task_cli_tasks_current_duplicate_active",
        title: "Ignored active task",
        status: "triage",
      });
      await createCliCurrentTaskFixture({
        databasePath,
        projectId: "project_cli_tasks_current_duplicate_archived",
        taskId: "task_cli_tasks_current_duplicate_archived",
        title: "Last flag archived backlog task",
        status: "backlog",
      });

      expect(
        (
          await runSituCli({
            args: [
              "--db",
              databasePath,
              "tasks",
              "current",
              "--project-status",
              "active",
              "--project-status",
              "archived",
              "--status",
              "triage",
              "--status",
              "backlog",
            ],
            environment,
            cwd: repository.repositoryPath,
          })
        ).stdout,
      ).toBe(
        "task_cli_tasks_current_duplicate_archived\tbacklog\tLast flag archived backlog task\n",
      );
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("tasks current returns empty text output with exit code zero when no projects match", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      expect(
        await runSituCli({
          args: ["--db", databasePath, "tasks", "current"],
          environment,
          cwd: repository.repositoryPath,
        }),
      ).toEqual({
        exitCode: 0,
        stderr: "",
        stdout: "",
      });
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("tasks current returns empty text output with exit code zero when no tasks match", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      await createCliCurrentProjectFixture({
        databasePath,
        repositoryPath: repository.repositoryPath,
        projectId: "project_cli_tasks_current_empty_tasks",
        name: "Empty Current Tasks",
      });

      expect(
        await runSituCli({
          args: ["--db", databasePath, "tasks", "current", "--status", "backlog"],
          environment,
          cwd: repository.repositoryPath,
        }),
      ).toEqual({
        exitCode: 0,
        stderr: "",
        stdout: "",
      });
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("tasks current empty JSON output includes projects and tasks arrays", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      expect(
        (
          await runSituCli({
            args: ["--json", "--db", databasePath, "tasks", "current"],
            environment,
            cwd: repository.repositoryPath,
          })
        ).stdout,
      ).toBe('{"projects":[],"tasks":[]}\n');
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("tasks current validates parser errors before repository detection and database open", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-tasks-current-validation-"));
  const databasePath = join(directory, "nested", "situ.db");
  const cwd = join(directory, "not-a-repository");
  mkdirSync(cwd);

  try {
    const cases = [
      {
        args: ["--db", databasePath, "tasks", "current", "--missing", "value"],
        stderr: "Error [validation]: Unknown flag for tasks current: --missing.\n",
      },
      {
        args: ["--db", databasePath, "tasks", "current", "--status"],
        stderr: "Error [validation]: Missing value for --status.\n",
      },
      {
        args: ["--db", databasePath, "tasks", "current", "extra"],
        stderr:
          "Error [validation]: Command tasks current received extra positional arguments: extra\n",
      },
      {
        args: ["--db", databasePath, "tasks", "current", "--project-status", "missing"],
        stderr: "Error [validation]: Invalid project status: missing.\n",
      },
      {
        args: ["--db", databasePath, "tasks", "current", "--status", "missing"],
        stderr: "Error [validation]: Invalid task status: missing.\n",
      },
      {
        args: ["--db", databasePath, "tasks", "current", "--assigned-to-kind", "robot"],
        stderr:
          "Error [validation]: Assignee filter flags require both --assigned-to-kind and --assigned-to-id.\n",
      },
      {
        args: [
          "--db",
          databasePath,
          "tasks",
          "current",
          "--assigned-to-kind",
          "robot",
          "--assigned-to-id",
          "r2",
        ],
        stderr: "Error [validation]: Invalid actor kind for --assigned-to-kind: robot.\n",
      },
      {
        args: ["--db", databasePath, "tasks", "current", "--assigned-to-id", "codex"],
        stderr:
          "Error [validation]: Assignee filter flags require both --assigned-to-kind and --assigned-to-id.\n",
      },
    ] as const;

    await forEachSequentially(cases, async ({ args, stderr }) => {
      expect(await runSituCli({ args, environment, cwd })).toEqual({
        exitCode: 1,
        stdout: "",
        stderr,
      });
      expect(existsSync(dirname(databasePath))).toBe(false);
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("tasks current repository detection errors happen before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-tasks-current-repository-"));
  const databasePath = join(directory, "nested", "situ.db");
  const cwd = join(directory, "not-a-repository");
  mkdirSync(cwd);

  try {
    expect(
      await runSituCli({
        args: ["--db", databasePath, "tasks", "current"],
        environment,
        cwd,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        "Error [validation]: Current directory is not inside a git repository.\nhint: Run from inside a git repository or pass an explicit project flag where supported.\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("tasks current repository detection errors respect JSON output mode", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-tasks-current-repository-json-"));
  const databasePath = join(directory, "nested", "situ.db");
  const cwd = join(directory, "not-a-repository");
  mkdirSync(cwd);

  try {
    await expectJsonCurrentRepositoryFailure({
      args: ["tasks", "current"],
      cwd,
      databasePath,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("tasks current closes the database after post-open errors", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-tasks-current-close-"));
  const databasePath = join(directory, "situ.db");
  const repository = createGitRepositoryFixture();
  let database: Database | undefined = new Database(databasePath);

  try {
    database.exec(`
CREATE TABLE _situ_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
INSERT INTO _situ_migrations (id, applied_at)
VALUES ('0001-initial-package-schema', '2026-05-13T12:00:00.000Z');
INSERT INTO _situ_migrations (id, applied_at)
VALUES ('0002-replicache-client-mutations', '2026-05-13T12:00:00.000Z');
`);
    database.close();
    database = undefined;

    expect(
      (
        await runSituCli({
          args: ["--db", databasePath, "tasks", "current"],
          environment,
          cwd: repository.repositoryPath,
        })
      ).exitCode,
    ).toBe(1);

    expect(() => new Database(databasePath).close()).not.toThrow();
  } finally {
    database?.close();
    rmSync(repository.directory, { recursive: true, force: true });
    rmSync(directory, { recursive: true, force: true });
  }
});

test("creates, lists, moves, and assigns tasks", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const projectResult = await runSituCli({
      args: [
        "--db",
        databasePath,
        "projects",
        "create",
        "--id",
        "project_cli_tasks",
        "--name",
        "CLI Tasks Project",
        "--repository-path",
        "/tmp/cli-tasks-project",
        "--goal",
        "Exercise task CLI",
        "--actor-kind",
        "human",
        "--actor-id",
        "scott",
      ],
      environment,
    });
    expect(projectResult.exitCode).toBe(0);

    const create = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "tasks",
        "create",
        "--id",
        "task_cli_1",
        "--event-id",
        "event_task_cli_1",
        "--project-id",
        "project_cli_tasks",
        "--title",
        "CLI Task",
        "--body",
        "Exercise task creation",
        "--status",
        "backlog",
        "--actor-kind",
        "human",
        "--actor-id",
        "scott",
        "--assigned-to-kind",
        "local_agent",
        "--assigned-to-id",
        "worker-1",
        "--assigned-to-display-name",
        "Worker 1",
        "--now",
        "2026-05-13T12:02:00.000Z",
      ],
      environment,
    });

    expect(create.exitCode).toBe(0);
    expect(create.stderr).toBe("");
    const createBody = JSON.parse(create.stdout);

    expect(createBody).toMatchObject({
      task: {
        id: "task_cli_1",
        projectId: "project_cli_tasks",
        title: "CLI Task",
        status: "backlog",
        assignedTo: {
          actorKind: "local_agent",
          actorId: "worker-1",
          displayName: "Worker 1",
        },
      },
      event: {
        id: "event_task_cli_1",
      },
      notification: {
        recipient: {
          recipientId: "worker-1",
          displayName: "Worker 1",
        },
        target: {
          targetKind: "task",
          targetId: "task_cli_1",
        },
        createdBy: {
          actorKind: "human",
          actorId: "scott",
        },
        summaryMarkdown: "Assigned task: CLI Task",
        metadata: {
          createdAt: "2026-05-13T12:02:00.000Z",
          updatedAt: "2026-05-13T12:02:00.000Z",
        },
      },
    });
    expect(createBody.notification.id.startsWith("notification_")).toBe(true);
    expect("bodyMarkdown" in createBody.notification).toBe(false);
    expect("readAt" in createBody.notification).toBe(false);
    expect("dismissedAt" in createBody.notification).toBe(false);

    const unassignedCreate = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "tasks",
        "create",
        "--id",
        "task_cli_unassigned",
        "--event-id",
        "event_task_cli_unassigned",
        "--project-id",
        "project_cli_tasks",
        "--title",
        "Unassigned CLI Task",
        "--body",
        "Exercise unassigned task creation",
        "--actor-kind",
        "human",
        "--actor-id",
        "scott",
      ],
      environment,
    });
    const unassignedCreateBody = JSON.parse(unassignedCreate.stdout);

    expect(unassignedCreate.exitCode).toBe(0);
    expect(unassignedCreate.stderr).toBe("");
    expect(unassignedCreateBody.task.id).toBe("task_cli_unassigned");
    expect("notification" in unassignedCreateBody).toBe(false);

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "tasks",
          "list",
          "--project-id",
          "project_cli_tasks",
          "--assigned-to-kind",
          "local_agent",
          "--assigned-to-id",
          "worker-1",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "task_cli_1\tbacklog\tCLI Task\n",
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "tasks",
          "move",
          "task_cli_1",
          "--event-id",
          "event_task_cli_move",
          "--status",
          "in_progress",
          "--actor-kind",
          "local_agent",
          "--actor-id",
          "worker-1",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Moved task task_cli_1 to in_progress (event event_task_cli_move)\n",
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "tasks",
          "assign",
          "task_cli_1",
          "--event-id",
          "event_task_cli_clear",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
          "--clear",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Updated task task_cli_1 assignment (event event_task_cli_clear)\n",
    });

    const assign = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "tasks",
        "assign",
        "task_cli_1",
        "--event-id",
        "event_task_cli_assign_again",
        "--actor-kind",
        "human",
        "--actor-id",
        "scott",
        "--assigned-to-kind",
        "local_agent",
        "--assigned-to-id",
        "worker-2",
        "--now",
        "2026-05-13T12:03:00.000Z",
      ],
      environment,
    });
    const assignBody = JSON.parse(assign.stdout);

    expect(assign.exitCode).toBe(0);
    expect(assign.stderr).toBe("");
    expect(assignBody.notification.id.startsWith("notification_")).toBe(true);
    expect(assignBody.notification).toMatchObject({
      recipient: {
        recipientId: "worker-2",
      },
      target: {
        targetKind: "task",
        targetId: "task_cli_1",
      },
      createdBy: {
        actorKind: "human",
        actorId: "scott",
      },
      summaryMarkdown: "Assigned task: CLI Task",
      metadata: {
        createdAt: "2026-05-13T12:03:00.000Z",
        updatedAt: "2026-05-13T12:03:00.000Z",
      },
    });
    expect("bodyMarkdown" in assignBody.notification).toBe(false);

    const clearJson = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "tasks",
        "assign",
        "task_cli_1",
        "--event-id",
        "event_task_cli_clear_json",
        "--actor-kind",
        "human",
        "--actor-id",
        "scott",
        "--clear",
      ],
      environment,
    });
    const clearJsonBody = JSON.parse(clearJson.stdout);

    expect(clearJson.exitCode).toBe(0);
    expect(clearJson.stderr).toBe("");
    expect(clearJsonBody.task.id).toBe("task_cli_1");
    expect(clearJsonBody.event.id).toBe("event_task_cli_clear_json");
    expect("notification" in clearJsonBody).toBe(false);
  });
});

test("creates, lists, gets, moves, assigns, and revises experiments", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      (
        await runSituCli({
          args: [
            "--db",
            databasePath,
            "projects",
            "create",
            "--id",
            "project_cli_experiments",
            "--name",
            "CLI Experiments Project",
            "--repository-path",
            "/tmp/cli-experiments-project",
            "--goal",
            "Exercise experiment CLI",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          environment,
        })
      ).exitCode,
    ).toBe(0);
    expect(
      (
        await runSituCli({
          args: [
            "--db",
            databasePath,
            "tasks",
            "create",
            "--id",
            "task_cli_experiments",
            "--project-id",
            "project_cli_experiments",
            "--title",
            "CLI Experiments Task",
            "--body",
            "Exercise experiment CLI",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          environment,
        })
      ).exitCode,
    ).toBe(0);
    const create = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "experiments",
        "create",
        "--id",
        "experiment_cli_1",
        "--event-id",
        "event_experiment_cli_1",
        "--project-id",
        "project_cli_experiments",
        "--task-id",
        "task_cli_experiments",
        "--title",
        "Ignored title",
        "--title",
        "CLI Experiment",
        "--summary",
        "Ignored summary",
        "--summary",
        "Exercise experiment creation",
        "--status",
        "planned",
        "--base-ref",
        "main",
        "--branch-name",
        "experiment/cli-1",
        "--worktree-path",
        "/tmp/cli-experiment-1",
        "--actor-kind",
        "human",
        "--actor-id",
        "scott",
        "--assigned-to-kind",
        "local_agent",
        "--assigned-to-id",
        "worker-1",
        "--assigned-to-display-name",
        "Worker 1",
        "--now",
        "2026-05-13T12:02:00.000Z",
      ],
      environment,
    });

    expect(create.exitCode).toBe(0);
    expect(create.stderr).toBe("");
    expect(JSON.parse(create.stdout)).toMatchObject({
      experiment: {
        id: "experiment_cli_1",
        projectId: "project_cli_experiments",
        taskId: "task_cli_experiments",
        title: "CLI Experiment",
        summaryMarkdown: "Exercise experiment creation",
        status: "planned",
        revisionNumber: 1,
        assignedTo: {
          actorKind: "local_agent",
          actorId: "worker-1",
          displayName: "Worker 1",
        },
      },
      event: {
        id: "event_experiment_cli_1",
        target: {
          targetKind: "experiment",
          targetId: "experiment_cli_1",
        },
        summaryMarkdown: "Created experiment",
      },
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: [
              "--json",
              "--db",
              databasePath,
              "experiments",
              "list",
              "--project-id",
              "project_cli_experiments",
              "--task-id",
              "task_cli_experiments",
              "--status",
              "planned",
              "--assigned-to-kind",
              "local_agent",
              "--assigned-to-id",
              "worker-1",
            ],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      experiments: [
        {
          id: "experiment_cli_1",
        },
      ],
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "experiments", "get", "experiment_cli_1"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "experiment_cli_1\tplanned\tr1\tCLI Experiment\n",
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "experiments",
          "move",
          "--status",
          "planned",
          "--status",
          "running",
          "experiment_cli_1",
          "--event-id",
          "event_experiment_cli_move",
          "--actor-kind",
          "local_agent",
          "--actor-id",
          "worker-1",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Moved experiment experiment_cli_1 to running (event event_experiment_cli_move)\n",
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "experiments",
          "assign",
          "experiment_cli_1",
          "--event-id",
          "event_experiment_cli_assign",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
          "--assigned-to-kind",
          "local_agent",
          "--assigned-to-id",
          "reviewer-1",
          "--assigned-to-display-name",
          "Reviewer 1",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout:
        "Updated experiment experiment_cli_1 assignment (event event_experiment_cli_assign)\n",
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "experiments",
          "revise",
          "experiment_cli_1",
          "--event-id",
          "event_experiment_cli_revise",
          "--summary",
          "Ready for review",
          "--status",
          "ready_for_review",
          "--clear-base-ref",
          "--clear-branch-name",
          "--clear-worktree-path",
          "--actor-kind",
          "local_agent",
          "--actor-id",
          "worker-1",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout:
        "Revised experiment experiment_cli_1 to revision 2 (event event_experiment_cli_revise)\n",
    });
  });
});

test("returns not found for missing experiment commands", async () => {
  await withTempDatabasePath(async (databasePath) => {
    await forEachSequentially(
      [
        ["--json", "--db", databasePath, "experiments", "get", "experiment_missing"],
        [
          "--json",
          "--db",
          databasePath,
          "experiments",
          "move",
          "experiment_missing",
          "--status",
          "running",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
        ],
        [
          "--json",
          "--db",
          databasePath,
          "experiments",
          "assign",
          "experiment_missing",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
          "--clear",
        ],
        [
          "--json",
          "--db",
          databasePath,
          "experiments",
          "revise",
          "experiment_missing",
          "--summary",
          "Missing",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
        ],
      ],
      async (args) => {
        expect(await runSituCli({ args, environment })).toEqual({
          exitCode: 1,
          stdout: "",
          stderr:
            '{"error":{"kind":"not_found","message":"Experiment was not found.","details":{"id":"experiment_missing"}}}\n',
        });
      },
    );
  });
});

test("validates experiment syntax before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-"));
  const databasePath = join(directory, "nested", "situ.db");

  try {
    await forEachSequentially(
      [
        [
          ["--db", databasePath, "experiments"],
          "Error [validation]: Command experiments requires a subcommand.\n",
        ],
        [
          ["--db", databasePath, "experiments", "wat"],
          "Error [validation]: Unknown experiments subcommand: wat.\n",
        ],
        [
          ["--db", databasePath, "experiments", "get"],
          "Error [validation]: Command experiments get requires <experiment-id>.\n",
        ],
        [
          ["--db", databasePath, "experiments", "create"],
          "Error [validation]: Missing required flag --project-id.\n",
        ],
        [
          ["--db", databasePath, "experiments", "create", "--summary", "--bogus"],
          "Error [validation]: Missing value for --summary.\n",
        ],
        [
          ["--db", databasePath, "experiments", "get", "experiment_cli_1", "--unused"],
          "Error [validation]: Unknown flag for experiments get: --unused.\n",
        ],
        [
          ["--db", databasePath, "experiments", "get", "experiment_cli_1", "extra"],
          "Error [validation]: Command experiments get received extra positional arguments: extra\n",
        ],
        [
          [
            "--db",
            databasePath,
            "experiments",
            "move",
            "experiment_cli_1",
            "--status",
            "blocked",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          "Error [validation]: Invalid experiment status: blocked.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "experiments",
            "create",
            "--project-id",
            "project_1",
            "--task-id",
            "task_1",
            "--title",
            "Experiment",
            "--summary",
            "Summary",
            "--actor-kind",
            "robot",
            "--actor-id",
            "r2",
          ],
          "Error [validation]: Invalid actor kind for --actor-kind: robot.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "experiments",
            "assign",
            "experiment_cli_1",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
            "--clear",
            "--assigned-to-kind",
            "local_agent",
            "--assigned-to-id",
            "worker-1",
          ],
          "Error [validation]: --clear cannot be combined with assignee flags.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "experiments",
            "assign",
            "experiment_cli_1",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          "Error [validation]: Command experiments assign requires assignee flags unless --clear is present.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "experiments",
            "revise",
            "experiment_cli_1",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
            "--base-ref",
            "main",
            "--clear-base-ref",
          ],
          "Error [validation]: --clear-base-ref cannot be combined with --base-ref.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "experiments",
            "revise",
            "experiment_cli_1",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          "Error [validation]: Command experiments revise requires at least one revision flag.\n",
        ],
      ] as const,
      async ([args, stderr]) => {
        expect(await runSituCli({ args, environment })).toEqual({
          exitCode: 1,
          stdout: "",
          stderr,
        });
        expect(existsSync(dirname(databasePath))).toBe(false);
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("creates, lists, gets, and moves baselines", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const projectId = await createCliProjectFixture({
      databasePath,
      prefix: "cli_baselines",
    });

    const create = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "baselines",
        "create",
        "--id",
        "baseline_cli_1",
        "--event-id",
        "event_baseline_cli_created",
        "--project-id",
        projectId,
        "--title",
        "Native baseline",
        "--summary",
        "Unmodified harness output.",
        "--actor-kind",
        "local_agent",
        "--actor-id",
        "baseline-manager",
        "--now",
        "2026-05-13T12:03:00.000Z",
      ],
      environment,
    });

    expect(create.exitCode).toBe(0);
    expect(create.stderr).toBe("");
    expect(JSON.parse(create.stdout)).toMatchObject({
      baseline: {
        id: "baseline_cli_1",
        projectId,
        status: "active",
        title: "Native baseline",
      },
      event: {
        id: "event_baseline_cli_created",
        target: {
          targetKind: "baseline",
          targetId: "baseline_cli_1",
        },
      },
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "baselines", "list", "--project-id", projectId],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: `baseline_cli_1\tactive\t${projectId}\t-\tNative baseline\n`,
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "baselines", "get", "baseline_cli_1"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: `baseline_cli_1\tactive\t${projectId}\t-\tNative baseline\n`,
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "baselines",
          "move",
          "baseline_cli_1",
          "--event-id",
          "event_baseline_cli_moved",
          "--status",
          "superseded",
          "--actor-kind",
          "local_agent",
          "--actor-id",
          "baseline-manager",
          "--now",
          "2026-05-13T12:04:00.000Z",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Moved baseline baseline_cli_1 to superseded (event event_baseline_cli_moved)\n",
    });
  });
});

test("creates, lists, gets, and lists recent measurements", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      (
        await runSituCli({
          args: [
            "--db",
            databasePath,
            "projects",
            "create",
            "--id",
            "project_cli_measurements",
            "--name",
            "CLI Measurements Project",
            "--repository-path",
            "/tmp/cli-measurements-project",
            "--goal",
            "Exercise measurement CLI",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          environment,
        })
      ).exitCode,
    ).toBe(0);
    expect(
      (
        await runSituCli({
          args: [
            "--db",
            databasePath,
            "tasks",
            "create",
            "--id",
            "task_cli_measurements",
            "--project-id",
            "project_cli_measurements",
            "--title",
            "CLI Measurements Task",
            "--body",
            "Exercise measurement CLI",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          environment,
        })
      ).exitCode,
    ).toBe(0);
    expect(
      (
        await runSituCli({
          args: [
            "--db",
            databasePath,
            "experiments",
            "create",
            "--id",
            "experiment_cli_measurements",
            "--project-id",
            "project_cli_measurements",
            "--task-id",
            "task_cli_measurements",
            "--title",
            "CLI Measurements Experiment",
            "--summary",
            "Exercise measurement CLI",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          environment,
        })
      ).exitCode,
    ).toBe(0);
    expect(
      (
        await runSituCli({
          args: [
            "--db",
            databasePath,
            "baselines",
            "create",
            "--id",
            "baseline_cli_measurements",
            "--project-id",
            "project_cli_measurements",
            "--title",
            "Native baseline",
            "--summary",
            "Unmodified harness output.",
            "--actor-kind",
            "local_agent",
            "--actor-id",
            "baseline-manager",
            "--now",
            "2026-05-13T12:02:00.000Z",
          ],
          environment,
        })
      ).exitCode,
    ).toBe(0);

    const create = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "measurements",
        "create",
        "--id",
        "measurement_cli_1",
        "--experiment-id",
        "experiment_cli_measurements",
        "--revision-number",
        "02",
        "--revision-number",
        "1",
        "--metric-name",
        "ignored_metric",
        "--metric-name",
        "latency_ms",
        "--value",
        "1",
        "--value",
        "42.5",
        "--unit",
        "ms",
        "--summary",
        "Ignored summary.",
        "--summary",
        "Latency improved.",
        "--details",
        "Benchmark details.",
        "--actor-kind",
        "local_agent",
        "--actor-id",
        "verifier-1",
        "--actor-display-name",
        "Verifier 1",
        "--now",
        "2026-05-13T12:03:00.000Z",
      ],
      environment,
    });

    expect(create.exitCode).toBe(0);
    expect(create.stderr).toBe("");
    expect(JSON.parse(create.stdout)).toMatchObject({
      measurement: {
        id: "measurement_cli_1",
        experimentId: "experiment_cli_measurements",
        revisionNumber: 1,
        metricName: "latency_ms",
        numericValue: 42.5,
        unit: "ms",
        summaryMarkdown: "Latency improved.",
        detailsMarkdown: "Benchmark details.",
        measuredBy: {
          actorKind: "local_agent",
          actorId: "verifier-1",
          displayName: "Verifier 1",
        },
        metadata: {
          createdAt: "2026-05-13T12:03:00.000Z",
          updatedAt: "2026-05-13T12:03:00.000Z",
        },
      },
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "measurements",
          "create",
          "--id",
          "measurement_cli_baseline",
          "--baseline-id",
          "baseline_cli_measurements",
          "--metric-name",
          "latency_ms",
          "--value",
          "55",
          "--unit",
          "ms",
          "--summary",
          "Baseline latency.",
          "--actor-kind",
          "local_agent",
          "--actor-id",
          "baseline-manager",
          "--now",
          "2026-05-13T12:02:30.000Z",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Created measurement measurement_cli_baseline\n",
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "measurements",
          "list",
          "--baseline-id",
          "baseline_cli_measurements",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout:
        "measurement_cli_baseline\tbaseline/baseline_cli_measurements\tlatency_ms\t55 ms\tBaseline latency.\n",
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "measurements",
          "create",
          "--id",
          "measurement_cli_2",
          "--experiment-id",
          "experiment_cli_measurements",
          "--revision-number",
          "1",
          "--metric-name",
          "score",
          "--value",
          "0.9",
          "--summary",
          "Score improved.",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
          "--now",
          "2026-05-13T12:04:00.000Z",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Created measurement measurement_cli_2\n",
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: [
              "--json",
              "--db",
              databasePath,
              "measurements",
              "list",
              "--experiment-id",
              "experiment_cli_measurements",
              "--revision-number",
              "01",
            ],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      measurements: [
        {
          id: "measurement_cli_1",
        },
        {
          id: "measurement_cli_2",
        },
      ],
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "measurements",
          "list",
          "--experiment-id",
          "experiment_cli_measurements",
          "--revision-number",
          "1",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout:
        "measurement_cli_1\texperiment/experiment_cli_measurements r1\tlatency_ms\t42.5 ms\tLatency improved.\nmeasurement_cli_2\texperiment/experiment_cli_measurements r1\tscore\t0.9\tScore improved.\n",
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: ["--json", "--db", databasePath, "measurements", "recent", "--limit", "01"],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      measurements: [
        {
          id: "measurement_cli_2",
        },
      ],
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "measurements", "get", "measurement_cli_1"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout:
        "measurement_cli_1\texperiment/experiment_cli_measurements r1\tlatency_ms\t42.5 ms\tLatency improved.\n",
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: ["--json", "--db", databasePath, "measurements", "get", "measurement_cli_1"],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      measurement: {
        id: "measurement_cli_1",
      },
    });
  });
});

test("accepts finite measurement numeric value forms", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      (
        await runSituCli({
          args: [
            "--db",
            databasePath,
            "projects",
            "create",
            "--id",
            "project_cli_measurement_numbers",
            "--name",
            "CLI Measurement Numbers Project",
            "--repository-path",
            "/tmp/cli-measurement-numbers-project",
            "--goal",
            "Exercise measurement number parsing",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          environment,
        })
      ).exitCode,
    ).toBe(0);
    expect(
      (
        await runSituCli({
          args: [
            "--db",
            databasePath,
            "tasks",
            "create",
            "--id",
            "task_cli_measurement_numbers",
            "--project-id",
            "project_cli_measurement_numbers",
            "--title",
            "CLI Measurement Numbers Task",
            "--body",
            "Exercise measurement number parsing",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          environment,
        })
      ).exitCode,
    ).toBe(0);
    expect(
      (
        await runSituCli({
          args: [
            "--db",
            databasePath,
            "experiments",
            "create",
            "--id",
            "experiment_cli_measurement_numbers",
            "--project-id",
            "project_cli_measurement_numbers",
            "--task-id",
            "task_cli_measurement_numbers",
            "--title",
            "CLI Measurement Numbers Experiment",
            "--summary",
            "Exercise measurement number parsing",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          environment,
        })
      ).exitCode,
    ).toBe(0);

    await forEachSequentially(
      [
        ["measurement_cli_value_negative", "-1", -1],
        ["measurement_cli_value_plus", "+1", 1],
        ["measurement_cli_value_exponent", "1e2", 100],
        ["measurement_cli_value_hex", "0x10", 16],
      ] as const,
      async ([id, value, expectedValue]) => {
        const result = await runSituCli({
          args: [
            "--json",
            "--db",
            databasePath,
            "measurements",
            "create",
            "--id",
            id,
            "--experiment-id",
            "experiment_cli_measurement_numbers",
            "--revision-number",
            "01",
            "--metric-name",
            "number_value",
            "--value",
            value,
            "--summary",
            "Parsed numeric value.",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          environment,
        });

        expect(result.exitCode).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({
          measurement: {
            id,
            revisionNumber: 1,
            numericValue: expectedValue,
          },
        });
      },
    );
  });
});

test("returns not found for missing measurement get", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      await runSituCli({
        args: ["--json", "--db", databasePath, "measurements", "get", "measurement_missing"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"not_found","message":"Measurement was not found.","details":{"id":"measurement_missing"}}}\n',
    });
  });
});

test("validates measurement syntax before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-"));
  const databasePath = join(directory, "nested", "situ.db");

  try {
    await forEachSequentially(
      [
        [
          ["--db", databasePath, "measurements"],
          "Error [validation]: Command measurements requires a subcommand.\n",
        ],
        [
          ["--db", databasePath, "measurements", "wat"],
          "Error [validation]: Unknown measurements subcommand: wat.\n",
        ],
        [
          ["--db", databasePath, "measurements", "get"],
          "Error [validation]: Command measurements get requires <measurement-id>.\n",
        ],
        [
          ["--db", databasePath, "measurements", "create"],
          "Error [validation]: Command measurements create requires --baseline-id or --experiment-id.\n",
        ],
        [
          ["--db", databasePath, "measurements", "create", "--summary", "--bogus"],
          "Error [validation]: Missing value for --summary.\n",
        ],
        [
          ["--db", databasePath, "measurements", "get", "--unused", "measurement_cli_1"],
          "Error [validation]: Unknown flag for measurements get: --unused.\n",
        ],
        [
          ["--db", databasePath, "measurements", "get", "measurement_cli_1", "extra"],
          "Error [validation]: Command measurements get received extra positional arguments: extra\n",
        ],
        [
          ["--db", databasePath, "measurements", "recent", "--unknown=1"],
          "Error [validation]: Unknown flag for measurements recent: --unknown=1.\n",
        ],
        [
          ["--db", databasePath, "measurements", "recent", "-x"],
          "Error [validation]: Unknown flag for measurements recent: -x.\n",
        ],
        [
          ["--db", databasePath, "measurements", "recent", "--"],
          "Error [validation]: Unknown flag for measurements recent: --.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "measurements",
            "create",
            "--experiment-id",
            "experiment_cli_1",
            "--revision-number",
            "1",
            "--metric-name",
            "score",
            "--value",
            "0.9",
            "--summary",
            "Score",
            "--actor-kind",
            "robot",
            "--actor-id",
            "r2",
          ],
          "Error [validation]: Invalid actor kind for --actor-kind: robot.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "measurements",
            "create",
            "--experiment-id",
            "experiment_cli_1",
            "--revision-number",
            "1.5",
            "--metric-name",
            "score",
            "--value",
            "0.9",
            "--summary",
            "Score",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          "Error [validation]: Expected a positive integer revision number.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "measurements",
            "create",
            "--experiment-id",
            "experiment_cli_1",
            "--revision-number",
            "9007199254740992",
            "--metric-name",
            "score",
            "--value",
            "0.9",
            "--summary",
            "Score",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          "Error [validation]: Expected a positive integer revision number.\n",
        ],
        [
          ["--db", databasePath, "measurements", "recent", "--limit", "1.5"],
          "Error [validation]: Expected a positive integer limit.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "measurements",
            "create",
            "--experiment-id",
            "experiment_cli_1",
            "--revision-number",
            "1",
            "--metric-name",
            "score",
            "--value",
            "   ",
            "--summary",
            "Score",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          "Error [validation]: Expected a finite numeric value.\n",
        ],
      ] as const,
      async ([args, stderr]) => {
        expect(await runSituCli({ args, environment })).toEqual({
          exitCode: 1,
          stdout: "",
          stderr,
        });
        expect(existsSync(dirname(databasePath))).toBe(false);
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("creates, lists, gets, and lists recent reviews", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const experimentId = await createCliExperimentFixture({
      databasePath,
      prefix: "cli_reviews",
    });

    const create = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "reviews",
        "create",
        "--id",
        "review_cli_1",
        "--experiment-id",
        experimentId,
        "--revision-number",
        "02",
        "--revision-number",
        "1",
        "--decision",
        "commented",
        "--decision",
        "changes_requested",
        "--body",
        "Ignored body.",
        "--body",
        "Please fix the failing case.",
        "--reviewer-kind",
        "local_agent",
        "--reviewer-id",
        "reviewer-1",
        "--reviewer-display-name",
        "Reviewer 1",
        "--now",
        "2026-05-13T12:03:00.000Z",
      ],
      environment,
    });

    expect(create.exitCode).toBe(0);
    expect(create.stderr).toBe("");
    expect(JSON.parse(create.stdout)).toMatchObject({
      review: {
        id: "review_cli_1",
        experimentId,
        revisionNumber: 1,
        decision: "changes_requested",
        bodyMarkdown: "Please fix the failing case.",
        reviewer: {
          actorKind: "local_agent",
          actorId: "reviewer-1",
          displayName: "Reviewer 1",
        },
        metadata: {
          createdAt: "2026-05-13T12:03:00.000Z",
          updatedAt: "2026-05-13T12:03:00.000Z",
        },
      },
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "reviews",
          "create",
          "--id",
          "review_cli_2",
          "--experiment-id",
          experimentId,
          "--revision-number",
          "1",
          "--decision",
          "approved",
          "--body",
          "Looks ready.",
          "--reviewer-kind",
          "human",
          "--reviewer-id",
          "scott",
          "--now",
          "2026-05-13T12:04:00.000Z",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Created review review_cli_2\n",
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: [
              "--json",
              "--db",
              databasePath,
              "reviews",
              "list",
              "--experiment-id",
              experimentId,
              "--revision-number",
              "01",
              "--decision",
              "changes_requested",
            ],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      reviews: [
        {
          id: "review_cli_1",
        },
      ],
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "reviews",
          "list",
          "--experiment-id",
          experimentId,
          "--revision-number",
          "1",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout:
        "review_cli_1\texperiment_cli_reviews\tr1\tchanges_requested\tlocal_agent/reviewer-1\tPlease fix the failing case.\nreview_cli_2\texperiment_cli_reviews\tr1\tapproved\thuman/scott\tLooks ready.\n",
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: ["--json", "--db", databasePath, "reviews", "recent", "--limit", "01"],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      reviews: [
        {
          id: "review_cli_2",
        },
      ],
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "reviews", "get", "review_cli_1"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout:
        "review_cli_1\texperiment_cli_reviews\tr1\tchanges_requested\tlocal_agent/reviewer-1\tPlease fix the failing case.\n",
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: ["--json", "--db", databasePath, "reviews", "get", "review_cli_1"],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      review: {
        id: "review_cli_1",
      },
    });

    const singleDashBody = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "reviews",
        "create",
        "--id",
        "review_cli_dash_body",
        "--experiment-id",
        experimentId,
        "--revision-number",
        "1",
        "--decision",
        "commented",
        "--body",
        "-x",
        "--reviewer-kind",
        "human",
        "--reviewer-id",
        "scott",
      ],
      environment,
    });

    expect(singleDashBody.exitCode).toBe(0);
    expect(JSON.parse(singleDashBody.stdout)).toMatchObject({
      review: {
        id: "review_cli_dash_body",
        bodyMarkdown: "-x",
      },
    });
  });
});

test("returns not found for missing review get", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      await runSituCli({
        args: ["--json", "--db", databasePath, "reviews", "get", "review_missing"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"not_found","message":"Review was not found.","details":{"id":"review_missing"}}}\n',
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "reviews", "recent"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
  });
});

test("returns repository validation for blank review body after opening the database", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const experimentId = await createCliExperimentFixture({
      databasePath,
      prefix: "cli_review_blank_body",
    });

    expect(
      await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "reviews",
          "create",
          "--id",
          "review_cli_blank_body",
          "--experiment-id",
          experimentId,
          "--revision-number",
          "1",
          "--decision",
          "commented",
          "--body",
          "   ",
          "--reviewer-kind",
          "human",
          "--reviewer-id",
          "scott",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"validation","message":"Expected a non-empty string.","details":{"field":"bodyMarkdown"}}}\n',
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "reviews", "recent"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
  });
});

test("returns repository conflict for missing review parent after opening the database", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "reviews",
          "create",
          "--id",
          "review_cli_missing_parent",
          "--experiment-id",
          "experiment_missing",
          "--revision-number",
          "1",
          "--decision",
          "commented",
          "--body",
          "Parent experiment is missing.",
          "--reviewer-kind",
          "human",
          "--reviewer-id",
          "scott",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"conflict","message":"Review could not be created because it conflicts with existing state.","details":{"id":"review_cli_missing_parent","experimentId":"experiment_missing"}}}\n',
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "reviews", "recent"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
  });
});

test("validates review syntax before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-"));
  const databasePath = join(directory, "nested", "situ.db");

  try {
    await forEachSequentially(
      [
        [
          ["--db", databasePath, "reviews"],
          "Error [validation]: Command reviews requires a subcommand.\n",
        ],
        [
          ["--db", databasePath, "reviews", "wat"],
          "Error [validation]: Unknown reviews subcommand: wat.\n",
        ],
        [
          ["--db", databasePath, "reviews", "get"],
          "Error [validation]: Command reviews get requires <review-id>.\n",
        ],
        [
          ["--db", databasePath, "reviews", "create"],
          "Error [validation]: Missing required flag --experiment-id.\n",
        ],
        [
          ["--db", databasePath, "reviews", "create", "--body", "--bogus"],
          "Error [validation]: Missing value for --body.\n",
        ],
        [
          ["--db", databasePath, "reviews", "recent", "--limit", "--bad"],
          "Error [validation]: Missing value for --limit.\n",
        ],
        [
          ["--db", databasePath, "reviews", "get", "--unused", "review_cli_1"],
          "Error [validation]: Unknown flag for reviews get: --unused.\n",
        ],
        [
          ["--db", databasePath, "reviews", "get", "review_cli_1", "extra"],
          "Error [validation]: Command reviews get received extra positional arguments: extra\n",
        ],
        [
          ["--db", databasePath, "reviews", "recent", "--unknown=1"],
          "Error [validation]: Unknown flag for reviews recent: --unknown=1.\n",
        ],
        [
          ["--db", databasePath, "reviews", "recent", "-x"],
          "Error [validation]: Unknown flag for reviews recent: -x.\n",
        ],
        [
          ["--db", databasePath, "reviews", "recent", "--"],
          "Error [validation]: Unknown flag for reviews recent: --.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "reviews",
            "create",
            "--experiment-id",
            "experiment_cli_1",
            "--revision-number",
            "1",
            "--decision",
            "bogus",
            "--body",
            "Review body",
            "--reviewer-kind",
            "robot",
          ],
          "Error [validation]: Missing required flag --reviewer-id.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "reviews",
            "create",
            "--experiment-id",
            "experiment_cli_1",
            "--revision-number",
            "1",
            "--decision",
            "commented",
            "--body",
            "Review body",
            "--reviewer-kind",
            "robot",
            "--reviewer-id",
            "r2",
          ],
          "Error [validation]: Invalid actor kind for --reviewer-kind: robot.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "reviews",
            "create",
            "--experiment-id",
            "experiment_cli_1",
            "--revision-number",
            "1",
            "--decision",
            "bogus",
            "--body",
            "Review body",
            "--reviewer-kind",
            "human",
            "--reviewer-id",
            "scott",
          ],
          "Error [validation]: Invalid review decision: bogus.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "reviews",
            "list",
            "--experiment-id",
            "experiment_cli_1",
            "--decision",
            "bogus",
          ],
          "Error [validation]: Invalid review decision: bogus.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "reviews",
            "create",
            "--experiment-id",
            "experiment_cli_1",
            "--revision-number",
            "0",
            "--decision",
            "commented",
            "--body",
            "Review body",
            "--reviewer-kind",
            "human",
            "--reviewer-id",
            "scott",
          ],
          "Error [validation]: Expected a positive integer revision number.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "reviews",
            "create",
            "--experiment-id",
            "experiment_cli_1",
            "--revision-number",
            "9007199254740992",
            "--decision",
            "commented",
            "--body",
            "Review body",
            "--reviewer-kind",
            "human",
            "--reviewer-id",
            "scott",
          ],
          "Error [validation]: Expected a positive integer revision number.\n",
        ],
        [
          ["--db", databasePath, "reviews", "recent", "--limit", "0"],
          "Error [validation]: Expected a positive integer limit.\n",
        ],
      ] as const,
      async ([args, stderr]) => {
        expect(await runSituCli({ args, environment })).toEqual({
          exitCode: 1,
          stdout: "",
          stderr,
        });
        expect(existsSync(dirname(databasePath))).toBe(false);
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("generates a project report as raw Markdown without creating a report record", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const projectId = await createCliGeneratedReportProjectFixture({
      databasePath,
      prefix: "cli_generate_text",
    });

    const result = await runSituCli({
      args: [
        "--db",
        databasePath,
        "reports",
        "generate",
        "--project-id",
        projectId,
        "--generated-at",
        "2026-05-13T12:30:00.000Z",
      ],
      environment,
    });

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: `# Project Report: CLI Generated Report Project

- Project: project_cli_generate_text
- Status: active
- Repository: /tmp/cli_generate_text-project
- Created: 2026-05-13T12:00:00.000Z
- Created by: Scott
- Generated: 2026-05-13T12:30:00.000Z

## Goal

Exercise generated report CLI.

## Project Attachments

Comments

None.

Events

- 2026-05-13T12:00:00.000Z Scott (event_cli_generate_text): Created project

Artifacts

None.

Reports

None.

## Baselines

None.

## Tasks

None.
`,
    });
    expect(result.stdout.endsWith("\n")).toBe(true);
    expect(result.stdout.endsWith("\n\n")).toBe(false);

    expect(
      await runSituCli({
        args: ["--db", databasePath, "reports", "list", "--project-id", projectId],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
  });
});

test("generates a project report as JSON and omits missing generatedAt", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const ignoredProjectId = await createCliGeneratedReportProjectFixture({
      databasePath,
      prefix: "cli_generate_ignored",
    });
    const projectId = await createCliGeneratedReportProjectFixture({
      databasePath,
      prefix: "cli_generate_json",
    });

    const generated = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "reports",
        "generate",
        "--project-id",
        ignoredProjectId,
        "--generated-at",
        "2026-05-13T12:20:00.000Z",
        "--project-id",
        projectId,
        "--generated-at",
        "2026-05-13T12:45:00.000Z",
      ],
      environment,
    });

    expect(generated.exitCode).toBe(0);
    expect(generated.stderr).toBe("");
    expect(generated.stdout.endsWith("\n")).toBe(true);
    expect(generated.stdout.endsWith("\n\n")).toBe(false);
    expect(JSON.parse(generated.stdout)).toMatchObject({
      projectId,
      generatedAt: "2026-05-13T12:45:00.000Z",
      format: "markdown",
      bodyMarkdown: expect.stringContaining("- Generated: 2026-05-13T12:45:00.000Z"),
    });
    expect(JSON.parse(generated.stdout).bodyMarkdown).not.toContain("2026-05-13T12:20:00.000Z");

    const withoutGeneratedAt = JSON.parse(
      (
        await runSituCli({
          args: ["--json", "--db", databasePath, "reports", "generate", "--project-id", projectId],
          environment,
        })
      ).stdout,
    );

    expect(withoutGeneratedAt.projectId).toBe(projectId);
    expect(withoutGeneratedAt.format).toBe("markdown");
    expect("generatedAt" in withoutGeneratedAt).toBe(false);
    expect(withoutGeneratedAt.bodyMarkdown).not.toContain("- Generated:");
  });
});

test("generates a visual project report as raw HTML and JSON", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const projectId = await createCliGeneratedReportProjectFixture({
      databasePath,
      prefix: "cli_generate_visual",
    });

    const html = await runSituCli({
      args: [
        "--db",
        databasePath,
        "reports",
        "generate",
        "--project-id",
        projectId,
        "--format",
        "html",
        "--generated-at",
        "2026-05-13T12:30:00.000Z",
      ],
      environment,
    });

    expect(html.exitCode).toBe(0);
    expect(html.stderr).toBe("");
    expect(html.stdout.startsWith("<!doctype html>\n")).toBe(true);
    expect(html.stdout.endsWith("\n")).toBe(true);
    expect(html.stdout.endsWith("\n\n")).toBe(false);
    expect(html.stdout).toContain("Situ research report");
    expect(html.stdout).toContain("CLI Generated Report Project");
    expect(html.stdout).toContain("Branch lineage");
    expect(html.stdout).toContain("Parallel work");
    expect(html.stdout).toContain("Experiment outcomes");
    expect(html.stdout).toContain('id="masthead"');
    expect(html.stdout).toContain('id="evidence"');
    expect(html.stdout).not.toContain("<script");
    expect(html.stdout).not.toContain("javascript:");

    const json = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "reports",
        "generate",
        "--project-id",
        projectId,
        "--format",
        "html",
      ],
      environment,
    });
    const body = JSON.parse(json.stdout);

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe("");
    expect(body.projectId).toBe(projectId);
    expect(body.format).toBe("html");
    expect(body.bodyHtml).toContain("<!doctype html>");
    expect("bodyMarkdown" in body).toBe(false);

    expect(
      await runSituCli({
        args: ["--db", databasePath, "reports", "list", "--project-id", projectId],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
  });
});

test("returns missing project errors for report generation after opening the database", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      await runSituCli({
        args: ["--json", "--db", databasePath, "reports", "generate", "--project-id", "missing"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"not_found","message":"Project was not found.","details":{"id":"missing"}}}\n',
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "reports", "recent"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });

    expect(
      await runSituCli({
        args: ["--json", "--db", databasePath, "reports", "generate", "--project-id", "-x"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"not_found","message":"Project was not found.","details":{"id":"-x"}}}\n',
    });
  });
});

test("summarizes current repository status from the CLI", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const repository = createGitRepositoryFixture();

    try {
      await createCliCurrentProjectFixture({
        databasePath,
        repositoryPath: repository.repositoryPath,
        projectId: "project_cli_status",
        name: "Status Project",
        now: "2026-05-13T12:00:00.000Z",
      });
      await createCliCurrentTaskFixture({
        databasePath,
        projectId: "project_cli_status",
        taskId: "task_cli_status",
        title: "Status Task",
        status: "backlog",
        now: "2026-05-13T12:01:00.000Z",
      });

      const result = await runSituCli({
        args: ["--json", "--db", databasePath, "status", "--now", "2026-05-13T13:00:00.000Z"],
        environment,
        cwd: repository.repositoryPath,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        generatedAt: "2026-05-13T13:00:00.000Z",
        repositoryPath: repository.repositoryPath,
        projectIds: ["project_cli_status"],
        projects: {
          active: 1,
          archived: 0,
        },
        work: {
          pending: 1,
          running: 0,
          review: 0,
          attention: 0,
          completed: 0,
        },
        tasks: {
          backlog: 1,
        },
        isIdle: false,
      });
    } finally {
      rmSync(repository.directory, { recursive: true, force: true });
    }
  });
});

test("verifies project completion evidence from the CLI", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const projectId = await createCliProjectFixture({
      databasePath,
      prefix: "verify",
    });

    const missingReport = await runSituCli({
      args: ["--json", "--db", databasePath, "verify", "--project", projectId],
      environment,
    });

    expect(missingReport.exitCode).toBe(0);
    expect(missingReport.stderr).toBe("");
    expect(JSON.parse(missingReport.stdout)).toMatchObject({
      projectIds: [projectId],
      ok: false,
      checks: [
        {
          name: "has-project",
          ok: true,
        },
        {
          name: "no-active-tasks",
          ok: true,
        },
        {
          name: "no-active-experiments",
          ok: true,
        },
        {
          name: "accepted-experiments-reviewed",
          ok: true,
        },
        {
          name: "accepted-experiments-have-evidence",
          ok: true,
        },
        {
          name: "final-report-present",
          ok: false,
        },
      ],
    });

    expect(
      (
        await runSituCli({
          args: [
            "--db",
            databasePath,
            "reports",
            "create",
            "--id",
            "report_cli_verify",
            "--project-id",
            projectId,
            "--target-kind",
            "project",
            "--target-id",
            projectId,
            "--title",
            "Final Report",
            "--body",
            "Everything is complete.",
            "--generated-by-kind",
            "local_agent",
            "--generated-by-id",
            "manager",
          ],
          environment,
        })
      ).exitCode,
    ).toBe(0);

    const verified = await runSituCli({
      args: ["--json", "--db", databasePath, "verify", "--project", projectId],
      environment,
    });

    expect(verified.exitCode).toBe(0);
    expect(verified.stderr).toBe("");
    expect(JSON.parse(verified.stdout)).toMatchObject({
      projectIds: [projectId],
      ok: true,
    });
  });
});

test("validates status and verify syntax before repository detection and database open", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-status-"));
  const databasePath = join(directory, "nested", "situ.db");
  const cwd = join(directory, "not-a-repository");
  mkdirSync(cwd);

  try {
    await forEachSequentially(
      [
        [
          ["--db", databasePath, "status", "--bad"],
          "Error [validation]: Unknown flag for status: --bad.\n",
        ],
        [
          ["--db", databasePath, "status", "--now", "not-a-time"],
          "Error [validation]: Expected a valid ISO timestamp for --now.\n",
        ],
        [
          ["--db", databasePath, "status", "extra"],
          "Error [validation]: Command status received extra positional arguments: extra\n",
        ],
        [
          ["--db", databasePath, "verify", "--bad"],
          "Error [validation]: Unknown flag for verify: --bad.\n",
        ],
        [
          ["--db", databasePath, "verify", "--now", "not-a-time"],
          "Error [validation]: Expected a valid ISO timestamp for --now.\n",
        ],
      ] as const,
      async ([args, stderr]) => {
        expect(await runSituCli({ args, environment, cwd })).toEqual({
          exitCode: 1,
          stdout: "",
          stderr,
        });
        expect(existsSync(dirname(databasePath))).toBe(false);
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("creates, lists, gets, and lists recent reports", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const projectId = await createCliProjectFixture({
      databasePath,
      prefix: "cli_reports",
    });

    const create = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "reports",
        "create",
        "--id",
        "report_cli_1",
        "--project-id",
        projectId,
        "--target-kind",
        "task",
        "--target-id",
        "task_cli_1",
        "--title",
        "Ignored title",
        "--title",
        "Final findings",
        "--body",
        "Ignored body.",
        "--body",
        "The candidate is ready.",
        "--generated-by-kind",
        "human",
        "--generated-by-kind",
        "local_agent",
        "--generated-by-id",
        "reporter-1",
        "--generated-by-display-name",
        "Reporter 1",
        "--now",
        "2026-05-13T12:03:00.000Z",
      ],
      environment,
    });

    expect(create.exitCode).toBe(0);
    expect(create.stderr).toBe("");
    expect(JSON.parse(create.stdout)).toMatchObject({
      report: {
        id: "report_cli_1",
        projectId,
        target: {
          targetKind: "task",
          targetId: "task_cli_1",
        },
        title: "Final findings",
        bodyMarkdown: "The candidate is ready.",
        generatedBy: {
          actorKind: "local_agent",
          actorId: "reporter-1",
          displayName: "Reporter 1",
        },
        metadata: {
          createdAt: "2026-05-13T12:03:00.000Z",
          updatedAt: "2026-05-13T12:03:00.000Z",
        },
      },
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "reports",
          "create",
          "--id",
          "report_cli_2",
          "--project-id",
          projectId,
          "--target-kind",
          "task",
          "--target-id",
          "task_cli_1",
          "--title",
          "Follow-up report",
          "--body",
          "Second report body.",
          "--generated-by-kind",
          "human",
          "--generated-by-id",
          "scott",
          "--now",
          "2026-05-13T12:04:00.000Z",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Created report report_cli_2\n",
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: ["--json", "--db", databasePath, "reports", "list", "--project-id", projectId],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      reports: [
        {
          id: "report_cli_1",
        },
        {
          id: "report_cli_2",
        },
      ],
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "reports",
          "list",
          "--target-kind",
          "task",
          "--target-id",
          "task_cli_1",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout:
        "report_cli_1\tproject_cli_reports\ttask/task_cli_1\tFinal findings\tlocal_agent/reporter-1\tThe candidate is ready.\nreport_cli_2\tproject_cli_reports\ttask/task_cli_1\tFollow-up report\thuman/scott\tSecond report body.\n",
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: ["--json", "--db", databasePath, "reports", "recent", "--limit", "1"],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      reports: [
        {
          id: "report_cli_2",
        },
      ],
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: ["--json", "--db", databasePath, "reports", "recent", "--limit", "01"],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      reports: [
        {
          id: "report_cli_2",
        },
      ],
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "reports", "get", "report_cli_1"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout:
        "report_cli_1\tproject_cli_reports\ttask/task_cli_1\tFinal findings\tlocal_agent/reporter-1\tThe candidate is ready.\n",
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: ["--json", "--db", databasePath, "reports", "get", "report_cli_1"],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      report: {
        id: "report_cli_1",
        generatedBy: {
          actorKind: "local_agent",
          actorId: "reporter-1",
          displayName: "Reporter 1",
        },
      },
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "reports",
          "list",
          "--target-kind",
          "review",
          "--target-id",
          "review_missing",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });

    const singleDashTitle = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "reports",
        "create",
        "--id",
        "report_cli_dash_title",
        "--project-id",
        projectId,
        "--target-kind",
        "review",
        "--target-id",
        "review_cli_dash",
        "--title",
        "-x",
        "--body",
        "Single dash title.",
        "--generated-by-kind",
        "human",
        "--generated-by-id",
        "scott",
      ],
      environment,
    });

    expect(singleDashTitle.exitCode).toBe(0);
    expect(JSON.parse(singleDashTitle.stdout)).toMatchObject({
      report: {
        id: "report_cli_dash_title",
        title: "-x",
      },
    });

    const missingTargetCreate = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "reports",
        "create",
        "--id",
        "report_cli_missing_target_success",
        "--project-id",
        projectId,
        "--target-kind",
        "review",
        "--target-id",
        "review_missing_target_success",
        "--title",
        "Missing target report",
        "--body",
        "The target may be created later.",
        "--generated-by-kind",
        "human",
        "--generated-by-id",
        "scott",
      ],
      environment,
    });

    expect(missingTargetCreate.exitCode).toBe(0);
    expect(JSON.parse(missingTargetCreate.stdout)).toMatchObject({
      report: {
        id: "report_cli_missing_target_success",
        target: {
          targetKind: "review",
          targetId: "review_missing_target_success",
        },
      },
    });
  });
});

test("returns not found for missing report get", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      await runSituCli({
        args: ["--json", "--db", databasePath, "reports", "get", "report_missing"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"not_found","message":"Report was not found.","details":{"id":"report_missing"}}}\n',
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "reports", "recent"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
  });
});

test("returns repository validation for blank report body after opening the database", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const projectId = await createCliProjectFixture({
      databasePath,
      prefix: "cli_report_blank_body",
    });

    expect(
      await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "reports",
          "create",
          "--id",
          "report_cli_blank_body",
          "--project-id",
          projectId,
          "--target-kind",
          "task",
          "--target-id",
          "task_cli_blank_body",
          "--title",
          "Blank body",
          "--body",
          "   ",
          "--generated-by-kind",
          "human",
          "--generated-by-id",
          "scott",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"validation","message":"Expected a non-empty string.","details":{"field":"bodyMarkdown"}}}\n',
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "reports", "recent"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
  });
});

test("returns repository conflict for missing report parent after opening the database", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "reports",
          "create",
          "--id",
          "report_cli_missing_parent",
          "--project-id",
          "project_missing",
          "--target-kind",
          "task",
          "--target-id",
          "task_missing_parent",
          "--title",
          "Missing parent",
          "--body",
          "Parent project is missing.",
          "--generated-by-kind",
          "human",
          "--generated-by-id",
          "scott",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"conflict","message":"Report project does not exist.","details":{"projectId":"project_missing"}}}\n',
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "reports", "recent"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
  });
});

test("validates report syntax before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-"));
  const databasePath = join(directory, "nested", "situ.db");

  try {
    await forEachSequentially(
      [
        [
          ["--db", databasePath, "reports"],
          "Error [validation]: Command reports requires a subcommand.\n",
        ],
        [
          ["--db", databasePath, "reports", "wat"],
          "Error [validation]: Unknown reports subcommand: wat.\n",
        ],
        [
          ["--db", databasePath, "reports", "get"],
          "Error [validation]: Command reports get requires <report-id>.\n",
        ],
        [
          ["--db", databasePath, "reports", "create"],
          "Error [validation]: Missing required flag --project-id.\n",
        ],
        [
          ["--db", databasePath, "reports", "generate"],
          "Error [validation]: Missing required flag --project-id.\n",
        ],
        [
          ["--db", databasePath, "reports", "create", "--body", "--bogus"],
          "Error [validation]: Missing value for --body.\n",
        ],
        [
          ["--db", databasePath, "reports", "generate", "--project-id", "--bad"],
          "Error [validation]: Missing value for --project-id.\n",
        ],
        [
          ["--db", databasePath, "reports", "generate", "--generated-at", "--bad"],
          "Error [validation]: Missing value for --generated-at.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "reports",
            "generate",
            "--project-id",
            "project_cli_1",
            "--format",
            "pdf",
          ],
          "Error [validation]: Unsupported report format: pdf.\n",
        ],
        [
          ["--db", databasePath, "reports", "recent", "--limit", "--bad"],
          "Error [validation]: Missing value for --limit.\n",
        ],
        [
          ["--db", databasePath, "reports", "generate", "--bad"],
          "Error [validation]: Unknown flag for reports generate: --bad.\n",
        ],
        [
          ["--db", databasePath, "reports", "get", "--unused", "report_cli_1"],
          "Error [validation]: Unknown flag for reports get: --unused.\n",
        ],
        [
          ["--db", databasePath, "reports", "generate", "--project-id", "project_cli_1", "extra"],
          "Error [validation]: Command reports generate received extra positional arguments: extra\n",
        ],
        [
          ["--db", databasePath, "reports", "generate", "project_cli_1"],
          "Error [validation]: Command reports generate received extra positional arguments: project_cli_1\n",
        ],
        [
          [
            "--db",
            databasePath,
            "reports",
            "generate",
            "project_cli_1",
            "--project-id",
            "project_cli_2",
          ],
          "Error [validation]: Command reports generate received extra positional arguments: project_cli_1\n",
        ],
        [
          ["--db", databasePath, "reports", "get", "report_cli_1", "extra"],
          "Error [validation]: Command reports get received extra positional arguments: extra\n",
        ],
        [
          ["--db", databasePath, "reports", "generate", "--unknown=project_cli_1"],
          "Error [validation]: Unknown flag for reports generate: --unknown=project_cli_1.\n",
        ],
        [
          ["--db", databasePath, "reports", "recent", "--unknown=1"],
          "Error [validation]: Unknown flag for reports recent: --unknown=1.\n",
        ],
        [
          ["--db", databasePath, "reports", "generate", "-x"],
          "Error [validation]: Unknown flag for reports generate: -x.\n",
        ],
        [
          ["--db", databasePath, "reports", "recent", "-x"],
          "Error [validation]: Unknown flag for reports recent: -x.\n",
        ],
        [
          ["--db", databasePath, "reports", "generate", "--"],
          "Error [validation]: Unknown flag for reports generate: --.\n",
        ],
        [
          ["--db", databasePath, "reports", "recent", "--"],
          "Error [validation]: Unknown flag for reports recent: --.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "reports",
            "create",
            "--project-id",
            "project_cli_1",
            "--target-kind",
            "bogus",
            "--target-id",
            "task_cli_1",
            "--title",
            "Report",
            "--body",
            "Report body",
            "--generated-by-kind",
            "robot",
          ],
          "Error [validation]: Missing required flag --generated-by-id.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "reports",
            "create",
            "--project-id",
            "project_cli_1",
            "--target-kind",
            "task",
            "--target-id",
            "task_cli_1",
            "--title",
            "Report",
            "--body",
            "Report body",
            "--generated-by-kind",
            "robot",
            "--generated-by-id",
            "r2",
          ],
          "Error [validation]: Invalid actor kind for --generated-by-kind: robot.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "reports",
            "create",
            "--project-id",
            "project_cli_1",
            "--target-kind",
            "bogus",
            "--target-id",
            "task_cli_1",
            "--title",
            "Report",
            "--body",
            "Report body",
            "--generated-by-kind",
            "human",
            "--generated-by-id",
            "scott",
          ],
          "Error [validation]: Invalid target kind: bogus.\n",
        ],
        [
          ["--db", databasePath, "reports", "list"],
          "Error [validation]: Command reports list requires --project-id or target flags.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "reports",
            "list",
            "--project-id",
            "project_cli_1",
            "--target-kind",
            "task",
            "--target-id",
            "task_cli_1",
          ],
          "Error [validation]: Command reports list cannot combine --project-id with target flags.\n",
        ],
        [
          ["--db", databasePath, "reports", "list", "--target-kind", "task"],
          "Error [validation]: Report target flags require both --target-kind and --target-id.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "reports",
            "list",
            "--target-kind",
            "bogus",
            "--target-id",
            "task_cli_1",
          ],
          "Error [validation]: Invalid target kind: bogus.\n",
        ],
        [
          ["--db", databasePath, "reports", "recent", "--limit", "0"],
          "Error [validation]: Expected a positive integer limit.\n",
        ],
        [
          ["--db", databasePath, "reports", "recent", "--limit", "9007199254740992"],
          "Error [validation]: Expected a positive integer limit.\n",
        ],
      ] as const,
      async ([args, stderr]) => {
        expect(await runSituCli({ args, environment })).toEqual({
          exitCode: 1,
          stdout: "",
          stderr,
        });
        expect(existsSync(dirname(databasePath))).toBe(false);
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("creates, lists, gets, and lists recent briefings", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const projectId = await createCliProjectFixture({
      databasePath,
      prefix: "cli_briefings",
    });

    const create = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "briefings",
        "create",
        "--id",
        "briefing_cli_1",
        "--project-id",
        projectId,
        "--title",
        "Ignored title",
        "--title",
        "Current briefing",
        "--stage",
        "evaluating",
        "--assessment",
        "on_track",
        "--headline",
        "The run is healthy.",
        "--block-json",
        '{"type":"status","summaryMarkdown":"Evidence is improving.","refs":[{"targetKind":"project","targetId":"project_cli_briefings"}]}',
        "--block-json",
        '{"type":"next_steps","items":[{"text":"Run verifier."}]}',
        "--evidence-refs-json",
        '[{"targetKind":"project","targetId":"project_cli_briefings"}]',
        "--authored-by-kind",
        "local_agent",
        "--authored-by-id",
        "manager",
        "--authored-by-display-name",
        "Manager",
        "--now",
        "2026-05-20T12:03:00.000Z",
      ],
      environment,
    });

    expect(create.exitCode).toBe(0);
    expect(create.stderr).toBe("");
    expect(JSON.parse(create.stdout)).toMatchObject({
      briefing: {
        id: "briefing_cli_1",
        projectId,
        title: "Current briefing",
        stage: "evaluating",
        assessment: "on_track",
        headlineMarkdown: "The run is healthy.",
        blocks: [
          {
            type: "status",
            summaryMarkdown: "Evidence is improving.",
          },
          {
            type: "next_steps",
            items: [{ text: "Run verifier." }],
          },
        ],
        evidenceRefs: [
          {
            targetKind: "project",
            targetId: projectId,
          },
        ],
        authoredBy: {
          actorKind: "local_agent",
          actorId: "manager",
          displayName: "Manager",
        },
        metadata: {
          createdAt: "2026-05-20T12:03:00.000Z",
          updatedAt: "2026-05-20T12:03:00.000Z",
        },
      },
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "briefings",
          "create",
          "--id",
          "briefing_cli_2",
          "--project-id",
          projectId,
          "--title",
          "Second briefing",
          "--stage",
          "synthesizing",
          "--assessment",
          "watch",
          "--headline",
          "The run needs one more check.",
          "--blocks-json",
          '[{"type":"callout","tone":"warning","bodyMarkdown":"Verifier is still pending."}]',
          "--authored-by-kind",
          "human",
          "--authored-by-id",
          "scott",
          "--now",
          "2026-05-20T12:04:00.000Z",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Created briefing briefing_cli_2\n",
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: ["--json", "--db", databasePath, "briefings", "list", "--project-id", projectId],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      briefings: [
        {
          id: "briefing_cli_1",
        },
        {
          id: "briefing_cli_2",
        },
      ],
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: ["--json", "--db", databasePath, "briefings", "recent", "--limit", "1"],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      briefings: [
        {
          id: "briefing_cli_2",
        },
      ],
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "briefings", "get", "briefing_cli_1"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout:
        "briefing_cli_1\tproject_cli_briefings\tevaluating\ton_track\tCurrent briefing\tlocal_agent/manager\tThe run is healthy.\n",
    });
  });
});

test("returns not found for missing briefing get", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      await runSituCli({
        args: ["--json", "--db", databasePath, "briefings", "get", "briefing_missing"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"not_found","message":"Briefing was not found.","details":{"id":"briefing_missing"}}}\n',
    });
  });
});

test("creates and lists live presentation records", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const projectId = await createCliProjectFixture({
      databasePath,
      prefix: "cli_live",
    });

    const sharedArgs = [
      "--project-id",
      projectId,
      "--authored-by-kind",
      "local_agent",
      "--authored-by-id",
      "manager",
      "--authored-by-display-name",
      "Manager",
    ] as const;

    const signalResult = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "live",
        "signals",
        "set",
        "--id",
        "live_signal_cli_risk",
        ...sharedArgs,
        "--slot",
        "risk",
        "--label",
        "Risk",
        "--value",
        "Verifier pending",
        "--summary",
        "One targeted check remains.",
        "--tone",
        "watch",
        "--refs-json",
        `[{"targetKind":"project","targetId":"${projectId}"}]`,
        "--now",
        "2026-05-20T12:00:00.000Z",
      ],
      environment,
    });

    expect(signalResult.exitCode).toBe(0);
    expect(JSON.parse(signalResult.stdout)).toMatchObject({
      signal: {
        id: "live_signal_cli_risk",
        projectId,
        slot: "risk",
        value: "Verifier pending",
        tone: "watch",
      },
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "live",
          "nodes",
          "set",
          "--id",
          "live_node_cli_parser",
          ...sharedArgs,
          "--node-key",
          "parser",
          "--kind",
          "branch",
          "--title",
          "Parser branch",
          "--summary",
          "Measured ahead of baseline.",
          "--tone",
          "good",
          "--occurred-at",
          "2026-05-20T12:01:00.000Z",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Created live node live_node_cli_parser\n",
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "live",
          "edges",
          "set",
          "--id",
          "live_edge_cli_parser",
          ...sharedArgs,
          "--edge-key",
          "baseline_to_parser",
          "--from-node-key",
          "baseline",
          "--to-node-key",
          "parser",
          "--relation",
          "led_to",
          "--tone",
          "good",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Created live edge live_edge_cli_parser\n",
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "live",
          "focus",
          "set",
          "--id",
          "live_focus_cli_parser",
          ...sharedArgs,
          "--mode",
          "node",
          "--primary-node-key",
          "parser",
          "--related-node-keys-json",
          '["baseline"]',
          "--summary",
          "Inspect the parser branch.",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Created live focus live_focus_cli_parser\n",
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "live",
          "details",
          "set",
          "--id",
          "live_detail_cli_parser",
          ...sharedArgs,
          "--node-key",
          "parser",
          "--body",
          "Parser branch has the best current measurement.",
          "--facts-json",
          '[{"label":"Delta","value":"+0.09","tone":"good"}]',
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Created live detail live_detail_cli_parser\n",
    });

    const listResult = await runSituCli({
      args: ["--json", "--db", databasePath, "live", "list", "--project-id", projectId],
      environment,
    });

    expect(listResult.exitCode).toBe(0);
    expect(JSON.parse(listResult.stdout)).toMatchObject({
      signals: [{ id: "live_signal_cli_risk" }],
      mapNodes: [{ id: "live_node_cli_parser" }],
      mapEdges: [{ id: "live_edge_cli_parser" }],
      focuses: [{ id: "live_focus_cli_parser" }],
      nodeDetails: [{ id: "live_detail_cli_parser" }],
    });
  });
});

test("validates live syntax before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-"));
  const databasePath = join(directory, "nested", "situ.db");

  try {
    await forEachSequentially(
      [
        [
          ["--db", databasePath, "live"],
          "Error [validation]: Command live requires a subcommand.\n",
        ],
        [
          ["--db", databasePath, "live", "missing", "set"],
          "Error [validation]: Unknown live subcommand: missing.\n",
        ],
        [
          ["--db", databasePath, "live", "signals", "set"],
          "Error [validation]: Missing required flag --project-id.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "live",
            "signals",
            "set",
            "--project-id",
            "project_cli_live",
            "--slot",
            "risk",
            "--label",
            "Risk",
            "--value",
            "None",
            "--tone",
            "bad",
            "--authored-by-kind",
            "human",
            "--authored-by-id",
            "scott",
          ],
          "Error [validation]: Invalid live tone: bad.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "live",
            "details",
            "set",
            "--project-id",
            "project_cli_live",
            "--node-key",
            "parser",
            "--body",
            "Body",
            "--facts-json",
            "{bad",
            "--authored-by-kind",
            "human",
            "--authored-by-id",
            "scott",
          ],
          "Error [validation]: Invalid JSON for --facts-json.\n",
        ],
      ] as const,
      async ([args, stderr]) => {
        expect(await runSituCli({ args, environment })).toEqual({
          exitCode: 1,
          stdout: "",
          stderr,
        });
        expect(existsSync(dirname(databasePath))).toBe(false);
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("validates briefing syntax before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-"));
  const databasePath = join(directory, "nested", "situ.db");

  try {
    await forEachSequentially(
      [
        [
          ["--db", databasePath, "briefings"],
          "Error [validation]: Command briefings requires a subcommand.\n",
        ],
        [
          ["--db", databasePath, "briefings", "wat"],
          "Error [validation]: Unknown briefings subcommand: wat.\n",
        ],
        [
          ["--db", databasePath, "briefings", "get"],
          "Error [validation]: Command briefings get requires <briefing-id>.\n",
        ],
        [
          ["--db", databasePath, "briefings", "create"],
          "Error [validation]: Missing required flag --project-id.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "briefings",
            "create",
            "--project-id",
            "project_cli_1",
            "--title",
            "Briefing",
            "--stage",
            "bogus",
            "--assessment",
            "on_track",
            "--headline",
            "Headline",
            "--authored-by-kind",
            "human",
            "--authored-by-id",
            "scott",
          ],
          "Error [validation]: Invalid briefing stage: bogus.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "briefings",
            "create",
            "--project-id",
            "project_cli_1",
            "--title",
            "Briefing",
            "--stage",
            "evaluating",
            "--assessment",
            "bogus",
            "--headline",
            "Headline",
            "--authored-by-kind",
            "human",
            "--authored-by-id",
            "scott",
          ],
          "Error [validation]: Invalid briefing assessment: bogus.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "briefings",
            "create",
            "--project-id",
            "project_cli_1",
            "--title",
            "Briefing",
            "--stage",
            "evaluating",
            "--assessment",
            "on_track",
            "--headline",
            "Headline",
            "--block-json",
            "{bad",
            "--authored-by-kind",
            "human",
            "--authored-by-id",
            "scott",
          ],
          "Error [validation]: Invalid JSON for --block-json.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "briefings",
            "create",
            "--project-id",
            "project_cli_1",
            "--title",
            "Briefing",
            "--stage",
            "evaluating",
            "--assessment",
            "on_track",
            "--headline",
            "Headline",
            "--block-json",
            '{"type":"status","summaryMarkdown":"One block."}',
            "--blocks-json",
            "[]",
            "--authored-by-kind",
            "human",
            "--authored-by-id",
            "scott",
          ],
          "Error [validation]: Command briefings create cannot combine --blocks-json with --block-json.\n",
        ],
        [
          ["--db", databasePath, "briefings", "recent", "--limit", "0"],
          "Error [validation]: Expected a positive integer limit.\n",
        ],
      ] as const,
      async ([args, stderr]) => {
        expect(await runSituCli({ args, environment })).toEqual({
          exitCode: 1,
          stdout: "",
          stderr,
        });
        expect(existsSync(dirname(databasePath))).toBe(false);
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("creates, lists, gets, and lists recent artifacts", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const create = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "artifacts",
        "create",
        "--id",
        "artifact_cli_1",
        "--target-kind",
        "task",
        "--target-id",
        "task_cli_1",
        "--title",
        "Ignored title",
        "--title",
        "Benchmark output",
        "--summary",
        "Ignored summary.",
        "--summary",
        "Captured benchmark log.",
        "--uri",
        "file:///tmp/ignored.log",
        "--uri",
        "file:///tmp/benchmark.log",
        "--media-type",
        "text/plain",
        "--byte-size",
        "0",
        "--byte-size",
        "01",
        "--sha256",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "--actor-kind",
        "local_agent",
        "--actor-id",
        "verifier-1",
        "--actor-display-name",
        "Verifier 1",
        "--now",
        "2026-05-13T12:03:00.000Z",
      ],
      environment,
    });

    expect(create.exitCode).toBe(0);
    expect(create.stderr).toBe("");
    expect(JSON.parse(create.stdout)).toMatchObject({
      artifact: {
        id: "artifact_cli_1",
        target: {
          targetKind: "task",
          targetId: "task_cli_1",
        },
        title: "Benchmark output",
        summaryMarkdown: "Captured benchmark log.",
        uri: "file:///tmp/benchmark.log",
        mediaType: "text/plain",
        byteSize: 1,
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        createdBy: {
          actorKind: "local_agent",
          actorId: "verifier-1",
          displayName: "Verifier 1",
        },
        metadata: {
          createdAt: "2026-05-13T12:03:00.000Z",
          updatedAt: "2026-05-13T12:03:00.000Z",
        },
      },
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "artifacts",
          "create",
          "--id",
          "artifact_cli_2",
          "--target-kind",
          "task",
          "--target-id",
          "task_cli_1",
          "--title",
          "Screenshot",
          "--summary",
          "Captured screenshot.",
          "--uri",
          "file:///tmp/screenshot.png",
          "--byte-size",
          "0",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
          "--now",
          "2026-05-13T12:04:00.000Z",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Created artifact artifact_cli_2\n",
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: [
              "--json",
              "--db",
              databasePath,
              "artifacts",
              "list",
              "--target-kind",
              "task",
              "--target-id",
              "task_cli_1",
            ],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      artifacts: [
        {
          id: "artifact_cli_1",
        },
        {
          id: "artifact_cli_2",
        },
      ],
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "artifacts",
          "list",
          "--target-kind",
          "task",
          "--target-id",
          "task_cli_1",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout:
        "artifact_cli_1\ttask/task_cli_1\tBenchmark output\tfile:///tmp/benchmark.log\tCaptured benchmark log.\nartifact_cli_2\ttask/task_cli_1\tScreenshot\tfile:///tmp/screenshot.png\tCaptured screenshot.\n",
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: ["--json", "--db", databasePath, "artifacts", "recent", "--limit", "01"],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      artifacts: [
        {
          id: "artifact_cli_2",
        },
      ],
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "artifacts", "get", "artifact_cli_1"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout:
        "artifact_cli_1\ttask/task_cli_1\tBenchmark output\tfile:///tmp/benchmark.log\tCaptured benchmark log.\n",
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: ["--json", "--db", databasePath, "artifacts", "get", "artifact_cli_1"],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      artifact: {
        id: "artifact_cli_1",
      },
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "artifacts",
          "list",
          "--target-kind",
          "review",
          "--target-id",
          "review_missing",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });

    const singleDashTitle = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "artifacts",
        "create",
        "--id",
        "artifact_cli_dash_title",
        "--target-kind",
        "review",
        "--target-id",
        "review_cli_dash",
        "--title",
        "-x",
        "--summary",
        "Single dash title.",
        "--uri",
        "file:///tmp/dash-title.txt",
        "--actor-kind",
        "human",
        "--actor-id",
        "scott",
      ],
      environment,
    });

    expect(singleDashTitle.exitCode).toBe(0);
    expect(JSON.parse(singleDashTitle.stdout)).toMatchObject({
      artifact: {
        id: "artifact_cli_dash_title",
        title: "-x",
      },
    });
  });
});

test("captures local artifact files", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-artifact-capture-"));
  const databasePath = join(directory, "situ.db");
  const stateHomePath = join(directory, "state");
  const sourcePath = join(directory, "source #1.txt");
  const secondSourcePath = join(directory, "second.txt");
  const sourceContentCanary = "captured-file-content-canary-0078-text";
  const sourceContent = `${sourceContentCanary}\nscore: 8.6\n`;
  const secondSourceContentCanary = "captured-file-content-canary-0078-json";
  const secondSourceContent = `${secondSourceContentCanary}\nsecond capture\n`;
  const projectId = "project_cli_artifact_capture";
  writeFileSync(sourcePath, sourceContent);
  writeFileSync(secondSourcePath, secondSourceContent);

  try {
    expect(
      (
        await runSituCli({
          args: [
            "--db",
            databasePath,
            "projects",
            "create",
            "--id",
            projectId,
            "--name",
            "Artifact Capture Project",
            "--repository-path",
            "/tmp/artifact-capture-project",
            "--goal",
            "Capture local evidence.",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          environment,
        })
      ).exitCode,
    ).toBe(0);

    const textResult = await runSituCli({
      args: [
        "--db",
        databasePath,
        "artifacts",
        "capture",
        "--project-id",
        projectId,
        "--id",
        "artifact_cli_capture_text",
        "--target-kind",
        "project",
        "--target-id",
        projectId,
        "--source-path",
        sourcePath,
        "--title",
        "Ignored title",
        "--title",
        "Captured score",
        "--summary",
        "Captured score output.",
        "--media-type",
        "text/plain",
        "--actor-kind",
        "local_agent",
        "--actor-id",
        "verifier-1",
        "--now",
        "2026-05-13T12:05:00.000Z",
      ],
      environment: {
        ...environment,
        SITU_HOME: stateHomePath,
      },
    });

    expect(textResult).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Captured artifact artifact_cli_capture_text\n",
    });
    expect(`${textResult.stdout}${textResult.stderr}`).not.toContain(sourceContentCanary);
    expect(
      JSON.parse(
        (
          await runSituCli({
            args: ["--json", "--db", databasePath, "artifacts", "get", "artifact_cli_capture_text"],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      artifact: {
        id: "artifact_cli_capture_text",
        title: "Captured score",
      },
    });

    const destinationPath = join(
      stateHomePath,
      "projects",
      projectId,
      "artifacts",
      "artifact_cli_capture_text",
      "source #1.txt",
    );
    expect(readFileSync(destinationPath, "utf8")).toBe(sourceContent);

    const jsonResult = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "artifacts",
        "capture",
        "--project-id",
        projectId,
        "--id",
        "artifact_cli_capture_json",
        "--target-kind",
        "task",
        "--target-id",
        "task_cli_capture",
        "--source-path",
        secondSourcePath,
        "--title",
        "-x",
        "--summary",
        "Second capture.",
        "--actor-kind",
        "human",
        "--actor-id",
        "scott",
      ],
      environment: {
        ...environment,
        SITU_HOME: stateHomePath,
      },
    });
    const captured = JSON.parse(jsonResult.stdout);
    const capturedPath = fileURLToPath(captured.artifact.uri);

    expect(jsonResult.exitCode).toBe(0);
    expect(jsonResult.stderr).toBe("");
    expect(`${jsonResult.stdout}${jsonResult.stderr}`).not.toContain(secondSourceContentCanary);
    expect(captured.artifact).toMatchObject({
      id: "artifact_cli_capture_json",
      target: {
        targetKind: "task",
        targetId: "task_cli_capture",
      },
      title: "-x",
      summaryMarkdown: "Second capture.",
      byteSize: Buffer.byteLength(secondSourceContent),
      sha256: createHash("sha256").update(secondSourceContent).digest("hex"),
    });
    expect(captured.artifact.uri).toBe(pathToFileURL(capturedPath).href);
    expect(readFileSync(capturedPath, "utf8")).toBe(secondSourceContent);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("validates artifact capture syntax before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-artifact-capture-"));
  const databasePath = join(directory, "nested", "situ.db");
  const sourcePath = join(directory, "source.txt");
  writeFileSync(sourcePath, "capture");

  try {
    await forEachSequentially(
      [
        [
          ["--db", databasePath, "artifacts", "capture"],
          "Error [validation]: Missing required flag --project-id.\n",
        ],
        [
          ["--db", databasePath, "artifacts", "capture", "--project-id", "project_1"],
          "Error [validation]: Missing required flag --target-kind.\n",
        ],
        [
          ["--db", databasePath, "artifacts", "capture", "--summary", "--bad"],
          "Error [validation]: Missing value for --summary.\n",
        ],
        [
          ["--db", databasePath, "artifacts", "capture", "--uri", "file:///tmp/nope"],
          "Error [validation]: Unknown flag for artifacts capture: --uri.\n",
        ],
        [
          ["--db", databasePath, "artifacts", "capture", "extra"],
          "Error [validation]: Command artifacts capture received extra positional arguments: extra\n",
        ],
        [
          [
            "--db",
            databasePath,
            "artifacts",
            "capture",
            "--project-id",
            "project_1",
            "--target-kind",
            "task",
            "--target-id",
            "task_1",
            "--source-path",
            "relative.txt",
            "--title",
            "Artifact",
            "--summary",
            "Summary",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          "Error [validation]: Expected an absolute source path.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "artifacts",
            "capture",
            "--project-id",
            "project_1",
            "--target-kind",
            "bogus",
            "--target-id",
            "task_1",
            "--source-path",
            sourcePath,
            "--title",
            "Artifact",
            "--summary",
            "Summary",
            "--actor-kind",
            "human",
          ],
          "Error [validation]: Missing required flag --actor-id.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "artifacts",
            "capture",
            "--project-id",
            "project_1",
            "--target-kind",
            "bogus",
            "--target-id",
            "task_1",
            "--source-path",
            sourcePath,
            "--title",
            "Artifact",
            "--summary",
            "Summary",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          "Error [validation]: Invalid target kind: bogus.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "artifacts",
            "capture",
            "--project-id",
            "project_1",
            "--target-kind",
            "task",
            "--target-id",
            "task_1",
            "--source-path",
            sourcePath,
            "--title",
            "Artifact",
            "--summary",
            "Summary",
            "--actor-kind",
            "robot",
            "--actor-id",
            "r2",
          ],
          "Error [validation]: Invalid actor kind for --actor-kind: robot.\n",
        ],
      ] as const,
      async ([args, stderr]) => {
        expect(await runSituCli({ args, environment })).toEqual({
          exitCode: 1,
          stdout: "",
          stderr,
        });
        expect(existsSync(dirname(databasePath))).toBe(false);
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("artifact capture closes the database after after-open errors", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-artifact-capture-"));
  const databasePath = join(directory, "situ.db");
  const stateHomePath = join(directory, "state");
  const sourcePath = join(directory, "source.txt");
  writeFileSync(sourcePath, "capture");

  try {
    expect(
      await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "artifacts",
          "capture",
          "--project-id",
          "project_missing_capture",
          "--id",
          "artifact_missing_capture",
          "--target-kind",
          "project",
          "--target-id",
          "project_missing_capture",
          "--source-path",
          sourcePath,
          "--title",
          "Missing project",
          "--summary",
          "Should fail.",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
        ],
        environment: {
          ...environment,
          SITU_HOME: stateHomePath,
        },
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"not_found","message":"Project was not found.","details":{"id":"project_missing_capture"}}}\n',
    });
    expect(existsSync(join(stateHomePath, "projects"))).toBe(false);

    expect(
      (
        await runSituCli({
          args: ["--db", databasePath, "projects", "list"],
          environment,
        })
      ).exitCode,
    ).toBe(0);

    expect(
      (
        await runSituCli({
          args: [
            "--db",
            databasePath,
            "projects",
            "create",
            "--id",
            "project_source_missing_capture",
            "--name",
            "Source Missing Capture Project",
            "--repository-path",
            "/tmp/source-missing-capture",
            "--goal",
            "Exercise after-open validation.",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          environment,
        })
      ).exitCode,
    ).toBe(0);

    expect(
      await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "artifacts",
          "capture",
          "--project-id",
          "project_source_missing_capture",
          "--id",
          "artifact_source_missing_capture",
          "--target-kind",
          "project",
          "--target-id",
          "project_source_missing_capture",
          "--source-path",
          join(directory, "missing.txt"),
          "--title",
          "Missing source",
          "--summary",
          "Should fail.",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
        ],
        environment: {
          ...environment,
          SITU_HOME: stateHomePath,
        },
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"validation","message":"Source file was not found.","details":{"sourcePath":"' +
        join(directory, "missing.txt") +
        '"}}}\n',
    });

    expect(
      (
        await runSituCli({
          args: ["--db", databasePath, "projects", "list"],
          environment,
        })
      ).exitCode,
    ).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("returns not found for missing artifact get", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      await runSituCli({
        args: ["--json", "--db", databasePath, "artifacts", "get", "artifact_missing"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"not_found","message":"Artifact was not found.","details":{"id":"artifact_missing"}}}\n',
    });
  });
});

test("returns repository validation for invalid artifact sha after opening the database", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "artifacts",
          "create",
          "--id",
          "artifact_cli_invalid_sha",
          "--target-kind",
          "task",
          "--target-id",
          "task_cli_1",
          "--title",
          "Invalid SHA",
          "--summary",
          "Invalid SHA should be repository validation.",
          "--uri",
          "file:///tmp/invalid-sha.txt",
          "--sha256",
          "not-a-valid-sha",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"validation","message":"Expected a lowercase SHA-256 hex digest.","details":{"field":"sha256"}}}\n',
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "artifacts", "recent"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
  });
});

test("validates artifact syntax before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-"));
  const databasePath = join(directory, "nested", "situ.db");

  try {
    await forEachSequentially(
      [
        [
          ["--db", databasePath, "artifacts"],
          "Error [validation]: Command artifacts requires a subcommand.\n",
        ],
        [
          ["--db", databasePath, "artifacts", "wat"],
          "Error [validation]: Unknown artifacts subcommand: wat.\n",
        ],
        [
          ["--db", databasePath, "artifacts", "get"],
          "Error [validation]: Command artifacts get requires <artifact-id>.\n",
        ],
        [
          ["--db", databasePath, "artifacts", "create"],
          "Error [validation]: Missing required flag --target-kind.\n",
        ],
        [
          ["--db", databasePath, "artifacts", "create", "--summary", "--bogus"],
          "Error [validation]: Missing value for --summary.\n",
        ],
        [
          ["--db", databasePath, "artifacts", "create", "--title", "--foo"],
          "Error [validation]: Missing value for --title.\n",
        ],
        [
          ["--db", databasePath, "artifacts", "create", "--uri", "--"],
          "Error [validation]: Missing value for --uri.\n",
        ],
        [
          ["--db", databasePath, "artifacts", "get", "--unused", "artifact_cli_1"],
          "Error [validation]: Unknown flag for artifacts get: --unused.\n",
        ],
        [
          ["--db", databasePath, "artifacts", "get", "artifact_cli_1", "extra"],
          "Error [validation]: Command artifacts get received extra positional arguments: extra\n",
        ],
        [
          ["--db", databasePath, "artifacts", "recent", "--unknown=1"],
          "Error [validation]: Unknown flag for artifacts recent: --unknown=1.\n",
        ],
        [
          ["--db", databasePath, "artifacts", "recent", "-x"],
          "Error [validation]: Unknown flag for artifacts recent: -x.\n",
        ],
        [
          ["--db", databasePath, "artifacts", "recent", "--"],
          "Error [validation]: Unknown flag for artifacts recent: --.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "artifacts",
            "create",
            "--target-kind",
            "bogus",
            "--target-id",
            "task_cli_1",
            "--title",
            "Artifact",
            "--summary",
            "Summary",
            "--uri",
            "file:///tmp/artifact.txt",
            "--actor-kind",
            "human",
          ],
          "Error [validation]: Missing required flag --actor-id.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "artifacts",
            "create",
            "--target-kind",
            "task",
            "--target-id",
            "task_cli_1",
            "--title",
            "Artifact",
            "--summary",
            "Summary",
            "--uri",
            "file:///tmp/artifact.txt",
            "--actor-kind",
            "robot",
            "--actor-id",
            "r2",
          ],
          "Error [validation]: Invalid actor kind for --actor-kind: robot.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "artifacts",
            "list",
            "--target-kind",
            "bogus",
            "--target-id",
            "task_cli_1",
          ],
          "Error [validation]: Invalid target kind: bogus.\n",
        ],
        [
          ["--db", databasePath, "artifacts", "recent", "--limit", "0"],
          "Error [validation]: Expected a positive integer limit.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "artifacts",
            "create",
            "--target-kind",
            "task",
            "--target-id",
            "task_cli_1",
            "--title",
            "Artifact",
            "--summary",
            "Summary",
            "--uri",
            "file:///tmp/artifact.txt",
            "--byte-size",
            "1.5",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          "Error [validation]: Expected a non-negative safe integer byte size.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "artifacts",
            "create",
            "--target-kind",
            "task",
            "--target-id",
            "task_cli_1",
            "--title",
            "Artifact",
            "--summary",
            "Summary",
            "--uri",
            "file:///tmp/artifact.txt",
            "--byte-size",
            "9007199254740992",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          "Error [validation]: Expected a non-negative safe integer byte size.\n",
        ],
      ] as const,
      async ([args, stderr]) => {
        expect(await runSituCli({ args, environment })).toEqual({
          exitCode: 1,
          stdout: "",
          stderr,
        });
        expect(existsSync(dirname(databasePath))).toBe(false);
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("lists, gets, reads, and dismisses notifications", async () => {
  await withTempDatabasePath(async (databasePath) => {
    createCliNotificationFixture({
      databasePath,
      id: "notification_cli_1",
      recipientId: "verifier-1",
      recipientDisplayName: "Verifier 1",
      targetId: "task_cli_1",
      summary: "Review task",
      body: "Please inspect the task.",
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(
      await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "notifications",
          "list",
          "--recipient-id",
          "verifier-1",
        ],
        environment,
      }),
    ).toMatchObject({
      exitCode: 0,
      stderr: "",
      stdout: expect.stringContaining('"notifications"'),
    });
    expect(
      JSON.parse(
        (
          await runSituCli({
            args: [
              "--json",
              "--db",
              databasePath,
              "notifications",
              "list",
              "--recipient-id",
              "verifier-1",
            ],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      notifications: [
        {
          id: "notification_cli_1",
        },
      ],
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "notifications", "get", "notification_cli_1"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "notification_cli_1\tverifier-1\ttask/task_cli_1\tunread\tReview task\n",
    });

    const read = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "notifications",
        "read",
        "--now",
        "2026-05-13T12:01:00.000Z",
        "notification_cli_1",
      ],
      environment,
    });

    expect(read.exitCode).toBe(0);
    expect(read.stderr).toBe("");
    expect(JSON.parse(read.stdout)).toMatchObject({
      notification: {
        id: "notification_cli_1",
        readAt: "2026-05-13T12:01:00.000Z",
      },
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "notifications",
          "dismiss",
          "notification_cli_1",
          "--now",
          "2026-05-13T12:02:00.000Z",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Dismissed notification notification_cli_1\n",
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "notifications", "list", "--recipient-id", "verifier-1"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
  });
});

test("creates, lists, and gets comments", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const create = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "comments",
        "create",
        "--id",
        "comment_cli_1",
        "--target-kind",
        "task",
        "--target-id",
        "task_cli_1",
        "--actor-kind",
        "human",
        "--actor-id",
        "scott",
        "--actor-display-name",
        "Scott",
        "--body",
        "Ignore this body.",
        "--body",
        "Please inspect the task.",
        "--now",
        "2026-05-13T12:00:00.000Z",
      ],
      environment,
    });

    expect(create.exitCode).toBe(0);
    expect(create.stderr).toBe("");
    expect(JSON.parse(create.stdout)).toMatchObject({
      comment: {
        id: "comment_cli_1",
        target: {
          targetKind: "task",
          targetId: "task_cli_1",
        },
        author: {
          actorKind: "human",
          actorId: "scott",
          displayName: "Scott",
        },
        bodyMarkdown: "Please inspect the task.",
        metadata: {
          createdAt: "2026-05-13T12:00:00.000Z",
          updatedAt: "2026-05-13T12:00:00.000Z",
        },
      },
    });

    expect(
      await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "comments",
          "list",
          "--target-kind",
          "task",
          "--target-id",
          "task_cli_1",
        ],
        environment,
      }),
    ).toMatchObject({
      exitCode: 0,
      stderr: "",
      stdout: expect.stringContaining('"comments"'),
    });
    expect(
      JSON.parse(
        (
          await runSituCli({
            args: [
              "--json",
              "--db",
              databasePath,
              "comments",
              "list",
              "--target-kind",
              "task",
              "--target-id",
              "task_cli_1",
            ],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      comments: [
        {
          id: "comment_cli_1",
        },
      ],
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "comments", "get", "comment_cli_1"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "comment_cli_1\ttask/task_cli_1\thuman/scott\tPlease inspect the task.\n",
    });
  });
});

test("returns not found for missing comment get", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      await runSituCli({
        args: ["--json", "--db", databasePath, "comments", "get", "comment_missing"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"not_found","message":"Comment was not found.","details":{"id":"comment_missing"}}}\n',
    });
  });
});

test("creates, lists, gets, and lists recent events", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const create = await runSituCli({
      args: [
        "--json",
        "--db",
        databasePath,
        "events",
        "create",
        "--id",
        "event_cli_1",
        "--target-kind",
        "task",
        "--target-id",
        "task_cli_1",
        "--actor-kind",
        "human",
        "--actor-id",
        "scott",
        "--actor-display-name",
        "Scott",
        "--summary",
        "Ignore this summary.",
        "--summary",
        "Corrected task timeline.",
        "--body",
        "The task was already started.",
        "--now",
        "2026-05-13T12:00:00.000Z",
      ],
      environment,
    });

    expect(create.exitCode).toBe(0);
    expect(create.stderr).toBe("");
    expect(JSON.parse(create.stdout)).toMatchObject({
      event: {
        id: "event_cli_1",
        target: {
          targetKind: "task",
          targetId: "task_cli_1",
        },
        actor: {
          actorKind: "human",
          actorId: "scott",
          displayName: "Scott",
        },
        summaryMarkdown: "Corrected task timeline.",
        bodyMarkdown: "The task was already started.",
        metadata: {
          createdAt: "2026-05-13T12:00:00.000Z",
          updatedAt: "2026-05-13T12:00:00.000Z",
        },
      },
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "events",
          "create",
          "--id",
          "event_cli_2",
          "--target-kind",
          "project",
          "--target-id",
          "project_cli_1",
          "--actor-kind",
          "local_agent",
          "--actor-id",
          "agent-1",
          "--summary",
          "Inspected project.",
          "--now",
          "2026-05-13T12:01:00.000Z",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Created event event_cli_2\n",
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: [
              "--json",
              "--db",
              databasePath,
              "events",
              "list",
              "--target-kind",
              "task",
              "--target-id",
              "task_cli_1",
            ],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      events: [
        {
          id: "event_cli_1",
        },
      ],
    });

    expect(
      JSON.parse(
        (
          await runSituCli({
            args: ["--json", "--db", databasePath, "events", "recent", "--limit", "01"],
            environment,
          })
        ).stdout,
      ),
    ).toMatchObject({
      events: [
        {
          id: "event_cli_2",
        },
      ],
    });

    expect(
      await runSituCli({
        args: ["--db", databasePath, "events", "get", "event_cli_1"],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "event_cli_1\ttask/task_cli_1\thuman/scott\tCorrected task timeline.\n",
    });

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "events",
          "list",
          "--target-kind",
          "notification",
          "--target-id",
          "notification_missing",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
  });
});

test("returns not found for missing event get", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      await runSituCli({
        args: ["--json", "--db", databasePath, "events", "get", "event_missing"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"not_found","message":"Event was not found.","details":{"id":"event_missing"}}}\n',
    });
  });
});

test("validates event syntax before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-"));
  const databasePath = join(directory, "nested", "situ.db");

  try {
    await forEachSequentially(
      [
        [
          ["--db", databasePath, "events"],
          "Error [validation]: Command events requires a subcommand.\n",
        ],
        [
          ["--db", databasePath, "events", "wat"],
          "Error [validation]: Unknown events subcommand: wat.\n",
        ],
        [
          ["--db", databasePath, "events", "get"],
          "Error [validation]: Command events get requires <event-id>.\n",
        ],
        [
          ["--db", databasePath, "events", "create"],
          "Error [validation]: Missing required flag --target-kind.\n",
        ],
        [
          ["--db", databasePath, "events", "create", "--summary", "--bogus"],
          "Error [validation]: Missing value for --summary.\n",
        ],
        [
          ["--db", databasePath, "events", "get", "event_cli_1", "--unused"],
          "Error [validation]: Unknown flag for events get: --unused.\n",
        ],
        [
          ["--db", databasePath, "events", "get", "event_cli_1", "extra"],
          "Error [validation]: Command events get received extra positional arguments: extra\n",
        ],
        [
          [
            "--db",
            databasePath,
            "events",
            "list",
            "--target-kind",
            "bogus",
            "--target-id",
            "task_cli_1",
          ],
          "Error [validation]: Invalid target kind: bogus.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "events",
            "create",
            "--target-kind",
            "task",
            "--target-id",
            "task_cli_1",
            "--actor-kind",
            "robot",
            "--actor-id",
            "r2",
            "--summary",
            "Body",
          ],
          "Error [validation]: Invalid actor kind for --actor-kind: robot.\n",
        ],
        [
          ["--db", databasePath, "events", "recent", "--limit", "1.5"],
          "Error [validation]: Expected a positive integer limit.\n",
        ],
        [
          ["--db", databasePath, "events", "recent", "--limit", "--bad"],
          "Error [validation]: Missing value for --limit.\n",
        ],
      ] as const,
      async ([args, stderr]) => {
        expect(await runSituCli({ args, environment })).toEqual({
          exitCode: 1,
          stdout: "",
          stderr,
        });
        expect(existsSync(dirname(databasePath))).toBe(false);
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("validates comment syntax before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-"));
  const databasePath = join(directory, "nested", "situ.db");

  try {
    expect(
      await runSituCli({
        args: ["--db", databasePath, "comments", "wat"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "Error [validation]: Unknown comments subcommand: wat.\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);

    expect(
      await runSituCli({
        args: ["--db", databasePath, "comments", "create"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "Error [validation]: Missing required flag --target-kind.\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);

    expect(
      await runSituCli({
        args: ["--db", databasePath, "comments", "create", "--target-kind"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "Error [validation]: Missing value for --target-kind.\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);

    expect(
      await runSituCli({
        args: ["--db", databasePath, "comments", "get", "comment_cli_1", "--unused"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "Error [validation]: Unknown flag for comments get: --unused.\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);

    expect(
      await runSituCli({
        args: ["--db", databasePath, "comments", "get", "comment_cli_1", "extra"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        "Error [validation]: Command comments get received extra positional arguments: extra\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "comments",
          "list",
          "--target-kind",
          "bogus",
          "--target-id",
          "task_cli_1",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "Error [validation]: Invalid target kind: bogus.\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "comments",
          "create",
          "--target-kind",
          "task",
          "--target-id",
          "task_cli_1",
          "--actor-kind",
          "robot",
          "--actor-id",
          "r2",
          "--body",
          "Body",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "Error [validation]: Invalid actor kind for --actor-kind: robot.\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("formats notification list text states", async () => {
  await withTempDatabasePath(async (databasePath) => {
    for (const [id, summary] of [
      ["notification_cli_unread", "Unread"],
      ["notification_cli_read", "Read"],
      ["notification_cli_dismissed", "Dismissed"],
    ] as const) {
      createCliNotificationFixture({
        databasePath,
        id,
        recipientId: "verifier-1",
        targetId: "task_cli_state",
        summary,
        now: "2026-05-13T12:00:00.000Z",
      });
    }

    expect(
      (
        await runSituCli({
          args: [
            "--db",
            databasePath,
            "notifications",
            "read",
            "notification_cli_read",
            "--now",
            "2026-05-13T12:01:00.000Z",
          ],
          environment,
        })
      ).exitCode,
    ).toBe(0);
    expect(
      (
        await runSituCli({
          args: [
            "--db",
            databasePath,
            "notifications",
            "dismiss",
            "notification_cli_dismissed",
            "--now",
            "2026-05-13T12:02:00.000Z",
          ],
          environment,
        })
      ).exitCode,
    ).toBe(0);

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "notifications",
          "list",
          "--recipient-id",
          "verifier-1",
          "--include-dismissed",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 0,
      stderr: "",
      stdout:
        "notification_cli_unread\tverifier-1\ttask/task_cli_state\tunread\tUnread\nnotification_cli_read\tverifier-1\ttask/task_cli_state\tread\tRead\nnotification_cli_dismissed\tverifier-1\ttask/task_cli_state\tdismissed\tDismissed\n",
    });
  });
});

test("returns not found for missing notification commands", async () => {
  await withTempDatabasePath(async (databasePath) => {
    await forEachSequentially(
      [
        ["--json", "--db", databasePath, "notifications", "get", "notification_missing"],
        ["--json", "--db", databasePath, "notifications", "read", "notification_missing"],
        ["--json", "--db", databasePath, "notifications", "dismiss", "notification_missing"],
      ],
      async (args) => {
        expect(await runSituCli({ args, environment })).toEqual({
          exitCode: 1,
          stdout: "",
          stderr:
            '{"error":{"kind":"not_found","message":"Notification was not found.","details":{"id":"notification_missing"}}}\n',
        });
      },
    );
  });
});

test("validates notification syntax before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-"));
  const databasePath = join(directory, "nested", "situ.db");

  try {
    expect(
      await runSituCli({
        args: ["--db", databasePath, "notifications", "wat"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "Error [validation]: Unknown notifications subcommand: wat.\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);

    expect(
      await runSituCli({
        args: ["--db", databasePath, "notifications", "create"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "Error [validation]: Unknown notifications subcommand: create.\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);

    expect(
      await runSituCli({
        args: ["--db", databasePath, "notifications", "list"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "Error [validation]: Missing required flag --recipient-id.\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "notifications",
          "list",
          "--recipient-id",
          "verifier-1",
          "--limit",
          "not-a-limit",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "Error [validation]: Expected a positive integer limit.\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("returns not found for missing get commands", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      await runSituCli({
        args: ["--json", "--db", databasePath, "tasks", "get", "task_missing"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        '{"error":{"kind":"not_found","message":"Task was not found.","details":{"id":"task_missing"}}}\n',
    });
  });
});

test("validates project and task syntax before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-"));
  const databasePath = join(directory, "nested", "situ.db");

  try {
    expect(
      await runSituCli({
        args: ["--db", databasePath, "tasks", "list", "--status", "blocked"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "Error [validation]: Invalid task status: blocked.\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects invalid assignment flag combinations", async () => {
  await withTempDatabasePath(async (databasePath) => {
    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "tasks",
          "assign",
          "task_cli_1",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
          "--clear",
          "--assigned-to-kind",
          "local_agent",
          "--assigned-to-id",
          "worker-1",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "Error [validation]: --clear cannot be combined with assignee flags.\n",
    });
  });
});

test("rejects non-simple command-local help forms before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-"));
  const databasePath = join(directory, "nested", "situ.db");

  try {
    expect(
      await runSituCli({
        args: ["--db", databasePath, "projects", "create", "--help", "extra"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "Error [validation]: Unknown flag for projects create: --help.\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects extra positionals and incomplete assignee flags before opening the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-"));
  const databasePath = join(directory, "nested", "situ.db");

  try {
    expect(
      await runSituCli({
        args: ["--db", databasePath, "projects", "get", "project_1", "extra"],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        "Error [validation]: Command projects get received extra positional arguments: extra\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);

    expect(
      await runSituCli({
        args: [
          "--db",
          databasePath,
          "tasks",
          "create",
          "--project-id",
          "project_1",
          "--title",
          "Task",
          "--body",
          "Body",
          "--actor-kind",
          "human",
          "--actor-id",
          "scott",
          "--assigned-to-display-name",
          "Worker",
        ],
        environment,
      }),
    ).toEqual({
      exitCode: 1,
      stdout: "",
      stderr:
        "Error [validation]: Assignee flags require both --assigned-to-kind and --assigned-to-id.\n",
    });
    expect(existsSync(dirname(databasePath))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("validates command-local syntax phases before scalar values", async () => {
  const directory = mkdtempSync(join(tmpdir(), "situ-cli-"));
  const databasePath = join(directory, "nested", "situ.db");

  try {
    await forEachSequentially(
      [
        [
          [
            "--db",
            databasePath,
            "projects",
            "create",
            "--name",
            "Phased Project",
            "--repository-path",
            "/tmp/phased-project",
            "--goal",
            "Exercise validation phases",
            "--actor-kind",
            "robot",
          ],
          "Error [validation]: Missing required flag --actor-id.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "tasks",
            "create",
            "--project-id",
            "project_1",
            "--title",
            "Task",
            "--body",
            "Body",
            "--status",
            "blocked",
            "--actor-kind",
            "robot",
          ],
          "Error [validation]: Missing required flag --actor-id.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "tasks",
            "assign",
            "task_1",
            "--actor-kind",
            "robot",
            "--actor-id",
            "scott",
            "--clear",
            "--assigned-to-kind",
            "local_agent",
            "--assigned-to-id",
            "worker-1",
          ],
          "Error [validation]: --clear cannot be combined with assignee flags.\n",
        ],
        [
          [
            "--db",
            databasePath,
            "events",
            "create",
            "--target-kind",
            "nope",
            "--target-id",
            "task_1",
            "--actor-kind",
            "human",
            "--actor-id",
            "scott",
          ],
          "Error [validation]: Missing required flag --summary.\n",
        ],
      ] as const,
      async ([args, stderr]) => {
        expect(await runSituCli({ args, environment })).toEqual({
          exitCode: 1,
          stdout: "",
          stderr,
        });
        expect(existsSync(dirname(databasePath))).toBe(false);
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function createCliAuthoringFixture(input: {
  readonly databasePath: string;
  readonly prefix: string;
}): Promise<{
  readonly projectId: string;
  readonly baselineId: string;
  readonly experimentId: string;
  readonly bestValue: number;
}> {
  const projectId = `project_${input.prefix}`;
  const baselineId = `baseline_${input.prefix}`;
  const taskId = `task_${input.prefix}`;
  const experimentId = `experiment_${input.prefix}`;
  const bestValue = 0.6814;

  expect(
    (
      await runSituCli({
        args: [
          "--db",
          input.databasePath,
          "projects",
          "create",
          "--id",
          projectId,
          "--name",
          "Authoring Test Project",
          "--repository-path",
          `/tmp/${input.prefix}-project`,
          "--goal",
          "Exercise the authoring loop.",
          "--actor-kind",
          "local_agent",
          "--actor-id",
          "manager",
        ],
        environment,
      })
    ).exitCode,
  ).toBe(0);

  expect(
    (
      await runSituCli({
        args: [
          "--db",
          input.databasePath,
          "baselines",
          "create",
          "--id",
          baselineId,
          "--project-id",
          projectId,
          "--title",
          "Native baseline",
          "--summary",
          "Unmodified harness run.",
          "--actor-kind",
          "local_agent",
          "--actor-id",
          "manager",
        ],
        environment,
      })
    ).exitCode,
  ).toBe(0);

  expect(
    (
      await runSituCli({
        args: [
          "--db",
          input.databasePath,
          "measurements",
          "create",
          "--id",
          `measurement_${input.prefix}_baseline`,
          "--baseline-id",
          baselineId,
          "--metric-name",
          "dev_accuracy",
          "--value",
          "0.6314",
          "--summary",
          "Baseline dev_accuracy.",
          "--actor-kind",
          "local_agent",
          "--actor-id",
          "manager",
        ],
        environment,
      })
    ).exitCode,
  ).toBe(0);

  expect(
    (
      await runSituCli({
        args: [
          "--db",
          input.databasePath,
          "tasks",
          "create",
          "--id",
          taskId,
          "--project-id",
          projectId,
          "--title",
          "Authoring Task",
          "--body",
          "Exercise authoring.",
          "--actor-kind",
          "local_agent",
          "--actor-id",
          "manager",
        ],
        environment,
      })
    ).exitCode,
  ).toBe(0);

  expect(
    (
      await runSituCli({
        args: [
          "--db",
          input.databasePath,
          "experiments",
          "create",
          "--id",
          experimentId,
          "--project-id",
          projectId,
          "--task-id",
          taskId,
          "--title",
          "Authoring Experiment",
          "--summary",
          "Worked.",
          "--status",
          "accepted",
          "--actor-kind",
          "local_agent",
          "--actor-id",
          "scientist-1",
        ],
        environment,
      })
    ).exitCode,
  ).toBe(0);

  expect(
    (
      await runSituCli({
        args: [
          "--db",
          input.databasePath,
          "measurements",
          "create",
          "--id",
          `measurement_${input.prefix}_experiment`,
          "--experiment-id",
          experimentId,
          "--revision-number",
          "1",
          "--metric-name",
          "dev_accuracy",
          "--value",
          String(bestValue),
          "--summary",
          "Improved dev_accuracy.",
          "--actor-kind",
          "local_agent",
          "--actor-id",
          "verifier-1",
        ],
        environment,
      })
    ).exitCode,
  ).toBe(0);

  return { projectId, baselineId, experimentId, bestValue };
}

test("reports instructions writes a brief and a draft scaffold", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const { projectId } = await createCliAuthoringFixture({
      databasePath,
      prefix: "cli_instructions",
    });
    const outDirectory = mkdtempSync(join(tmpdir(), "situ-cli-drafts-"));

    try {
      const result = await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "reports",
          "instructions",
          "--project-id",
          projectId,
          "--out",
          outDirectory,
        ],
        environment,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      const body = JSON.parse(result.stdout);
      expect(body.projectId).toBe(projectId);
      expect(body.instructionsPath).toBe(join(outDirectory, "instructions.md"));
      expect(body.draftPath).toBe(join(outDirectory, "draft.mdx"));

      const instructions = readFileSync(body.instructionsPath, "utf8");
      expect(instructions).toContain("Research report brief");
      expect(instructions).toContain(projectId);

      const draft = readFileSync(body.draftPath, "utf8");
      expect(draft).toContain("<ResearchReport");
      expect(draft).toContain("<Hero");
    } finally {
      rmSync(outDirectory, { recursive: true, force: true });
    }
  });
});

test("reports preview compiles MDX against the snapshot", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const { projectId } = await createCliAuthoringFixture({
      databasePath,
      prefix: "cli_preview",
    });
    const outDirectory = mkdtempSync(join(tmpdir(), "situ-cli-drafts-"));

    try {
      const instructionsResult = await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "reports",
          "instructions",
          "--project-id",
          projectId,
          "--out",
          outDirectory,
        ],
        environment,
      });
      expect(instructionsResult.exitCode).toBe(0);
      const draftPath = JSON.parse(instructionsResult.stdout).draftPath;

      const previewResult = await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "reports",
          "preview",
          "--project-id",
          projectId,
          "--draft",
          draftPath,
          "--no-embed-fonts",
        ],
        environment,
      });
      expect(previewResult.exitCode).toBe(0);
      expect(previewResult.stderr).toBe("");
      const previewBody = JSON.parse(previewResult.stdout);
      expect(previewBody.projectId).toBe(projectId);
      expect(previewBody.errors).toEqual([]);
      expect(existsSync(previewBody.htmlPath)).toBe(true);
      const html = readFileSync(previewBody.htmlPath, "utf8");
      expect(html).toContain("<!doctype html>");
      expect(html).not.toContain("<script");
    } finally {
      rmSync(outDirectory, { recursive: true, force: true });
    }
  });
});

test("reports submit creates a report and an artifact, generate then prefers authored", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const { projectId } = await createCliAuthoringFixture({
      databasePath,
      prefix: "cli_submit",
    });
    const outDirectory = mkdtempSync(join(tmpdir(), "situ-cli-drafts-"));

    try {
      const instructionsResult = await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "reports",
          "instructions",
          "--project-id",
          projectId,
          "--out",
          outDirectory,
        ],
        environment,
      });
      const draftPath = JSON.parse(instructionsResult.stdout).draftPath;

      const submitResult = await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "reports",
          "submit",
          "--project-id",
          projectId,
          "--draft",
          draftPath,
          "--title",
          "Authored test report",
          "--generated-by-kind",
          "local_agent",
          "--generated-by-id",
          "manager",
          "--generated-by-display-name",
          "Root manager",
        ],
        environment,
      });
      expect(submitResult.exitCode).toBe(0);
      expect(submitResult.stderr).toBe("");
      const submitBody = JSON.parse(submitResult.stdout);
      expect(submitBody.reportId).toContain("report_");
      expect(submitBody.artifactId).toContain("artifact_");
      expect(existsSync(submitBody.htmlPath)).toBe(true);

      const listResult = await runSituCli({
        args: ["--json", "--db", databasePath, "reports", "list", "--project-id", projectId],
        environment,
      });
      expect(listResult.exitCode).toBe(0);
      const reports = JSON.parse(listResult.stdout).reports;
      expect(reports.length).toBe(1);
      expect(reports[0].title).toBe("Authored test report");
      expect(reports[0].bodyMarkdown).toContain("<ResearchReport");

      const generateResult = await runSituCli({
        args: [
          "--db",
          databasePath,
          "reports",
          "generate",
          "--project-id",
          projectId,
          "--format",
          "html",
        ],
        environment,
      });
      expect(generateResult.exitCode).toBe(0);
      // Authored-preferred signal: the MDX compile pipeline base64-embeds the
      // OFL fonts; the standard tree path does not. The scaffold's placeholder
      // abstract text is also present, since the standard tree composes its
      // own abstract paragraphs.
      expect(generateResult.stdout).toContain("data:font/woff2;base64,");
      expect(generateResult.stdout).toContain("Write a 3");
    } finally {
      rmSync(outDirectory, { recursive: true, force: true });
    }
  });
});

test("reports submit refuses an MDX draft that fails validation", async () => {
  await withTempDatabasePath(async (databasePath) => {
    const { projectId } = await createCliAuthoringFixture({
      databasePath,
      prefix: "cli_submit_invalid",
    });
    const outDirectory = mkdtempSync(join(tmpdir(), "situ-cli-drafts-"));

    try {
      const draftPath = join(outDirectory, "bad.mdx");
      // Missing <BaselineCard> and <EvidenceBlock> for the accepted experiment;
      // both are required by the validator.
      writeFileSync(
        draftPath,
        `<ResearchReport title="Bad">\n  <Hero title="Bad" />\n</ResearchReport>\n`,
        "utf8",
      );

      const submitResult = await runSituCli({
        args: [
          "--json",
          "--db",
          databasePath,
          "reports",
          "submit",
          "--project-id",
          projectId,
          "--draft",
          draftPath,
          "--title",
          "Should not be saved",
          "--generated-by-kind",
          "local_agent",
          "--generated-by-id",
          "manager",
        ],
        environment,
      });
      expect(submitResult.exitCode).toBe(1);
      expect(submitResult.stderr).toContain("validation");

      const listResult = await runSituCli({
        args: ["--json", "--db", databasePath, "reports", "list", "--project-id", projectId],
        environment,
      });
      const reports = JSON.parse(listResult.stdout).reports;
      expect(reports.length).toBe(0);
    } finally {
      rmSync(outDirectory, { recursive: true, force: true });
    }
  });
});
