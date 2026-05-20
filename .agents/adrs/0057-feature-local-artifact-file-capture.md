---
status: active
category: feature
created: 2026-05-14
---

# 0057. Feature: Local Artifact File Capture

## Context

ADR 0022 defines artifacts as append-only evidence references. ADR 0035 adds
artifact actions and CLI commands, but `artifacts create` is intentionally
reference-only: it records a URI and optional caller-provided metadata without
reading, copying, hashing, or preserving the referenced file.

ADR 0012 says external content is not guaranteed to be preserved unless it is
copied into a Situ artifact or summary. The app now needs one explicit product
action for that: copy a local file into Situ-owned state and create an ordinary
artifact record that points at the captured copy.

The feature is still primitive-focused. Capturing a file is not command
execution, directory scanning, upload handling, artifact lifecycle management,
or workflow orchestration.

## Decision

Add a local artifact file capture action and CLI command.

Expected files:

```text
projects/app/src/artifacts/files.ts
projects/app/src/artifacts/files.test.ts
projects/app/src/artifacts/index.ts
projects/app/src/index.ts
projects/app/src/actions/artifacts.ts
projects/app/src/actions/artifacts.test.ts
projects/app/src/actions/index.ts
projects/app/src/cli/commands/artifacts.ts
projects/app/src/cli/situ.test.ts
```

`artifacts create` remains the reference-only command from ADR 0035.

`artifacts capture` is the explicit file-preserving command.

## Storage Shape

Captured files are copied under the Situ state home:

```text
<state-home>/projects/<project-id>/artifacts/<artifact-id>/<source-basename>
```

The default state home remains the ADR 0012 path:

```text
$SITU_HOME
```

or, when `SITU_HOME` is unset:

```text
$HOME/.situ
```

The captured artifact record stores a `file://` URI for the copied file.
Construct this URI with Node's `pathToFileURL(destinationPath).href`; do not
build it with string concatenation.

Example:

```text
source: /tmp/run-output/score.json
state:  /Users/scott/.situ/projects/project_123/artifacts/artifact_456/score.json
uri:    file:///Users/scott/.situ/projects/project_123/artifacts/artifact_456/score.json
```

The app computes `byteSize` and `sha256` from the captured file. Callers do not
provide those fields for capture.

## File Helper API

`projects/app/src/artifacts/files.ts` exports:

```ts
export type CaptureLocalArtifactFileInput = {
  readonly stateHomePath: string;
  readonly projectId: SituId<"project">;
  readonly artifactId: SituId<"artifact">;
  readonly sourcePath: string;
};

export type CapturedLocalArtifactFile = {
  readonly artifactDirectoryPath: string;
  readonly destinationPath: string;
  readonly uri: string;
  readonly byteSize: number;
  readonly sha256: string;
};

export function captureLocalArtifactFile(
  input: CaptureLocalArtifactFileInput,
): CapturedLocalArtifactFile;
```

The helper is synchronous so existing CLI and action code can stay synchronous.

`stateHomePath` must be absolute.

`sourcePath` must be absolute. The helper resolves the source path before
reading it. The source must exist and be a regular file. Source symlinks may be
followed because the caller explicitly selected the source path.

The destination basename comes from the caller-provided `sourcePath` after path
normalization, not from the symlink target's real path. For example, capturing
`/tmp/link.json` should create a destination ending in `link.json` even when
the link points at `/private/real/score.json`.

`projectId` and `artifactId` are used as storage path segments. They must be
non-empty safe segments containing only letters, numbers, `_`, and `-`. This
matches generated Situ ids and prevents caller-cast ids from shaping arbitrary
directories.

The helper creates parent directories explicitly. It creates the artifact
directory as a new directory and does not overwrite existing captured files.

If storage for the artifact id already exists, throw `ConflictError` with:

```text
Artifact storage already exists.
```

For invalid filesystem inputs, throw `ValidationError`:

- non-absolute state home: `Expected an absolute state home path.`
- non-absolute source path: `Expected an absolute source path.`
- missing source: `Source file was not found.`
- non-file source: `Expected source path to be a file.`
- file size outside JavaScript safe-integer range:
  `Expected captured file size to be a safe integer.`
- unsafe project or artifact storage segment:
  `Expected a safe artifact storage path segment.`

The helper computes SHA-256 by reading the copied file in bounded chunks. It
does not load the whole file into memory.

