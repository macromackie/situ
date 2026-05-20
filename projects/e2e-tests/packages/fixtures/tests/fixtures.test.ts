import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ConflictError, ValidationError } from "@situ/errors";

import {
  fixturesPackageName,
  materializeFixtureRepository,
  tinyAutoresearchFixture,
  type TestFixture,
} from "../src/index.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const rootPath of tempRoots.splice(0)) {
    rmSync(rootPath, { recursive: true, force: true });
  }
});

test("exports the fixture package marker", () => {
  const expectedPackageName: "fixtures" = fixturesPackageName;
  expect(expectedPackageName).toBe("fixtures");
});

test("defines a tiny autoresearch fixture", () => {
  expect(tinyAutoresearchFixture.name).toBe("tiny-autoresearch");
  expect(tinyAutoresearchFixture.goal).not.toContain("placeholder");
  expect(tinyAutoresearchFixture.repositoryFiles).toHaveLength(1);
  expect(tinyAutoresearchFixture.actors.map((actor) => actor.actorId)).toContain("local-agent");
  expect(tinyAutoresearchFixture.expectedAssertions).toEqual(
    expect.arrayContaining([
      "situ --version returns the requested build version",
      "situ doctor returns a successful health message",
      "situ projects init creates a project for the materialized repository",
      "situ projects current recovers the active project from the current repository",
      "situ tasks current lists tasks for active projects in the current repository",
      "assigned tasks create unread notifications for the assigned actor",
    ]),
  );
});

test("materializes the tiny autoresearch fixture", () => {
  const rootPath = createTempRoot();

  const result = materializeFixtureRepository({
    fixture: tinyAutoresearchFixture,
    rootPath,
  });

  expect(result.fixtureName).toBe("tiny-autoresearch");
  expect(result.repositoryPath).toBe(join(rootPath, "tiny-autoresearch", "repository"));
  expect(result.files).toEqual([
    {
      relativePath: "README.md",
      path: join(result.repositoryPath, "README.md"),
    },
  ]);
  expect(readFileSync(join(result.repositoryPath, "README.md"), "utf8")).toBe(
    "# Tiny Autoresearch Fixture\n",
  );
});

test("creates a minimal .git directory marker", () => {
  const rootPath = createTempRoot();

  const result = materializeFixtureRepository({
    fixture: tinyAutoresearchFixture,
    rootPath,
  });

  expect(statSync(join(result.repositoryPath, ".git")).isDirectory()).toBe(true);
});

test("writes fixture files with nested parent directories", () => {
  const rootPath = createTempRoot();
  const fixture = createFixture({
    repositoryFiles: [
      { path: "README.md", content: "root\n" },
      { path: "docs/notes/index.md", content: "nested\n" },
    ],
  });

  const result = materializeFixtureRepository({ fixture, rootPath });

  expect(result.files.map((file) => file.relativePath)).toEqual([
    "README.md",
    "docs/notes/index.md",
  ]);
  expect(readFileSync(join(result.repositoryPath, "docs", "notes", "index.md"), "utf8")).toBe(
    "nested\n",
  );
});

test("returns materialized file paths in fixture order", () => {
  const rootPath = createTempRoot();
  const fixture = createFixture({
    repositoryFiles: [
      { path: "docs/guide.md", content: "guide\n" },
      { path: "README.md", content: "readme\n" },
    ],
  });

  const result = materializeFixtureRepository({ fixture, rootPath });

  expect(result.files).toEqual([
    {
      relativePath: "docs/guide.md",
      path: join(result.repositoryPath, "docs", "guide.md"),
    },
    {
      relativePath: "README.md",
      path: join(result.repositoryPath, "README.md"),
    },
  ]);
});

test("rejects relative rootPath", () => {
  expect(() =>
    materializeFixtureRepository({
      fixture: tinyAutoresearchFixture,
      rootPath: "relative-root",
    }),
  ).toThrow(ValidationError);
});

test("rejects unsafe fixture names before creating filesystem entries", () => {
  const rootPath = createTempRoot();

  expect(() =>
    materializeFixtureRepository({
      fixture: createFixture({ name: "../unsafe" }),
      rootPath,
    }),
  ).toThrow(ValidationError);
  expect(existsSync(join(rootPath, "..", "unsafe"))).toBe(false);
});

