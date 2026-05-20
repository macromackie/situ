import type { SerializedError } from "@situ/errors";
import type { SituHttpServer, StartSituHttpServerInput } from "../http/server.js";

export type SituCliOutputMode = "text" | "json";

export type RunSituCliInput = {
  readonly args: readonly string[];
  readonly version?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly cwd?: string;
};

export type MainSituCliInput = {
  readonly args?: readonly string[];
  readonly version?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly writeStdout?: (text: string) => void;
  readonly writeStderr?: (text: string) => void;
  readonly waitForShutdown?: (server: SituHttpServer) => Promise<void>;
  readonly startHttpServer?: (input?: StartSituHttpServerInput) => SituHttpServer;
};

export type SituCliResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type SituCliInvocation = {
  readonly command?: string;
  readonly rest: readonly string[];
  readonly outputMode: SituCliOutputMode;
  readonly databasePath?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly cwd: string;
  readonly version: string;
};

export type SituCliErrorOutput = {
  readonly error: SerializedError;
};

export const defaultSituVersion = "0.0.0-dev" as const;