The helper computes `byteSize` from the copied file. It must reject sizes that
are not non-negative JavaScript safe integers before returning.

If copying or hashing fails after the artifact directory is created, the helper
removes that artifact directory before rethrowing.

`artifactDirectoryPath` is the directory that should be removed when callers
need to clean up the captured file after a later product write fails.

`projects/app/src/artifacts/index.ts` exports the file helper API, and
`projects/app/src/index.ts` exports `./artifacts/index.js` so app callers can
use the same public surface as other app feature areas.

## Action API

`projects/app/src/actions/artifacts.ts` exports:

```ts
export type CaptureArtifactFileActionInput = {
  readonly context: AppActionContext;
  readonly stateHomePath: string;
  readonly projectId: SituId<"project">;
  readonly id?: SituId<"artifact">;
  readonly target: TargetRef;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly sourcePath: string;
  readonly mediaType?: string;
  readonly createdBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export type CaptureArtifactFileActionResult = {
  readonly artifact: ArtifactRecord;
};

export function captureArtifactFileAction(
  input: CaptureArtifactFileActionInput,
): CaptureArtifactFileActionResult;
```

The action generates an artifact id with `createId({ prefix: "artifact" })`
when `id` is not provided.

Before copying the file, the action verifies the project exists:

```ts
context.repositories.projects.getById({ id: projectId });
```

When the project does not exist, throw `NotFoundError` with:

```text
Project was not found.
```

and details:

```ts
{
  id: projectId;
}
```

If `target.targetKind` is `"project"`, `target.targetId` must equal
`projectId`. Otherwise throw `ValidationError` with:

```text
Artifact project target must match projectId.
```

For non-project targets, this ADR does not check target existence or project
membership. The capture action stores under `projectId` and preserves the
caller-provided target ref. Cross-target ownership checks would require
target-specific product rules and belong in later composite actions.

The action then calls `captureLocalArtifactFile`, and creates an ordinary
artifact record through `context.repositories.artifacts.create`.

The repository create call uses:

- `id`: generated or caller-provided artifact id
- `target`: caller-provided target
- `title`: caller-provided title
- `summaryMarkdown`: caller-provided summary
- `uri`: captured file `file://` URI
- `mediaType`: caller-provided media type, when present
- `byteSize`: computed captured file byte size
- `sha256`: computed captured file SHA-256 digest
- `createdBy`: caller-provided actor
- `now`: caller-provided timestamp, when present

The action returns:

```ts
{
  artifact;
}
```

If artifact record creation fails after the file was copied, the action removes
`captured.artifactDirectoryPath` before rethrowing the original error. Cleanup
is best effort; the original error should remain the one callers see.

The action does not emit events or notifications. If a workflow needs timeline
context around captured evidence, an actor can create an event or comment as a
separate visible product action.

## CLI Command

Add:

```text
situ artifacts capture [flags]
```

Global options still appear before the command group:

```text
situ --json --db /tmp/situ.db artifacts capture --project-id project_123 ...
```

Flags:

```text
--project-id <project-id>
--id <artifact-id>
--target-kind <project|task|comment|event|notification|baseline|experiment|measurement|artifact|review|report>
--target-id <target-id>
--source-path <absolute-file-path>
--title <title>
--summary <markdown>
--media-type <media-type>
--actor-kind <human|local_agent|system>
--actor-id <id>
--actor-display-name <name>
--now <iso-timestamp>
```

Required flags:

- `--project-id`
- `--target-kind`
- `--target-id`
- `--source-path`
- `--title`
- `--summary`
- `--actor-kind`
- `--actor-id`

Optional flags:

- `--id`
- `--media-type`
- `--actor-display-name`
- `--now`

`--source-path` must be an absolute path. This is parser validation and happens
before opening the database.

The CLI resolves `stateHomePath` with:

```ts
resolveStateHome({ environment: invocation.environment });
```

and passes the resolved value to `captureArtifactFileAction`.

The CLI does not accept `--uri`, `--byte-size`, or `--sha256` for
`artifacts capture`. Those values are derived by the app.

Command-local help follows ADR 0092. For example,
`situ artifacts capture --help` prints usage without opening the database.

Duplicate scalar flags are allowed; the last value wins.

The parser uses the same command-local scanning rules as existing artifact
commands:

- supported value flags consume the next token when it exists and does not
  start with `--`
