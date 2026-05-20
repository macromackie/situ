import { resolveDatabasePath } from "../../db/index.js";
import * as v from "valibot";
import {
  defaultSituHttpServerHostname,
  defaultSituHttpServerPort,
  startSituHttpServer,
  type SituHttpServer,
  type StartSituHttpServerInput,
} from "../../http/server.js";
import {
  defineCommandSpec,
  noPositionals,
  parseDefinedCommandSpec,
  throwParserError,
  valueOption,
} from "../flags.js";
import type { SituCliInvocation, SituCliResult } from "../types.js";

type ParsedServeCommand = {
  readonly hostname: string;
  readonly port: number;
};

export type StartSituHttpServer = (input?: StartSituHttpServerInput) => SituHttpServer;

export type RunServeMainCommandInput = {
  readonly invocation: SituCliInvocation;
  readonly writeStdout: (text: string) => void;
  readonly waitForShutdown: (server: SituHttpServer) => Promise<void>;
  readonly startHttpServer?: StartSituHttpServer;
};

const loopbackHostnames = new Set(["127.0.0.1", "localhost"]);

const serveCommand = defineCommandSpec({
  command: "serve",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "host", flag: "--host" }),
    valueOption({ key: "port", flag: "--port" }),
  ],
  schema: v.object({
    host: v.optional(v.string()),
    port: v.optional(v.string()),
  }),
});

/**
 * Returns the finite-runner result for the long-running serve command.
 */
export function runServeFiniteCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult {
  parseServeCommand({ invocation: input.invocation });

  throwParserError({
    message: "Command serve must be run through mainSituCli.",
    details: { command: "serve" },
    outputMode: input.invocation.outputMode,
  });
}

/**
 * Runs the long-running serve command.
 */
export async function runServeMainCommand(input: RunServeMainCommandInput): Promise<number> {
  const parsedCommand = parseServeCommand({ invocation: input.invocation });
  const databasePath = resolveDatabasePath({
    databasePath: input.invocation.databasePath,
    environment: input.invocation.environment,
  });
  const server = (input.startHttpServer ?? startSituHttpServer)({
    hostname: parsedCommand.hostname,
    port: parsedCommand.port,
    databasePath,
    environment: input.invocation.environment,
  });

  try {
    input.writeStdout(
      formatServeReadyOutput({ invocation: input.invocation, server, databasePath }),
    );
    await input.waitForShutdown(server);

    return 0;
  } finally {
    await server.stop();
  }
}

function parseServeCommand(input: { readonly invocation: SituCliInvocation }): ParsedServeCommand {
  const options = parseDefinedCommandSpec({
    invocation: input.invocation,
    args: input.invocation.rest,
    spec: serveCommand,
  });

  return {
    hostname: parseServeHostname({
      invocation: input.invocation,
      value: options.host,
    }),
    port: parseServePort({
      invocation: input.invocation,
      value: options.port,
    }),
  };
}

function parseServeHostname(input: {
  readonly invocation: SituCliInvocation;
  readonly value?: string;
}): string {
  const hostname = input.value?.trim() ?? defaultSituHttpServerHostname;

  if (loopbackHostnames.has(hostname)) {
    return hostname;
  }

  throwParserError({
    message: "Expected a loopback host.",
    details: {
      field: "hostname",
      value: input.value,
      allowedValues: [...loopbackHostnames],
    },
    outputMode: input.invocation.outputMode,
  });
}

function parseServePort(input: {
  readonly invocation: SituCliInvocation;
  readonly value?: string;
}): number {
  if (input.value === undefined) {
    return defaultSituHttpServerPort;
  }

  if (!/^[0-9]+$/.test(input.value)) {
    throwInvalidPort({ invocation: input.invocation, value: input.value });
  }

  const port = Number(input.value);

  if (Number.isSafeInteger(port) && port >= 0 && port <= 65535) {
    return port;
  }

  throwInvalidPort({ invocation: input.invocation, value: input.value });
}

function throwInvalidPort(input: {
  readonly invocation: SituCliInvocation;
  readonly value: string;
}): never {
  throwParserError({
    message: "Expected a port from 0 to 65535.",
    details: {
      field: "port",
      value: input.value,
    },
    outputMode: input.invocation.outputMode,
  });
}

function formatServeReadyOutput(input: {
  readonly invocation: SituCliInvocation;
  readonly server: SituHttpServer;
  readonly databasePath: string;
}): string {
  if (input.invocation.outputMode === "json") {
    return `${JSON.stringify({
      url: input.server.url,
      hostname: input.server.hostname,
      port: input.server.port,
      databasePath: input.databasePath,
    })}\n`;
  }

  return `situ serving ${input.server.url}\n`;
}
