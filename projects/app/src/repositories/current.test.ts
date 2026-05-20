import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { ValidationError } from "@situ/errors";

import { findCurrentRepositoryRoot } from "./current.js";

function withTempDirectory(run: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "situ-current-repository-"));

  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("detects a repository root with a .git directory", () => {
  withTempDirectory((directory) => {
    mkdirSync(join(directory, ".git"));

    expect(findCurrentRepositoryRoot({ cwd: directory })).toBe(directory);
  });
});

test("detects a repository root from a nested child directory", () => {
  withTempDirectory((directory) => {
    const child = join(directory, "packages", "app");
    mkdirSync(join(directory, ".git"));
    mkdirSync(child, { recursive: true });

    expect(findCurrentRepositoryRoot({ cwd: child })).toBe(directory);
  });
});

test("detects a worktree-style repository root with a .git file", () => {
  withTempDirectory((directory) => {
    writeFileSync(join(directory, ".git"), "gitdir: /tmp/situ-worktree-git-dir\n");

    expect(findCurrentRepositoryRoot({ cwd: directory })).toBe(directory);
  });
});

test("returns the nearest repository root when repositories are nested", () => {
  withTempDirectory((directory) => {
    const nested = join(directory, "nested");
    mkdirSync(join(directory, ".git"));
    mkdirSync(join(nested, ".git"), { recursive: true });

    expect(findCurrentRepositoryRoot({ cwd: nested })).toBe(nested);
  });
});

test("throws the documented validation error outside a git repository", () => {
  withTempDirectory((directory) => {
    expectNotInsideRepositoryError({
      cwd: directory,
      expectedCwd: directory,
    });
  });
});

test("throws the documented validation error for invalid cwd inputs", () => {
  withTempDirectory((directory) => {
    const filePath = join(directory, "file.txt");
    const missingPath = join(directory, "missing");
    writeFileSync(filePath, "not a directory");

    expectNotInsideRepositoryError({
      cwd: filePath,
      expectedCwd: filePath,
    });
    expectNotInsideRepositoryError({
      cwd: missingPath,
      expectedCwd: missingPath,
    });
  });
});

test("does not count a .git symlink as a repository marker", () => {
  withTempDirectory((directory) => {
    const actualGitPath = join(directory, "actual-git");
    const repositoryPath = join(directory, "repository");
    mkdirSync(actualGitPath);
    mkdirSync(repositoryPath);
    symlinkSync(actualGitPath, join(repositoryPath, ".git"));

    expectNotInsideRepositoryError({
      cwd: repositoryPath,
      expectedCwd: repositoryPath,
    });
  });
});

test("accepts a relative cwd by resolving it before walking", () => {
  withTempDirectory((directory) => {
    const child = join(directory, "child");
    mkdirSync(join(directory, ".git"));
    mkdirSync(child);

    expect(findCurrentRepositoryRoot({ cwd: relative(process.cwd(), child) })).toBe(directory);
  });
});

function expectNotInsideRepositoryError(input: {
  readonly cwd: string;
  readonly expectedCwd: string;
}): void {
  try {
    findCurrentRepositoryRoot({ cwd: input.cwd });
    throw new Error("Expected repository detection to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toBe(
      "Current directory is not inside a git repository.",
    );
    expect((error as ValidationError).details).toEqual({
      cwd: input.expectedCwd,
    });
  }
}
