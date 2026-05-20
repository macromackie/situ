import { lstatSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";

import { ValidationError } from "@situ/errors";

export type FindCurrentRepositoryRootInput = {
  readonly cwd: string;
};

/**
 * Finds the nearest git repository root containing the invocation directory.
 */
export function findCurrentRepositoryRoot(input: FindCurrentRepositoryRootInput): string {
  const resolvedCwd = resolve(input.cwd);

  assertInspectableDirectory({
    path: resolvedCwd,
    cwd: resolvedCwd,
  });

  let current = resolvedCwd;
  const root = parse(current).root;

  while (true) {
    const gitEntryPath = join(current, ".git");

    try {
      const gitEntry = lstatSync(gitEntryPath);

      if (gitEntry.isDirectory() || gitEntry.isFile()) {
        return current;
      }
    } catch (error) {
      if (!isMissingPathError(error)) {
        throwNotInsideRepository({ cwd: resolvedCwd });
      }
    }

    if (current === root) {
      throwNotInsideRepository({ cwd: resolvedCwd });
    }

    current = dirname(current);
  }
}

function assertInspectableDirectory(input: { readonly path: string; readonly cwd: string }): void {
  try {
    if (lstatSync(input.path).isDirectory()) {
      return;
    }
  } catch {
    throwNotInsideRepository({ cwd: input.cwd });
  }

  throwNotInsideRepository({ cwd: input.cwd });
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function throwNotInsideRepository(input: { readonly cwd: string }): never {
  throw new ValidationError({
    message: "Current directory is not inside a git repository.",
    details: {
      cwd: input.cwd,
    },
  });
}
