---
status: active
category: feature
created: 2026-05-14
---

# 0056. Feature: Local HTTP Server and Serve CLI

## Context

ADR 0042 defines a local HTTP request handler for health checks and Replicache
push/pull. That handler is directly testable, but it is not yet exposed as a
long-running local app process.

Situ should be usable as a local stateful app:

```text
start Situ locally
  -> local agents and tools call the same HTTP surface
  -> product records stay in the local SQLite database
```

The local server is infrastructure. It must not introduce workflow state,
workers, scheduler loops, provider sessions, or agent orchestration. It only
binds the existing HTTP handler to a local network socket.

## Decision

Add a small local HTTP server module over the existing request handler.

Expected files:

```text
projects/app/src/http/handler.ts
projects/app/src/http/index.ts
projects/app/src/http/server.ts
projects/app/src/http/server.test.ts
projects/app/src/cli/commands/serve.ts
projects/app/src/cli/base.ts
projects/app/src/cli/situ.test.ts
projects/app/src/cli/types.ts
```

The server uses Bun's built-in HTTP server API. Do not add a web framework.
`projects/app/src/http/index.ts` is a small barrel that exports the request
handler and server modules.

## Server API

`projects/app/src/http/server.ts` exports:

```ts
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

export function startSituHttpServer(input?: StartSituHttpServerInput): SituHttpServer;
```

Defaults:

- `hostname`: `127.0.0.1`
- `port`: `7373`

Port validation:

- `port` must be an integer from `0` through `65535`
- `0` is allowed and asks the operating system to pick an available port

Host validation:

- `hostname`, when provided, must be a non-empty string after trimming
- the stored hostname uses the trimmed value
- this ADR only allows loopback hostnames: `127.0.0.1` and `localhost`
- values such as `0.0.0.0`, LAN addresses, and public hostnames are rejected

`startSituHttpServer` calls `Bun.serve` with a `fetch` function that delegates
every request to:

```ts
handleSituHttpRequest({
  request,
  databasePath,
  environment,
});
```

The server module does not open the database at startup. Existing route
handlers continue to decide when to open the database.

`url` is:

```text
http://<hostname>:<actual-port>
```

When `port: 0` is used, `actual-port` is the port assigned by Bun after the
server starts.

`stop()` stops the Bun server and resolves after Bun finishes stopping it. It is
idempotent from the caller's perspective: calling it more than once must not
throw, and concurrent calls should share the same underlying stop operation.

## CLI Command

Add a long-running command:

```text
situ serve [flags]
```

Global options still appear before the command group:

```text
situ --db /tmp/situ.db serve --port 7373
situ --json serve --host 127.0.0.1 --port 0
```

Flags:

```text
--host <hostname>
--port <0-65535>
```

Optional flags:

- `--host`
- `--port`

Command-local help follows ADR 0092. For example,
`situ serve --help` prints usage without starting the server.

Duplicate scalar flags are allowed; the last value wins.

The parser does not support boolean flags, short flags, equals syntax, or a
`--` sentinel for `serve`.

Parser validation for `serve` must complete before starting the server. This
includes:

- extra positional args
- unknown flags
- missing flag values
- empty host values
- invalid ports

For flag values, a token beginning with `--` is a missing value. A token
beginning with a single `-` may be consumed as a value and then validated by the
field parser.

Port parsing uses decimal digit strings only:

- accepted examples: `0`, `1`, `7373`, `65535`, `00080`
- rejected examples: `-1`, `+1`, `1.5`, `1e2`, `65536`, `abc`

After the decimal digit string is converted to a number, it must be a safe
integer between `0` and `65535`.

Parser errors use `ValidationError` through the CLI parser error helper, with
the existing command-local message style:

- unknown flag: `Unknown flag for serve: <flag>.`
- missing flag value: `Missing value for <flag>.`
- extra positional args:
  `Command serve received extra positional arguments: <args>`
