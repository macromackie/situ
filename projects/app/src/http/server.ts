import { ValidationError } from "@situ/errors";

import { handleSituHttpRequest } from "./handler.js";

export const defaultSituHttpServerHostname = "127.0.0.1" as const;
export const defaultSituHttpServerPort = 7373 as const;

export type StartSituHttpServerInput = {
  readonly hostname?: string;
  readonly port?: number;
  readonly databasePath?: string;
  readonly environment?: NodeJS.ProcessEnv;
};

export type SituHttpServer = {
  readonly hostname: string;
  readonly port: number;
  readonly url: string;
  readonly stop: () => Promise<void>;
};

const loopbackHostnames = new Set(["127.0.0.1", "localhost"]);

/**
 * Starts the local Situ HTTP server.
 */
export function startSituHttpServer(input: StartSituHttpServerInput = {}): SituHttpServer {
  const hostname = normalizeLoopbackHostname({ hostname: input.hostname });
  const port = normalizePort({ port: input.port });
  const server = Bun.serve({
    hostname,
    port,
    fetch: (request) =>
      handleSituHttpRequest({
        request,
        databasePath: input.databasePath,
        environment: input.environment,
      }),
  });
  const actualPort = server.port;

  if (actualPort === undefined) {
    void server.stop();

    throw new ValidationError({
      message: "Expected a TCP port.",
      details: { field: "port" },
    });
  }

  let stopPromise: Promise<void> | undefined;

  return {
    hostname,
    port: actualPort,
    url: `http://${hostname}:${actualPort}`,
    stop: () => {
      if (stopPromise === undefined) {
        stopPromise = server.stop();
      }

      return stopPromise;
    },
  };
}

function normalizeLoopbackHostname(input: { readonly hostname?: string }): string {
  const hostname = input.hostname?.trim() ?? defaultSituHttpServerHostname;

  if (loopbackHostnames.has(hostname)) {
    return hostname;
  }

  throw new ValidationError({
    message: "Expected a loopback host.",
    details: {
      field: "hostname",
      value: input.hostname,
      allowedValues: [...loopbackHostnames],
    },
  });
}

function normalizePort(input: { readonly port?: number }): number {
  const port = input.port ?? defaultSituHttpServerPort;

  if (Number.isInteger(port) && port >= 0 && port <= 65535) {
    return port;
  }

  throw new ValidationError({
    message: "Expected a port from 0 to 65535.",
    details: { field: "port", value: input.port },
  });
}
