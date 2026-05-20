---
status: active
category: contract
created: 2026-05-14
---

# 0087. Contract: Final CLI Type Surface

## Context

ADR 0029 split the CLI into small modules and defined the initial public type
surface. Later ADRs intentionally extended that surface:

- ADR 0056 added `serve` and narrow `mainSituCli` test hooks.
- ADR 0058 added `cwd` to finite and main CLI inputs and to parsed
  invocations.

The final public type contract should be stated in one place so a fresh
implementation does not treat ADR 0029's earlier type snippet as the complete
target surface.

## Decision

`projects/app/src/cli/types.ts` owns shared CLI types and constants.

It may import:

- `type SerializedError` from `@situ/errors`
- `type SituHttpServer` and `type StartSituHttpServerInput` from the local HTTP
  server module, only to type the optional `serve` test hooks

It must not import app actions, database helpers, primitive packages, command
modules, `base.ts`, `situ.ts`, or `index.ts`.

The final public CLI type surface is:

```ts
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
```

`cwd` on `RunSituCliInput` and `MainSituCliInput` is optional. Parsed
`SituCliInvocation.cwd` is always absolute after global parsing.

The `serve` hooks on `MainSituCliInput` are optional and exist to test the
long-running command without leaving a live server running. Production defaults
come from normal process IO, the local server module, and signal-based shutdown
waiting.

## ADR Alignment

ADR 0029 should describe this final type surface and allowed type-only imports.
It should not state that `types.ts` imports `SerializedError` only, and it
should not omit `cwd` or the `serve` hooks from public input types.

ADR 0056 remains the behavioral contract for `serve`. ADR 0058 remains the
behavioral contract for `cwd` and current-repository detection.

## Verification

Typechecking must prove these public types compile through the app root and CLI
entrypoints. Tests should continue proving:

- `runSituCli` is exported from both `./situ.js` and `./index.js`
- `mainSituCli` passes `cwd` through to finite commands
- `mainSituCli` uses injected `serve` hooks for long-running server tests

## Consequences

The CLI module split stays simple, while the final type surface reflects the
current app behavior instead of an earlier intermediate CLI shape.