test("rejects absolute file paths", () => {
  expectInvalidFilePath("/etc/passwd", "Fixture file path escapes the repository root.");
});

test("rejects traversal file paths", () => {
  expectInvalidFilePath("../outside.md", "Fixture file path escapes the repository root.");
  expectInvalidFilePath("docs/../../outside.md", "Fixture file path escapes the repository root.");
});

test("rejects backslash, Windows-drive, empty-segment, and dot-segment paths", () => {
  expectInvalidFilePath("docs\\index.md", "Fixture file path escapes the repository root.");
  expectInvalidFilePath("C:docs/index.md", "Fixture file path escapes the repository root.");
  expectInvalidFilePath("docs//index.md", "Fixture file path escapes the repository root.");
  expectInvalidFilePath("docs/./index.md", "Fixture file path escapes the repository root.");
});

test("rejects empty, dot, and directory-like file paths", () => {
  expectInvalidFilePath("", "Expected fixture file path to name a file.");
  expectInvalidFilePath(".", "Expected fixture file path to name a file.");
  expectInvalidFilePath("docs/", "Expected fixture file path to name a file.");
});

test("rejects duplicate normalized fixture file paths", () => {
  const rootPath = createTempRoot();

  expect(() =>
    materializeFixtureRepository({
      fixture: createFixture({
        repositoryFiles: [
          { path: "README.md", content: "one\n" },
          { path: "README.md", content: "two\n" },
        ],
      }),
      rootPath,
    }),
  ).toThrow(ValidationError);
  expect(existsSync(join(rootPath, "custom-fixture"))).toBe(false);
});

test("rejects file and directory path conflicts", () => {
  const rootPath = createTempRoot();

  expect(() =>
    materializeFixtureRepository({
      fixture: createFixture({
        repositoryFiles: [
          { path: "docs", content: "file\n" },
          { path: "docs/index.md", content: "nested\n" },
        ],
      }),
      rootPath,
    }),
  ).toThrow(ValidationError);
  expect(existsSync(join(rootPath, "custom-fixture"))).toBe(false);
});

test("rejects fixture files inside the generated git marker", () => {
  const rootPath = createTempRoot();

  expect(() =>
    materializeFixtureRepository({
      fixture: createFixture({
        repositoryFiles: [{ path: ".git/HEAD", content: "ref: refs/heads/main\n" }],
      }),
      rootPath,
    }),
  ).toThrow("Conflicting fixture file paths.");
  expect(existsSync(join(rootPath, "custom-fixture"))).toBe(false);
});

test("rejects an existing fixture repository path", () => {
  const rootPath = createTempRoot();
  materializeFixtureRepository({ fixture: tinyAutoresearchFixture, rootPath });

  expect(() =>
    materializeFixtureRepository({
      fixture: tinyAutoresearchFixture,
      rootPath,
    }),
  ).toThrow(ConflictError);
});

test("cleans up fixture storage when a later file write fails", () => {
  const rootPath = createTempRoot();
  const fixture = createFixture({
    repositoryFiles: [
      { path: "README.md", content: "created first\n" },
      { path: "invalid\u0000name.md", content: "cannot be written\n" },
    ],
  });

  expect(() => materializeFixtureRepository({ fixture, rootPath })).toThrow();
  expect(existsSync(join(rootPath, "custom-fixture"))).toBe(false);
});

function createTempRoot(): string {
  const rootPath = mkdtempSync(join(tmpdir(), "situ-fixtures-"));
  tempRoots.push(rootPath);

  return rootPath;
}

function createFixture(input: Partial<TestFixture> = {}): TestFixture {
  return {
    name: "custom-fixture",
    goal: "Test fixture materialization.",
    actors: [],
    repositoryFiles: [{ path: "README.md", content: "fixture\n" }],
    expectedAssertions: [],
    ...input,
  };
}

function expectInvalidFilePath(filePath: string, message: string): void {
  const rootPath = createTempRoot();

  expect(() =>
    materializeFixtureRepository({
      fixture: createFixture({
        repositoryFiles: [{ path: filePath, content: "fixture\n" }],
      }),
      rootPath,
    }),
  ).toThrow(message);
  expect(existsSync(join(rootPath, "custom-fixture"))).toBe(false);
}
