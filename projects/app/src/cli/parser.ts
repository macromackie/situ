import { resolve as resolvePath } from "node:path";

import { object, or } from "@optique/core/constructs";
import { runParser } from "@optique/core/facade";
import { message as optiqueMessage } from "@optique/core/message";
import { map, multiple } from "@optique/core/modifiers";
import { command, option, passThrough } from "@optique/core/primitives";
import { valibot } from "@optique/valibot";
import * as v from "valibot";

import {
  isSituCliCommandName,
  parseSituCliInvocationSchema,
  type SituCliCommandName,
} from "./command-schema.js";
import { throwParserError } from "./flags.js";
import { defaultSituVersion, type RunSituCliInput, type SituCliInvocation } from "./types.js";

type OptiqueCommandTarget = {
  readonly command: SituCliCommandName;
  readonly rest: readonly string[];
};

type OptiqueParseError = {
  readonly kind: "error";
};

type OptiqueRootParseResult = {
  readonly jsonFlags: readonly boolean[];
  readonly databasePaths: readonly string[];
  readonly target: OptiqueCommandTarget;
};

const databasePathValueParser = valibot(
  v.pipe(
    v.string(),
    v.check((value) => !value.startsWith("--"), "Expected a database path."),
  ),
  {
    metavar: "PATH",
    placeholder: "/tmp/situ.db",
  },
);

const commandDescriptions = {
  help: "Show this help text.",
  version: "Print the Situ CLI version.",
  doctor: "Check local CLI configuration without mutating state.",
  runbook: "Print the operating runbook for autoresearch runs.",
  "self-update": "Update situ to the latest release.",
  serve: "Start the local Situ HTTP server.",
  artifacts: "Manage artifact records.",
  baselines: "Manage baseline records.",
  briefings: "Manage live briefing records.",
  comments: "Manage comments attached to records.",
  events: "Manage event timeline records.",
  experiments: "Manage experiment records.",
  live: "Manage live presentation records.",
  measurements: "Manage measurement records.",
  notifications: "Manage notification inbox records.",
  projects: "Manage project records.",
  reports: "Manage report records.",
  reviews: "Manage review records.",
  status: "Summarize project and repository work status.",
  tasks: "Manage task records.",
  verify: "Verify project and repository completion evidence.",
} satisfies Record<SituCliCommandName, string>;

const commandTargetParser = (name: SituCliCommandName) =>
  command(
    name,
    map(passThrough({ format: "greedy", hidden: true }), (rest): OptiqueCommandTarget => {
      return {
        command: name,
        rest,
      };
    }),
    {
      description: optiqueMessage`${commandDescriptions[name]}`,
    },
  );

const situRecordCommandParser = or(
  commandTargetParser("artifacts"),
  commandTargetParser("baselines"),
  commandTargetParser("briefings"),
  commandTargetParser("comments"),
  commandTargetParser("events"),
  commandTargetParser("experiments"),
  commandTargetParser("live"),
  commandTargetParser("measurements"),
  commandTargetParser("notifications"),
  commandTargetParser("projects"),
  commandTargetParser("reports"),
  commandTargetParser("reviews"),
  commandTargetParser("status"),
  commandTargetParser("tasks"),
  commandTargetParser("verify"),
);

const situCommandParser = or(
  commandTargetParser("help"),
  commandTargetParser("version"),
  commandTargetParser("doctor"),
  commandTargetParser("runbook"),
  commandTargetParser("self-update"),
  commandTargetParser("serve"),
  situRecordCommandParser,
);

const situRootParser = object({
  jsonFlags: multiple(
    option("--json", {
      description: optiqueMessage`Print machine-readable JSON output for data commands.`,
    }),
  ),
  databasePaths: multiple(
    option("--db", "--database", databasePathValueParser, {
      description: optiqueMessage`Use a specific SQLite database path.`,
    }),
  ),
  target: situCommandParser,
});

export function parseSituCliInvocation(input: RunSituCliInput): SituCliInvocation {
  const version = input.version ?? defaultSituVersion;
  const cwd = resolvePath(input.cwd ?? process.cwd());
  const rootMetaInvocation = parseRootMetaInvocation({
    args: input.args,
    cwd,
    environment: input.environment,
    version,
  });

  if (rootMetaInvocation !== undefined) {
    return rootMetaInvocation;
  }

  if (isGlobalOnlyInvocation(input.args)) {
    return parseSituCliInvocationSchema({
      command: "help",
      rest: [],
      outputMode: probeOutputModeBeforeParserFailure(input.args),
      databasePath: lastGlobalDatabasePath(input.args),
      environment: input.environment,
      cwd,
      version,
    });
  }

  let errorMessage = "";
  const parsed = runParser(situRootParser, "situ", input.args, {
    aboveError: "none",
    onError: (): OptiqueParseError => ({ kind: "error" }),
    stderr: (text) => {
      errorMessage += text;
    },
  }) as OptiqueParseError | OptiqueRootParseResult;

  if (isOptiqueParseError(parsed)) {
    throwOptiqueParseError({
      args: input.args,
      message: errorMessage,
    });
  }

  return parseSituCliInvocationSchema({
    command: parsed.target.command,
    rest: parsed.target.rest,
    outputMode: parsed.jsonFlags.length > 0 ? "json" : "text",
    databasePath: parsed.databasePaths.at(-1),
    environment: input.environment,
    cwd,
    version,
  });
}

