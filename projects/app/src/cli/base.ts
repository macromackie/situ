import { resolveDatabasePath } from "../db/index.js";
import { runArtifactsCommand } from "./commands/artifacts.js";
import { runBaselinesCommand } from "./commands/baselines.js";
import { runBriefingsCommand } from "./commands/briefings.js";
import { runCommentsCommand } from "./commands/comments.js";
import { runEventsCommand } from "./commands/events.js";
import { runExperimentsCommand } from "./commands/experiments.js";
import { runLiveCommand } from "./commands/live.js";
import { runMeasurementsCommand } from "./commands/measurements.js";
import { runNotificationsCommand } from "./commands/notifications.js";
import { runProjectsCommand } from "./commands/projects.js";
import { runReportsCommand } from "./commands/reports.js";
import { runReviewsCommand } from "./commands/reviews.js";
import { runServeFiniteCommand, runServeMainCommand } from "./commands/serve.js";
import { runStatusCommand } from "./commands/status.js";
import { runTasksCommand } from "./commands/tasks.js";
import { runVerifyCommand } from "./commands/verify.js";
import { isCliParserError, throwParserError } from "./flags.js";
import { formatCliError } from "./format.js";
import { findHelpPathForInvocation, formatCliHelp, rootHelpText } from "./help.js";
import { parseSituCliInvocation } from "./parser.js";
import type {
  MainSituCliInput,
  RunSituCliInput,
  SituCliInvocation,
  SituCliOutputMode,
  SituCliResult,
} from "./types.js";

export async function runSituCli(input: RunSituCliInput): Promise<SituCliResult> {
  try {
    const invocation = parseSituCliInvocation(input);
    return await runSituCliInvocation(invocation);
  } catch (error) {
    if (isCliParserError(error)) {
      return formatCliError({
        error: error.error,
        outputMode: error.outputMode,
        includeHelp: error.includeHelp,
        helpText: rootHelpText,
      });
    }

    return formatCliError({
      error,
      outputMode: "text",
      includeHelp: false,
      helpText: rootHelpText,
    });
  }
}

export async function mainSituCli(input: MainSituCliInput = {}): Promise<number> {
  const args = input.args ?? process.argv.slice(2);
  const environment = input.environment ?? process.env;
  const writeStdout =
    input.writeStdout ??
    ((text: string): void => {
      process.stdout.write(text);
    });
  const writeStderr =
    input.writeStderr ??
    ((text: string): void => {
      process.stderr.write(text);
    });
  let outputMode: SituCliOutputMode = "text";
  let result: SituCliResult;

  try {
    const invocation = parseSituCliInvocation({
      args,
      version: input.version,
      environment,
      cwd: input.cwd,
    });
    outputMode = invocation.outputMode;

    if (findHelpPathForInvocation(invocation) !== undefined) {
      result = await runSituCli({
        args,
        version: input.version,
        environment,
        cwd: input.cwd,
      });
    } else if (invocation.command === "serve") {
      result = {
        exitCode: await runServeMainCommand({
          invocation,
          startHttpServer: input.startHttpServer,
          writeStdout,
          waitForShutdown: input.waitForShutdown ?? waitForProcessShutdown,
        }),
        stdout: "",
        stderr: "",
      };
    } else {
      result = await runSituCli({
        args,
        version: input.version,
        environment,
        cwd: input.cwd,
      });
    }
  } catch (error) {
    result = formatCaughtCliError({
      error,
      outputMode,
    });
  }

  if (result.stdout.length > 0) {
    writeStdout(result.stdout);
  }

  if (result.stderr.length > 0) {
    writeStderr(result.stderr);
  }

  return result.exitCode;
}

function formatCaughtCliError(input: {
  readonly error: unknown;
  readonly outputMode: SituCliOutputMode;
}): SituCliResult {
  if (isCliParserError(input.error)) {
    return formatCliError({
      error: input.error.error,
      outputMode: input.error.outputMode,
      includeHelp: input.error.includeHelp,
      helpText: rootHelpText,
    });
  }

  return formatCliError({
    error: input.error,
    outputMode: input.outputMode,
    includeHelp: false,
    helpText: rootHelpText,
  });
}

function waitForProcessShutdown(): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;

    const cleanup = (): void => {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    };
    const onSignal = (): void => {
      if (resolved) {
        return;
      }

      resolved = true;
      cleanup();
      resolve();
    };

    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  });
}

async function runSituCliInvocation(invocation: SituCliInvocation): Promise<SituCliResult> {
  try {
    const helpPath = findHelpPathForInvocation(invocation);

    if (helpPath !== undefined) {
      return {
        exitCode: 0,
        stdout: formatCliHelp({ path: helpPath }),
        stderr: "",
      };
    }

    switch (invocation.command) {
      case "version":
        assertNoCommandArgs(invocation);
        return formatVersion(invocation);

      case "doctor":
        assertNoCommandArgs(invocation);
        return formatDoctor(invocation);

      case "serve":
        return runServeFiniteCommand({ invocation });

      case "artifacts":
        return runArtifactsCommand({ invocation });

      case "baselines":
        return runBaselinesCommand({ invocation });

      case "briefings":
        return runBriefingsCommand({ invocation });

      case "comments":
        return runCommentsCommand({ invocation });

      case "events":
        return runEventsCommand({ invocation });

      case "experiments":
        return runExperimentsCommand({ invocation });

      case "live":
        return runLiveCommand({ invocation });

      case "measurements":
        return runMeasurementsCommand({ invocation });

      case "notifications":
        return runNotificationsCommand({ invocation });

      case "projects":
        return runProjectsCommand({ invocation });

      case "reports":
        return await runReportsCommand({ invocation });

      case "reviews":
        return runReviewsCommand({ invocation });

      case "status":
        return runStatusCommand({ invocation });

      case "tasks":
        return runTasksCommand({ invocation });

      case "verify":
        return runVerifyCommand({ invocation });

      default:
        throwParserError({
          message: `Unknown command: ${invocation.command}`,
          details: { command: invocation.command },
          outputMode: invocation.outputMode,
          includeHelp: true,
        });
    }
  } catch (error) {
    if (isCliParserError(error)) {
      return formatCliError({
        error: error.error,
        outputMode: error.outputMode,
        includeHelp: error.includeHelp,
        helpText: rootHelpText,
      });
    }

    return formatCliError({
      error,
      outputMode: invocation.outputMode,
      includeHelp: false,
      helpText: rootHelpText,
    });
  }
}

function formatVersion(invocation: SituCliInvocation): SituCliResult {
  if (invocation.outputMode === "json") {
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ version: invocation.version })}\n`,
      stderr: "",
    };
  }

  return { exitCode: 0, stdout: `${invocation.version}\n`, stderr: "" };
}

function formatDoctor(invocation: SituCliInvocation): SituCliResult {
  const databasePath = resolveDatabasePath({
    databasePath: invocation.databasePath,
    environment: invocation.environment,
  });

  if (invocation.outputMode === "json") {
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({
        ok: true,
        version: invocation.version,
        databasePath,
      })}\n`,
      stderr: "",
    };
  }

  return { exitCode: 0, stdout: "situ doctor ok\n", stderr: "" };
}

function assertNoCommandArgs(invocation: SituCliInvocation): void {
  if (invocation.rest.length === 0) {
    return;
  }

  throwParserError({
    message: `Command ${invocation.command} does not accept arguments: ${invocation.rest.join(" ")}`,
    details: {
      command: invocation.command,
      arguments: invocation.rest,
    },
    outputMode: invocation.outputMode,
  });
}