- value flags followed by tokens beginning with `--` report
  `Missing value for <flag>.`
- single-dash tokens may be consumed as values
- boolean flags, short flags, equals syntax, and `--` sentinel are unsupported

Parser errors use the existing CLI parser helper and message style:

- missing required flag: `Missing required flag <flag>.`
- unknown flag: `Unknown flag for artifacts capture: <flag>.`
- missing flag value: `Missing value for <flag>.`
- extra positional args:
  `Command artifacts capture received extra positional arguments: <args>`
- invalid actor kind: `Invalid actor kind for <flag>: <value>.`
- invalid target kind: `Invalid target kind: <value>.`
- relative source path: `Expected an absolute source path.`

Required presence checks happen before semantic parsing. For example,
`artifacts capture` with invalid `--target-kind` and missing `--actor-id`
reports the missing `--actor-id` first.

Required flags are checked in the listed Required flags order. After all
required flags are present, semantic parsing runs in this order:

1. `--source-path` absolute-path validation
2. `--target-kind`
3. `--actor-kind`

## Output Shape

JSON output:

```json
{"artifact":<artifact>}
```

Text output:

```text
Captured artifact <artifact-id>
```

Each non-empty output has a trailing newline.

The returned artifact contains the captured `file://` URI plus computed
`byteSize` and `sha256`.

## Database And Filesystem Order

`artifacts capture` validates command syntax before opening the database.

After syntax validation:

1. resolve state home
2. open the database
3. create an app action context
4. verify the project exists
5. copy and hash the file
6. create the artifact record
7. close the database in `finally`

The database must close for action success, not-found errors, filesystem
validation errors, repository validation errors, and duplicate-artifact errors.

If the database write fails after copying the file, artifact storage cleanup is
best effort.

## Tests

Add file helper tests covering:

- copying a source file to project artifact storage
- generated destination path and `file://` URI
- computed byte size
- computed SHA-256
- source basename preservation
- URL escaping for filenames containing spaces or `#`
- rejection of relative state home, relative source path, missing source,
  directory source, unsafe project id segment, unsafe artifact id segment, and
  existing artifact storage
- rejection of unsafe copied file sizes when feasible without creating huge
  test files
- cleanup after copy/hash failure when feasible without brittle platform
  behavior

Add action tests covering:

- capturing a file through the app action creates a normal artifact record with
  computed URI, byte size, and SHA-256
- generated ids are accepted
- missing project throws `NotFoundError` before copying
- mismatched project target throws `ValidationError` before copying
- duplicate artifact record failures clean up copied storage
- no events or notifications are created

Add CLI tests covering:

- `artifacts capture` text output
- `artifacts capture` JSON output includes computed artifact fields
- the copied file exists under the state home
- parser validation before opening the database for missing required flags,
  unknown flags, missing flag values, extra positionals, invalid actor kind,
  invalid target kind, and relative source path
- accepted single-dash value token for text fields
- duplicate scalar flags using the last value
- database closure after missing project and after-open validation failures

The root gates must continue to pass:

```text
mise run check
mise run coverage
git diff --check
```

## Boundaries

Do not change the `@situ/artifacts` primitive package. Artifacts remain
append-only reference records.

Do not change `artifacts create`; it remains reference-only.

Do not add directory capture, recursive scanning, file deletion commands, file
serving, upload endpoints, artifact previews, artifact statuses, retention
policy, deduplication, compression, encryption, or garbage collection.

Do not add command execution, shell capture, benchmark runners, report
generation, review state changes, experiment state changes, task state changes,
notification delivery, scheduler behavior, agent runtime behavior, workers,
leases, provider sessions, or workflow enforcement.

Do not add Replicache file upload behavior in this ADR. A client may still
create artifact records with a `file://` URI through existing push mutators,
but byte transfer is local CLI/app behavior only.

Do not scan file contents for secrets. Capturing a file is an explicit product
action; callers are responsible for deciding that the selected file should be
preserved. Future ADRs may add redaction helpers if needed.

## Consequences

Local agents and humans can now preserve evidence intentionally:

```text
run a local command or tool
  -> write output to a local file
  -> situ artifacts capture ...
  -> ordinary ArtifactRecord points at a copied file in Situ state
  -> comments, reviews, measurements, reports, or events explain why it matters
```

Situ gains durable evidence capture without becoming a file manager or hidden
workflow engine.
