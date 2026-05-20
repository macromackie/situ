import { ValidationError } from "@situ/errors";
import { execa, type Options } from "execa";

export type ProcessRunnerInput = {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly input?: string;
};

export type ProcessRunnerResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type ProcessRunner = {
  readonly run: (input: ProcessRunnerInput) => Promise<ProcessRunnerResult>;
};

export function createExecaProcessRunner(
  options: {
    readonly baseEnvironment?: Readonly<Record<string, string | undefined>>;
  } = {},
): ProcessRunner {
  return {
    run: async (input) => {
      if (input.command.trim().length === 0) {
        throw new ValidationError({
          message: "Process command must not be empty.",
          details: {},
        });
      }

      const result = await execa(input.command, [...(input.args ?? [])], {
        cwd: input.cwd,
        env: filterProcessEnvironment({
          ...options.baseEnvironment,
          ...input.environment,
        }),
        input: input.input,
        reject: false,
        stderr: "pipe",
        stdout: "pipe",
        stripFinalNewline: false,
      } satisfies Options);

      return {
        exitCode: result.exitCode ?? 1,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    },
  };
}

function filterProcessEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const filtered: Record<string, string> = {};

  for (const [name, value] of Object.entries(environment)) {
    if (value !== undefined) {
      filtered[name] = value;
    }
  }

  return filtered;
}
