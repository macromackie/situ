import { ValidationError } from "@situ/errors";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const worktreesPackageName = "worktrees" as const;
export type WorktreesPackageName = typeof worktreesPackageName;

export type ResolveInsideRootInput = {
  readonly rootPath: string;
  readonly relativePath: string;
};

export type FilterCommandEnvironmentInput = {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly allowedSecretNames?: readonly string[];
};

/**
 * Describes a git worktree command request.
 */
export type CreateGitWorktreeCommandInput = {
  readonly args: readonly string[];
  readonly cwd?: string;
};

/**
 * Describes a git worktree command for a shell runner.
 */
export type GitWorktreeCommand = {
  readonly command: "git";
  readonly args: readonly string[];
  readonly cwd?: string;
};

/**
 * Creates a git worktree command.
 */
export function gitWorktreeCommand(input: CreateGitWorktreeCommandInput): GitWorktreeCommand {
  return {
    command: "git",
    args: ["worktree", ...input.args],
    cwd: input.cwd,
  };
}

/**
 * Lexically resolves a relative path inside an allowed root.
 *
 * This helper is for path references and command descriptors. It does not read
 * the filesystem, resolve symlinks, or make caller-controlled write
 * destinations physically safe.
 */
export function resolveInsideRoot(input: ResolveInsideRootInput): string {
  if (isAbsolute(input.relativePath)) {
    throw new ValidationError({
      message: "Path must be relative to the allowed root.",
      details: { relativePath: input.relativePath },
    });
  }

  const rootPath = resolve(input.rootPath);
  const resolvedPath = resolve(rootPath, input.relativePath);
  const pathFromRoot = relative(rootPath, resolvedPath);

  if (isPathOutsideRoot({ pathFromRoot })) {
    throw new ValidationError({
      message: "Path escapes the allowed root.",
      details: { rootPath, relativePath: input.relativePath },
    });
  }

  return resolvedPath;
}

/**
 * Removes likely secrets from a command environment.
 */
export function filterCommandEnvironment(
  input: FilterCommandEnvironmentInput,
): Record<string, string> {
  const allowedSecretNames = new Set(input.allowedSecretNames ?? []);
  const filteredEnvironment: Record<string, string> = {};

  for (const [name, value] of Object.entries(input.environment)) {
    if (value === undefined) {
      continue;
    }

    if (isLikelySecretName({ name }) && !allowedSecretNames.has(name)) {
      continue;
    }

    filteredEnvironment[name] = value;
  }

  return filteredEnvironment;
}

function isLikelySecretName(input: { readonly name: string }): boolean {
  return /(?:^|_)(?:KEY|TOKEN|SECRET|PASSWORD)$/i.test(input.name);
}

function isPathOutsideRoot(input: { readonly pathFromRoot: string }): boolean {
  if (input.pathFromRoot === "..") {
    return true;
  }

  if (input.pathFromRoot.startsWith(`..${sep}`)) {
    return true;
  }

  return isAbsolute(input.pathFromRoot);
}