- empty or non-loopback host: `Expected a loopback host.`
- invalid port: `Expected a port from 0 to 65535.`

`base.ts` adds `serve` to help text:

```text
  serve     Start the local Situ HTTP server.
```

## Main CLI Behavior

`runSituCli` remains the synchronous, finite command runner for testable data
commands. It does not start long-running servers. When `runSituCli` receives
`serve`, it validates command args and returns a parser error:

```text
Command serve must be run through mainSituCli.
```

`projects/app/src/cli/commands/serve.ts` contains parser and main-command
helpers for `serve`; it is not a finite data command runner.

`mainSituCli` owns the long-running `serve` path:

1. parse global options and the command invocation using the same parser
   behavior as `runSituCli`
2. if the command is not `serve`, run the existing finite command path
3. if the command is `serve`, validate serve flags, start the server, print the
   ready message, then wait for process shutdown

For `serve`, `mainSituCli` resolves the database path once before starting the
server. If resolution throws, the server is not started. The resolved path is
passed to `startSituHttpServer` and printed in JSON ready output.

Text ready output:

```text
situ serving http://127.0.0.1:7373
```

JSON ready output:

```json
{
  "url": "http://127.0.0.1:7373",
  "hostname": "127.0.0.1",
  "port": 7373,
  "databasePath": "/absolute/path/to/situ.db"
}
```

Each output has a trailing newline.

`databasePath` in JSON output is the resolved path that was passed to the
server. Resolving the path must not open the database.

`serve` exits with code `0` after graceful shutdown. It should stop the server
on `SIGINT` and `SIGTERM`, and `mainSituCli` awaits `stop()` in a `finally`
block before returning.

`MainSituCliInput` may gain narrow optional test hooks for serve:

```ts
readonly writeStdout?: (text: string) => void;
readonly writeStderr?: (text: string) => void;
readonly waitForShutdown?: (server: SituHttpServer) => Promise<void>;
readonly startHttpServer?: typeof startSituHttpServer;
```

Production defaults use `process.stdout.write`, `process.stderr.write`,
`startSituHttpServer`, and a signal-based shutdown wait. These hooks exist only
to test `mainSituCli` without leaving a live server running.

## Boundaries

Do not add new HTTP routes in this ADR.

Do not change the request/response contract of `/health`, `/replicache/push`,
or `/replicache/pull`.

Do not open the database at server startup.

Do not add background polling, scheduler loops, leases, heartbeats, provider
sessions, model threads, worker processes, or subagent orchestration.

Do not add auth or remote exposure in this ADR. The server only allows
loopback binding; remote binding and authorization need separate decisions.

Do not add a frontend UI.

## Tests

Implementation should include focused tests for:

- `startSituHttpServer({ port: 0 })` serves `GET /health`
- push and pull work through the live server using the existing HTTP routes
- `stop()` is safe to call more than once
- invalid server host and port values throw `ValidationError`
- starting the server and hitting `/health` with a nested database path does
  not create the database directory or database file
- `serve` appears in root help
- `runSituCli({ args: ["serve"] })` returns the finite-runner parser error and
  does not start the server
- `mainSituCli({ args: ["serve", "--port", "0"], ...hooks })` can start
  through injected test hooks, prints the text ready message, waits for
  injected shutdown, stops cleanly, and returns exit code `0`
- `mainSituCli({ args: ["--json", "serve", "--port", "0"], ...hooks })` prints
  the JSON ready message with `url`, `hostname`, `port`, and resolved
  `databasePath`
- `serve` parser validation catches unknown flags, missing values, extra
  positionals, empty or non-loopback host values, and invalid ports before
  starting the server

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Consequences

Situ can now run as a local app process while keeping the core product model
unchanged:

```text
situ serve
  -> health check
  -> Replicache push
  -> Replicache pull
  -> SQLite records
```

The server is just a thin local adapter around the existing HTTP request
handler. Product behavior still lives in primitives, app actions, reports,
maintenance, and sync modules.
