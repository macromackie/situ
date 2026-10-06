# Operations

## State and credentials

`SITU_HOME` defaults to `~/.local/share/situ-v2`. It contains:

```text
runtime/
  worker.js, public/, wrangler.json     deployed build
  .celld/dev/                          celld durable state
  keys.json, .dev.vars                  private bootstrap and join credentials
  admin.json, join.json                 endpoint and workspace bindings
  process.json, serve.lock/             owned service process
client/WORKSPACE/
  sessions/                            per-agent credentials and join recovery
  pending-writes/                      original intents, errors and receipts
runs/JOB/
  source/, source.json                  captured source and hash manifest
  receipt.json, reporter.json           Situ runner state and reporting credential
  lab/                                 Lab execution receipt, locks and logs
```

Private files are created with mode 0600 and runtime directories with 0700. Do not commit or publish them. Agent roles are useful local guardrails, not a sandbox against another process running as the same OS user. The observer can read on loopback. Remote hosts and cross-origin requests are rejected.

`SITU_SESSION` selects a specific file; there is no global mutable “current agent.” `SITU_URL` must match the session endpoint if specified. A replacement database has a different workspace ID and rejects prepared writes from the old one.

## Interrupted delivery

Every write is saved before sending. On a timeout, run `situ retry COMMAND_ID` with the original session. The server returns the committed receipt or applies the original write once. Do not invent a new ID to resolve an uncertain outcome. A genuine revision conflict requires rereading and intentionally preparing a new command.

A failed join prints a session file and `situ join-resume FILE`; this reuses its credential and original command ID. It does not create a second agent. Keep delivered intents for recovery and audit.

GET `/v1/commands/ID` reads a receipt for its caller. GET `/v1/schema` describes every command input. All mutations use POST `/v1/commands` with `{id, workspaceId, type, input}` and bearer credentials. Lists return `items`, `total` and `nextCursor`; event catch-up uses monotonic `after` and `hasMore`. Follow continuation before claiming to have read everything. Event cursors are per workspace and should be saved with that workspace ID.

## Agent or runner loss

1. Read the work, its last prediction/checkpoint, next step, blockers and jobs.
2. Inspect `situ run-status DIRECTORY`. If the Lab process is active, let it finish or use an explicitly authorized stop. Do not equate an expired agent lease with a dead job.
3. `situ run-recover DIRECTORY` checks Lab's ownership locks and reconciles an abandoned execution without relaunching. It sends retained evidence to Situ. An uncertain job stays unknown and blocks another launch.
4. The coordinator can use `session.replace` with old/new session IDs and a reason. It requires the old session to have left or stopped reporting. Outstanding inbox items, subscriptions and roles transfer. Work claims do not silently transfer.
5. The successor starts the ready/expired work with a new generation, including when an existing runner is still healthy. Taking ownership does not launch another job. Record a recovery checkpoint before the next run if an old check-in is outstanding.

The coordinator can use `job.reconcile` with concrete evidence when the normal runner adapter cannot recover. It rejects a runner that has reported in the last two minutes. The service cannot verify arbitrary claims about an OS process; inspect Lab locks and receipts first.

A SIGKILL can leave the runner, Lab process or service lock alive. Never remove locks solely because a timestamp is old. Inspect `runtime/process.json`, process command/start signature and listening ports. `situ stop` only signals a launcher whose recorded identity still matches. A stale lock is deliberately an explicit repair rather than an automatic destructive reset.

## Back up and restore

Stop the service and save the whole home, including pending writes and run evidence:

```sh
situ stop
situ backup /absolute/path/to/situ-backup
situ serve
```

Snapshots include a SHA-256 inventory. Restore checks the full inventory and requires a new target directory:

```sh
situ restore /absolute/path/to/situ-backup --cwd /absolute/path/to/restored-situ
SITU_HOME=/absolute/path/to/restored-situ situ serve
```

Artifact URIs retain their original absolute locations after restore. Restore those locations or use the copied run directory to inspect the retained files; moving a snapshot does not rewrite evidence claims.

Preserve the Worker name, Workspace class and local `.celld/dev` directory. A config rename is not a database migration. Schema version mismatch fails closed. Never pass celld `--clean` on a workspace you want to keep.

## Lab setup

Use a checked-out Lab with its locked environment installed. Set `SITU_LAB=/path/to/macromackie-lab` or pass `--lab`. The adapter calls `uv run --locked --project LAB lab exec`, using Lab's shared admission configuration. Do not set an isolated admission directory for ordinary parallel research.

Source capture includes tracked and unignored Git files. For a non-Git source, it excludes build/environment directories. It rejects symlinks and captures above 256 MiB. Keep datasets and checkpoint inputs outside the source tree and identify them in the plan/evidence. Commands run in the captured tree but are not sandboxed: avoid absolute paths that modify another agent's checkout. A stopped heartbeat never kills an otherwise healthy experiment. `--timeout` is a deliberate resource budget for that individual launch.

The old Lab reporter sends `/api/commands` record mutations; the new service returns an explicit 410 for that API. Existing pending writes remain in the archived workspace. New external executions use the new adapter. Native task jobs can execute with offline reporting and retain their native receipts; automatic translation of old metric records is intentionally absent.

## Verification and cutover

`mise run check` covers types, workflow/recovery invariants, builds, real celld persistence and snapshot restore. Add SITU_LAB for a captured Lab execution and supervised session-exit check. Browser review covers desktop and narrow observer pages separately.

The prior product, Factory and stopped data snapshot are in `~/situ-old-reference` on the machine where this rewrite was performed. That archive includes the old installed CLI and a hash manifest. It is reference material, not an input to a fresh research campaign. No Lab artifacts were purged.
