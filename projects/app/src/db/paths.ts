import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

import { ValidationError } from "@situ/errors";

export const defaultDatabaseFileName = "situ.db" as const;
export const memoryDatabasePath = ":memory:" as const;

export type ResolveStateHomeInput = {
  readonly environment?: NodeJS.ProcessEnv;
};

export type ResolveDatabasePathInput = {
  readonly environment?: NodeJS.ProcessEnv;
  readonly stateHomePath?: string;
  readonly databasePath?: string;
};

/**
 * Resolves the Situ state home.
 */
export function resolveStateHome(input: ResolveStateHomeInput = {}): string {
  const environment = input.environment ?? process.env;
  const situHome = nonEmptyString(environment.SITU_HOME);

  if (situHome !== undefined) {
    return requireAbsolutePath({
      field: "SITU_HOME",
      path: situHome,
    });
  }

  const home = nonEmptyString(environment.HOME);

  if (home === undefined) {
    throw new ValidationError({
      message: "Unable to resolve Situ state home.",
      details: { field: "HOME" },
    });
  }

  return join(
    requireAbsolutePath({
      field: "HOME",
      path: home,
    }),
    ".situ",
  );
}

/**
 * Resolves the SQLite database path.
 */
export function resolveDatabasePath(input: ResolveDatabasePathInput = {}): string {
  if (input.databasePath === memoryDatabasePath) {
    return memoryDatabasePath;
  }

  if (input.databasePath !== undefined) {
    return requireAbsolutePath({
      field: "databasePath",
      path: input.databasePath,
    });
  }

  const stateHomePath = (() => {
    if (input.stateHomePath !== undefined) {
      return requireAbsolutePath({
        field: "stateHomePath",
        path: input.stateHomePath,
      });
    }

    return resolveStateHome({
      environment: input.environment,
    });
  })();

  return join(stateHomePath, defaultDatabaseFileName);
}

type EnsureDatabaseDirectoryInput = {
  readonly databasePath: string;
};

/**
 * Creates the parent directory for a file-backed database.
 */
export function ensureDatabaseDirectory(input: EnsureDatabaseDirectoryInput): void {
  if (input.databasePath === memoryDatabasePath) {
    return;
  }

  mkdirSync(dirname(input.databasePath), { recursive: true });
}

type RequireAbsolutePathInput = {
  readonly field: string;
  readonly path: string;
};

function requireAbsolutePath(input: RequireAbsolutePathInput): string {
  if (isAbsolute(input.path)) {
    return input.path;
  }

  throw new ValidationError({
    message: "Expected an absolute path.",
    details: { field: input.field },
  });
}

function nonEmptyString(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }

  return value;
}
