import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand, type CommandResult } from "./command.js";
import { listWorkspaceAutoresearchCases } from "./harness/workspace-cases.js";

const evalsProjectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const selectedCaseIdsEnvironmentKey = "SITU_EVAL_CASE_IDS";

type RunCommand = (input: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}) => CommandResult;

export type ParsedEvalRunArgs = {
  readonly caseIds: readonly string[];
  readonly showHelp: boolean;
  readonly errorMessage?: string;
};

/**
 * Runs the currently defined LLM eval suite.
 */
export async function runEvals(
  input: {
    readonly argv?: readonly string[];
    readonly writeStdout?: (text: string) => void;
    readonly writeStderr?: (text: string) => void;
    readonly runCommand?: RunCommand;
  } = {},
): Promise<number> {
  const writeStderr =
    input.writeStderr ??
    ((text: string): void => {
      process.stderr.write(text);
    });

  const writeStdout =
    input.writeStdout ??
    ((text: string): void => {
      process.stdout.write(text);
    });
  const parsedArgs = parseEvalRunArgs({ argv: input.argv ?? process.argv.slice(2) });

  if (parsedArgs.showHelp) {
    writeStdout(evalRunUsage());
    return 0;
  }

  if (parsedArgs.errorMessage !== undefined) {
    writeStderr(`${parsedArgs.errorMessage}\n\n${evalRunUsage()}`);
    return 2;
  }

  const validationError = validateCaseIds({ caseIds: parsedArgs.caseIds });

  if (validationError !== undefined) {
    writeStderr(`${validationError}\n\n${evalRunUsage()}`);
    return 2;
  }

  const outputPath = process.env.SITU_EVAL_OUTPUT_PATH ?? defaultOutputPath();
  mkdirSync(dirname(outputPath), { recursive: true });

  const environment = {
    ...process.env,
  };

  if (parsedArgs.caseIds.length > 0) {
    environment[selectedCaseIdsEnvironmentKey] = parsedArgs.caseIds.join(",");
  } else {
    delete environment[selectedCaseIdsEnvironmentKey];
  }

  const result = (input.runCommand ?? runCommand)({
    command: "bun",
    args: ["x", "evalite", "run", "--outputPath", outputPath, "src/evals"],
    cwd: evalsProjectRoot,
    environment,
  });

  if (result.stdout.length > 0) {
    writeStdout(result.stdout);
  }

  if (result.stderr.length > 0) {
    writeStderr(result.stderr);
  }

  return result.exitCode ?? 1;
}

if (import.meta.main) {
  process.exit(await runEvals());
}

function defaultOutputPath(): string {
  return join(evalsProjectRoot, ".runs", "latest-results.json");
}

/**
 * Parses pytest-like positional eval case selectors.
 */
export function parseEvalRunArgs(input: { readonly argv: readonly string[] }): ParsedEvalRunArgs {
  const caseIds: string[] = [];

  for (const arg of input.argv) {
    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      return {
        caseIds: [],
        showHelp: true,
      };
    }

    if (arg.startsWith("-")) {
      return {
        caseIds: [],
        showHelp: false,
        errorMessage: `Unknown eval option: ${arg}`,
      };
    }

    caseIds.push(arg);
  }

  return {
    caseIds,
    showHelp: false,
  };
}

function validateCaseIds(input: { readonly caseIds: readonly string[] }): string | undefined {
  const knownCaseIds = listWorkspaceAutoresearchCases().map((workspaceCase) => workspaceCase.id);
  const unknownCaseIds = input.caseIds.filter((caseId) => !knownCaseIds.includes(caseId));

  if (unknownCaseIds.length === 0) {
    return undefined;
  }

  return [
    `Unknown eval case${unknownCaseIds.length === 1 ? "" : "s"}: ${unknownCaseIds.join(", ")}`,
    `Known eval cases: ${knownCaseIds.join(", ")}`,
  ].join("\n");
}

function evalRunUsage(): string {
  const knownCaseIds = listWorkspaceAutoresearchCases().map((workspaceCase) => workspaceCase.id);

  return [
    "Usage: mise run evals [case-id ...]",
    "",
    "Runs real local-agent Evalite cases.",
    "",
    "Examples:",
    "  mise run evals",
    "  mise run evals branching-normalizer",
    "  mise run evals spelling-corrector branching-normalizer",
    "",
    `Known eval cases: ${knownCaseIds.join(", ")}`,
    "",
  ].join("\n");
}
