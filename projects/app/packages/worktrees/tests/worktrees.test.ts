import { expect, test } from "bun:test";

import { ErrorKind, isBaseError } from "@situ/errors";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  filterCommandEnvironment,
  gitWorktreeCommand,
  resolveInsideRoot,
  worktreesPackageName,
} from "../src/index.js";

test("exports the package marker", () => {
  const expectedPackageName: "worktrees" = worktreesPackageName;
  expect(expectedPackageName).toBe("worktrees");
});

test("creates git worktree commands", () => {
  expect(
    gitWorktreeCommand({
      args: ["add", "../situ-exp-1", "main"],
      cwd: "/repo",
    }),
  ).toEqual({
    command: "git",
    args: ["worktree", "add", "../situ-exp-1", "main"],
    cwd: "/repo",
  });
});

test("preserves omitted git worktree command cwd as undefined", () => {
  expect(gitWorktreeCommand({ args: ["list"] })).toEqual({
    command: "git",
    args: ["worktree", "list"],
    cwd: undefined,
  });
});

test("resolves paths inside an allowed root", () => {
  expect(
    resolveInsideRoot({
      rootPath: "/tmp/situ",
      relativePath: "artifacts/report.md",
    }),
  ).toBe("/tmp/situ/artifacts/report.md");
});

test("keeps root-relative dot paths inside the allowed root", () => {
  expect(
    resolveInsideRoot({
      rootPath: "/tmp/situ",
      relativePath: ".",
    }),
  ).toBe("/tmp/situ");
});

test("keeps root-relative empty paths inside the allowed root", () => {
  expect(
    resolveInsideRoot({
      rootPath: "/tmp/situ",
      relativePath: "",
    }),
  ).toBe("/tmp/situ");
});

test("allows inside-root paths that begin with similar dot prefixes", () => {
  expect(
    resolveInsideRoot({
      rootPath: "/tmp/situ",
      relativePath: "..foo/file.txt",
    }),
  ).toBe("/tmp/situ/..foo/file.txt");
});

test("normalizes inside-root paths before containment checks", () => {
  expect(
    resolveInsideRoot({
      rootPath: "/tmp/situ",
      relativePath: "subdir/../file.txt",
    }),
  ).toBe("/tmp/situ/file.txt");
});

test("resolves nonexistent paths without requiring filesystem entries", () => {
  expect(
    resolveInsideRoot({
      rootPath: "/tmp/situ-missing-root",
      relativePath: "missing-directory/report.md",
    }),
  ).toBe("/tmp/situ-missing-root/missing-directory/report.md");
});

test("does not physically resolve symlinks when checking containment", () => {
  const rootPath = mkdtempSync(join(tmpdir(), "situ-worktrees-root-"));
  const outsidePath = mkdtempSync(join(tmpdir(), "situ-worktrees-outside-"));

  try {
    symlinkSync(outsidePath, join(rootPath, "link"));

    expect(
      resolveInsideRoot({
        rootPath,
        relativePath: "link/report.md",
      }),
    ).toBe(join(rootPath, "link", "report.md"));
  } finally {
    rmSync(rootPath, { recursive: true, force: true });
    rmSync(outsidePath, { recursive: true, force: true });
  }
});

test("rejects absolute relative paths", () => {
  expectValidationError(
    () =>
      resolveInsideRoot({
        rootPath: "/tmp/situ",
        relativePath: "/tmp/situ/report.md",
      }),
    "Path must be relative to the allowed root.",
  );
});

test("rejects paths outside an allowed root", () => {
  expectValidationError(
    () =>
      resolveInsideRoot({
        rootPath: "/tmp/situ",
        relativePath: "../secrets.txt",
      }),
    "Path escapes the allowed root.",
  );
});

test("drops undefined environment values", () => {
  expect(
    filterCommandEnvironment({
      environment: {
        HOME: "/tmp/home",
        EMPTY: undefined,
      },
    }),
  ).toEqual({
    HOME: "/tmp/home",
  });
});

test("drops likely secret environment names", () => {
  expect(
    filterCommandEnvironment({
      environment: {
        API_KEY: "secret",
        HOME: "/tmp/home",
        PASSWORD: "secret",
        PATH: "/bin",
        SITU_TOKEN: "secret",
      },
    }),
  ).toEqual({
    HOME: "/tmp/home",
    PATH: "/bin",
  });
});

test("drops lowercase likely secret environment names", () => {
  expect(
    filterCommandEnvironment({
      environment: {
        database_secret: "secret",
        home: "/tmp/home",
      },
    }),
  ).toEqual({
    home: "/tmp/home",
  });
});

test("preserves exact allowed secret environment names", () => {
  expect(
    filterCommandEnvironment({
      environment: {
        API_KEY: "secret",
        DATABASE_SECRET: "secret",
        PATH: "/bin",
      },
      allowedSecretNames: ["API_KEY"],
    }),
  ).toEqual({
    API_KEY: "secret",
    PATH: "/bin",
  });
});

test("matches allowed secret names case-sensitively", () => {
  expect(
    filterCommandEnvironment({
      environment: {
        API_KEY: "secret",
        api_key: "secret",
      },
      allowedSecretNames: ["API_KEY"],
    }),
  ).toEqual({
    API_KEY: "secret",
  });
});

test("preserves non-secret names with similar suffixes", () => {
  expect(
    filterCommandEnvironment({
      environment: {
        MONKEY: "value",
        TURKEY: "value",
      },
    }),
  ).toEqual({
    MONKEY: "value",
    TURKEY: "value",
  });
});

function expectValidationError(run: () => void, message: string): void {
  expect(run).toThrow(message);

  try {
    run();
  } catch (error) {
    expect(isBaseError(error)).toBe(true);

    if (isBaseError(error)) {
      expect(error.kind).toBe(ErrorKind.Validation);
    }

    return;
  }

  throw new Error("Expected validation error.");
}
