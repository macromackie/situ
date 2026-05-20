import { expect, test } from "bun:test";

import type { CommandResult } from "./command.js";
import { parseEvalRunArgs, runEvals } from "./run.js";

type RunCommandInput = {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
};

test("parseEvalRunArgs accepts positional case ids", () => {
  expect(
    parseEvalRunArgs({
      argv: ["branching-normalizer", "spelling-corrector"],
    }),
  ).toEqual({
    caseIds: ["branching-normalizer", "spelling-corrector"],
    showHelp: false,
  });
});

test("parseEvalRunArgs treats a standalone separator as optional", () => {
  expect(
    parseEvalRunArgs({
      argv: ["--", "branching-normalizer"],
    }),
  ).toEqual({
    caseIds: ["branching-normalizer"],
    showHelp: false,
  });
});

test("parseEvalRunArgs handles help without running cases", () => {
  expect(
    parseEvalRunArgs({
      argv: ["--help"],
    }),
  ).toEqual({
    caseIds: [],
    showHelp: true,
  });
});

test("parseEvalRunArgs rejects unknown options before eval work starts", () => {
  expect(
    parseEvalRunArgs({
      argv: ["--dry-run"],
    }),
  ).toEqual({
    caseIds: [],
    showHelp: false,
    errorMessage: "Unknown eval option: --dry-run",
  });
});

test("runEvals passes positional case selectors to Evalite", async () => {
  const calls: RunCommandInput[] = [];
  const exitCode = await runEvals({
    argv: ["branching-normalizer"],
    writeStdout: () => {},
    writeStderr: () => {},
    runCommand: (input) => {
      calls.push(input);

      return commandResult({ input });
    },
  });

  expect(exitCode).toBe(0);
  expect(calls).toHaveLength(1);
  expect(calls[0]?.command).toBe("bun");
  expect(calls[0]?.args.slice(0, 4)).toEqual(["x", "evalite", "run", "--outputPath"]);
  expect(calls[0]?.args[4]).toEndWith("projects/evals/.runs/latest-results.json");
  expect(calls[0]?.args[5]).toBe("src/evals");
  expect(calls[0]?.environment?.SITU_EVAL_CASE_IDS).toBe("branching-normalizer");
});

test("runEvals rejects unknown case ids before launching Evalite", async () => {
  let didRunCommand = false;
  let stderr = "";
  const exitCode = await runEvals({
    argv: ["missing-case"],
    writeStdout: () => {},
    writeStderr: (text) => {
      stderr += text;
    },
    runCommand: (input) => {
      didRunCommand = true;

      return commandResult({ input });
    },
  });

  expect(exitCode).toBe(2);
  expect(didRunCommand).toBe(false);
  expect(stderr).toContain("Unknown eval case: missing-case");
  expect(stderr).toContain("Known eval cases: spelling-corrector, branching-normalizer");
});

function commandResult(input: { readonly input: RunCommandInput }): CommandResult {
  return {
    command: [input.input.command, ...input.input.args],
    cwd: input.input.cwd,
    exitCode: 0,
    stdout: "",
    stderr: "",
    timedOut: false,
  };
}