function parseRootMetaInvocation(input: {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly version: string;
}): SituCliInvocation | undefined {
  let outputMode: "text" | "json" = "text";
  let databasePath: string | undefined;

  for (let index = 0; index < input.args.length; index += 1) {
    const arg = input.args[index];

    if (arg === "--json") {
      outputMode = "json";
      continue;
    }

    if (arg === "--db" || arg === "--database") {
      const value = input.args[index + 1];

      if (value === undefined || value.startsWith("--")) {
        throwParserError({
          message: `Missing value for ${arg}.`,
          details: { option: arg },
          outputMode,
        });
      }

      databasePath = value;
      index += 1;
      continue;
    }

    const databasePathFromEquals = parseDatabasePathEquals(arg);

    if (databasePathFromEquals !== undefined) {
      databasePath = databasePathFromEquals;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      return parseSituCliInvocationSchema({
        command: "help",
        rest: input.args.slice(index + 1),
        outputMode,
        databasePath,
        environment: input.environment,
        cwd: input.cwd,
        version: input.version,
      });
    }

    if (arg === "--version") {
      return parseSituCliInvocationSchema({
        command: "version",
        rest: input.args.slice(index + 1),
        outputMode,
        databasePath,
        environment: input.environment,
        cwd: input.cwd,
        version: input.version,
      });
    }

    return undefined;
  }

  return undefined;
}

function isOptiqueParseError(
  value: OptiqueParseError | OptiqueRootParseResult,
): value is OptiqueParseError {
  return "kind" in value && value.kind === "error";
}

function throwOptiqueParseError(input: {
  readonly args: readonly string[];
  readonly message: string;
}): never {
  const outputMode = probeOutputModeBeforeParserFailure(input.args);
  const commandCandidate = findFirstCommandCandidate(input.args);

  if (commandCandidate !== undefined && !isSituCliCommandName(commandCandidate)) {
    throwParserError({
      message: `Unknown command: ${commandCandidate}`,
      details: { command: commandCandidate },
      outputMode,
      includeHelp: true,
    });
  }

  const normalized = normalizeOptiqueErrorMessage(input.message);
  const missingOption = matchMissingOption(normalized);

  if (missingOption !== undefined) {
    throwParserError({
      message: `Missing value for ${missingOption}.`,
      details: { option: missingOption },
      outputMode,
    });
  }

  const unknownGlobalOption = matchUnexpectedGlobalOption(normalized);

  if (unknownGlobalOption !== undefined) {
    throwParserError({
      message: `Unknown global option: ${unknownGlobalOption}.`,
      details: { option: unknownGlobalOption },
      outputMode,
    });
  }

  throwParserError({
    message: normalized,
    details: { parser: "optique" },
    outputMode,
  });
}

function normalizeOptiqueErrorMessage(message: string): string {
  return message.trim().replace(/^Error:\s*/u, "");
}

function matchMissingOption(message: string): string | undefined {
  const directMatch = /^`(?<option>--[a-z-]+)` requires `PATH`\.$/u.exec(message);

  if (directMatch?.groups?.option !== undefined) {
    return directMatch.groups.option;
  }

  const databasePathMatch = /^`(?<option>--db)`\/`--database`: "Expected a database path\."$/u.exec(
    message,
  );

  if (databasePathMatch?.groups?.option !== undefined) {
    return databasePathMatch.groups.option;
  }

  return undefined;
}

function matchUnexpectedGlobalOption(message: string): string | undefined {
  const match = /^Unexpected option or argument: "(?<option>-[^"]+)"\.$/u.exec(message);
  return match?.groups?.option;
}

function probeOutputModeBeforeParserFailure(args: readonly string[]): "text" | "json" {
  let outputMode: "text" | "json" = "text";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      outputMode = "json";
      continue;
    }

    if (arg === "--db" || arg === "--database") {
      index += 1;
      continue;
    }

    if (parseDatabasePathEquals(arg) !== undefined) {
      continue;
    }

    return outputMode;
  }

  return outputMode;
}

function findFirstCommandCandidate(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      continue;
    }

    if (arg === "--db" || arg === "--database") {
      index += 1;
      continue;
    }

    if (parseDatabasePathEquals(arg) !== undefined) {
      continue;
    }

    if (arg.startsWith("-")) {
      return undefined;
    }

    return arg;
  }

  return undefined;
}

function isGlobalOnlyInvocation(args: readonly string[]): boolean {
  if (args.length === 0) {
    return true;
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      continue;
    }

    if (arg === "--db" || arg === "--database") {
      const value = args[index + 1];

      if (value === undefined || value.startsWith("-")) {
        return false;
      }

      index += 1;
      continue;
    }

    if (parseDatabasePathEquals(arg) !== undefined) {
      continue;
    }

    return false;
  }

  return true;
}

function lastGlobalDatabasePath(args: readonly string[]): string | undefined {
  let databasePath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--db" || arg === "--database") {
      databasePath = args[index + 1];
      index += 1;
      continue;
    }

    const databasePathFromEquals = parseDatabasePathEquals(arg);

    if (databasePathFromEquals !== undefined) {
      databasePath = databasePathFromEquals;
    }
  }

  return databasePath;
}

function parseDatabasePathEquals(arg: string): string | undefined {
  if (arg.startsWith("--db=")) {
    return arg.slice("--db=".length);
  }

  if (arg.startsWith("--database=")) {
    return arg.slice("--database=".length);
  }

  return undefined;
}
