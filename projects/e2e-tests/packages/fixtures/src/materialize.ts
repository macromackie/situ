import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { posix as posixPath } from "node:path";

import { ConflictError, ValidationError } from "@situ/errors";

import type { TestFixture } from "./types.js";

export type MaterializeFixtureRepositoryInput = {
  readonly fixture: TestFixture;
  readonly rootPath: string;
};

export type MaterializedFixtureFile = {
  readonly relativePath: string;
  readonly path: string;
};

export type MaterializedFixtureRepository = {
  readonly fixtureName: string;
  readonly repositoryPath: string;
  readonly files: readonly MaterializedFixtureFile[];
};

type ValidatedFixtureFile = {
  readonly relativePath: string;
  readonly content: string;
};

export function materializeFixtureRepository(
  input: MaterializeFixtureRepositoryInput,
): MaterializedFixtureRepository {
  validateRootPath(input.rootPath);
  validateFixtureName(input.fixture.name);

  const validatedFiles = validateFixtureFiles(input.fixture.repositoryFiles);
  const fixturePath = join(input.rootPath, input.fixture.name);
  const repositoryPath = join(fixturePath, "repository");

  if (existsSync(fixturePath)) {
    throw new ConflictError({
      message: "Fixture repository already exists.",
    });
  }

  try {
    mkdirSync(fixturePath, { recursive: true });
    mkdirSync(repositoryPath, { recursive: true });
    mkdirSync(join(repositoryPath, ".git"));

    const files = validatedFiles.map((file) => {
      const filePath = join(repositoryPath, ...file.relativePath.split("/"));
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, file.content, "utf8");

      return {
        relativePath: file.relativePath,
        path: filePath,
      };
    });

    return {
      fixtureName: input.fixture.name,
      repositoryPath,
      files,
    };
  } catch (error) {
    rmSync(fixturePath, { force: true, recursive: true });
    throw error;
  }
}

function validateRootPath(rootPath: string): void {
  if (!isAbsolute(rootPath)) {
    throw new ValidationError({
      message: "Expected an absolute fixture root path.",
    });
  }
}

function validateFixtureName(fixtureName: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(fixtureName)) {
    throw new ValidationError({
      message: "Expected a safe fixture name.",
    });
  }
}

function validateFixtureFiles(
  files: TestFixture["repositoryFiles"],
): readonly ValidatedFixtureFile[] {
  const seenFiles = new Set<string>();
  const seenDirectories = new Set<string>();

  return files.map((file) => {
    const relativePath = normalizeFixtureFilePath(file.path);
    const segments = relativePath.split("/");

    if (segments[0] === ".git") {
      throw new ValidationError({
        message: "Conflicting fixture file paths.",
      });
    }

    if (seenFiles.has(relativePath)) {
      throw new ValidationError({
        message: "Duplicate fixture file path.",
      });
    }

    if (seenDirectories.has(relativePath)) {
      throw new ValidationError({
        message: "Conflicting fixture file paths.",
      });
    }

    for (let index = 1; index < segments.length; index += 1) {
      const directoryPath = segments.slice(0, index).join("/");

      if (seenFiles.has(directoryPath)) {
        throw new ValidationError({
          message: "Conflicting fixture file paths.",
        });
      }

      seenDirectories.add(directoryPath);
    }

    seenFiles.add(relativePath);

    return {
      relativePath,
      content: file.content,
    };
  });
}

function normalizeFixtureFilePath(filePath: string): string {
  if (filePath === "" || filePath === "." || filePath.endsWith("/")) {
    throw new ValidationError({
      message: "Expected fixture file path to name a file.",
    });
  }

  if (posixPath.isAbsolute(filePath) || filePath.includes("\\") || /^[A-Za-z]:/.test(filePath)) {
    throw new ValidationError({
      message: "Fixture file path escapes the repository root.",
    });
  }

  const segments = filePath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new ValidationError({
      message: "Fixture file path escapes the repository root.",
    });
  }

  const normalizedPath = posixPath.normalize(filePath);
  if (
    normalizedPath === "." ||
    normalizedPath.startsWith("../") ||
    normalizedPath.includes("/../")
  ) {
    throw new ValidationError({
      message: "Fixture file path escapes the repository root.",
    });
  }

  return normalizedPath;
}
