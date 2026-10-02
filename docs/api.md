# Local API

The CLI and browser use the same API. `pnpm situ schema` prints the command schema from
`workspaces/core/src/model.ts`. This guide explains semantics and entry points.

## Commands

Send JSON to `POST /api/commands`. The response is the committed change with its journal cursor.
An identical retry returns the original receipt. Reusing an ID for different content returns 409.
The `actor` is caller-supplied attribution, not an authenticated identity.

Create a project:

```json
{
  "requestId": "project-example-1",
  "actor": "researcher",
  "type": "project.create",
  "project": { "id": "navigation", "title": "Navigation research" }
}
```

Create a lightweight experiment:

```json
{
  "requestId": "experiment-example-1",
  "actor": "researcher",
  "type": "record.create",
  "record": {
    "id": "longer-history",
    "projectId": "navigation",
    "kind": "experiment",
    "title": "Does longer observation history help?",
    "body": "Hold parameter count and data fixed; compare held-out navigation success.",
    "tags": ["memory"]
  }
}
```

Question, experiment, run, finding, and note share one record schema. `state` describes work: open, active, done,
or paused. `assessment` is free text, such as "inconclusive" or "needs replication". Neither determines the other.
Metadata values are JSON scalars; attach large data by reference.

Update only changed fields:

```json
{
  "requestId": "experiment-example-2",
  "actor": "researcher",
  "type": "record.update",
  "id": "longer-history",
  "revision": 1,
  "patch": { "state": "active" }
}
```

Omitted fields are preserved. Supplied arrays/metadata replace their previous value; read first when extending them.
A revision conflict requires reconciliation. Saved changes retain previous record contents. There is no destructive delete API.

## Links and evidence

Links look like `{ "target": "record-id", "relation": "derived_from", "revision": 1 }`.
Relations are related, derived_from, supports, and contradicts, stored from the record to its target.
On a finding, supports/contradicts classify the linked evidence relative to that finding's claim.
Links stay within a project. Only derived_from requires acyclic record ancestry; ordinary evidence links may form cycles.
The server pins an omitted derived_from revision to the target's current revision.
Read a saved input with `GET /api/records/:id?revision=N`. Unpinned related links follow current records.

Runs can record external job ID, source snapshot hash, command, seed, and input versions in metadata.
Situ does not start jobs, reserve budgets, or verify runner claims.
Artifacts have name, URI, optional SHA-256, and optional description. HTTP, HTTPS, and file URIs are allowed.
They are references, not managed uploads. Preserve and verify source bytes separately.

## Measurements

`samples.append` accepts up to 500 samples. Each has recordId, metric, cohort, step, finite value,
optional unit, and direction (higher, lower, neutral). The cohort identifies the exact evaluation conditions.
The batch is atomic. A series cannot change unit/direction; a recorded step cannot be overwritten.
Use another run or cohort for a new observation. Confidence intervals are not inferred from one run.

## Reads and live updates

| Endpoint                              | Result                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `GET /api/snapshot`                   | All projects/records and latest 5,000 samples; sampleCount exposes truncation |
| `GET /api/records/:id?revision=N`     | Current record or a saved revision                                            |
| `GET /api/changes?after=N&record=ID`  | Up to 100 changes; optional record filter                                     |
| `GET /api/samples?record=ID&after=N`  | Up to 1,000 samples after sample ID N                                         |
| `GET /api/context?project=ID&q=terms` | Matching records, direct connections, findings, active work                   |
| `GET /api/health`                     | Status, committed cursor, connected socket count                              |
| `GET /api/live`                       | WebSocket; messages announce the committed cursor                             |

Paginate changes using the last returned change cursor, not the global cursor, until fewer than 100 return.
Paginate samples from the last sample ID. Records are not paginated in this initial local version.

Record writes and the journal commit together. WebSocket messages are hints, not durable delivery.
Clients retry transient admission/network failures with bounded jittered delays and unchanged request IDs.
Read a snapshot, subscribe, and catch up from its cursor. Refresh a snapshot and catch up again after reconnecting.
Keep the existing view usable while refreshing. Revisions and journal entries are retained.

Context retrieval uses lexical matching plus one connection hop. It returns source excerpts and truncation information,
not generated consensus. Follow full records and counterevidence before acting.

Failures contain `{ "error": { "message": "...", "requestId": "..." } }`.
Statuses: 400 invalid JSON/cursor; 404 missing record; 409 conflict; 413 command size; 422 schema/link violation.
Server logs include request ID, route, status, and duration without research bodies.

## External execution records

A runner can use optional scalar metadata `attempt`, `stage`, `phase`, `outcome`, and `gate` to describe related
stages. The experiment detail groups these records into a flow. `outcome` describes execution (for example,
completed, failed, or interrupted); `gate` describes a scientific decision. Neither grants execution authority.
Keep human analysis in linked notes/findings so automated stage updates cannot replace it.
