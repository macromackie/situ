---
status: active
category: contract
created: 2026-05-22
---

# 0108. Contract: Replicache Global Version Sync

## Context

ADR 0100 made Replicache the local browser read model for `situ serve`. The
initial backend used a reset-style patch and a fingerprint cookie: every pull
could send a `clear` followed by every current record whenever the fingerprint
changed.

That is simple, but it does not match the expected shape for a durable
Replicache backend. Situ needs a monotonic sync contract that can return only
records changed since the browser's last pull and can acknowledge client
mutation IDs without forcing a full reset. The browser schema is also advanced
to a new durable cache identity so existing reset-cookie caches do not share
state with the new contract.

## Decision

Situ uses a Replicache global-version sync strategy.

The server stores one global sync version and advances it whenever a Replicache
visible record or a client mutation acknowledgement changes. The pull cookie is
the numeric global version returned by the server. A pull with cookie `N`
returns changes whose sync version is greater than `N`.

The browser Replicache schema version is:

```text
situ-v2
```

The browser Replicache local database name is also:

```text
situ-v2
```

## Data Model

The app database owns these sync metadata tables:

```sql
CREATE TABLE replicache_space (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  version INTEGER NOT NULL CHECK (version >= 0)
);

CREATE TABLE replicache_entities (
  key TEXT PRIMARY KEY,
  version INTEGER NOT NULL CHECK (version >= 0),
  deleted INTEGER NOT NULL CHECK (deleted IN (0, 1))
);
```

`replicache_client_mutations` stores the version at which each client mutation
acknowledgement last changed:

```sql
last_modified_version INTEGER NOT NULL CHECK (last_modified_version >= 0)
```

`replicache_entities.key` is the browser Replicache key, such as
`projects/<id>` or `tasks/<id>`. Inserts and updates mark the key as present.
Deletes mark the key as deleted. Product tables are not required to carry sync
metadata columns directly; sync metadata may be maintained by database triggers
or an equivalent centralized app-database mechanism.

## Entity Keys

The Replicache-visible entity key prefixes are:

```text
projects/
tasks/
baselines/
experiments/
measurements/
reviews/
artifacts/
reports/
briefings/
live-signals/
live-map-nodes/
live-map-edges/
live-focuses/
live-node-details/
comments/
events/
notifications/
```

## Pull Contract

`POST /replicache/pull` accepts the Replicache pull request shape from ADR 0100.

If `cookie` is a non-negative safe integer, the server treats it as the
previous global sync version. Any other cookie value is treated as an unknown
legacy cookie and causes a reset pull using previous version `0`. A numeric
cookie greater than the current server version is also treated as unknown and
causes a reset pull because the local database may have been replaced.

The pull response has:

```ts
{
  cookie: number;
  lastMutationIDChanges: Record<string, number>;
  patch: ReplicachePatchOperation[];
}
```

For an absent, unknown, or future cookie that causes a reset pull, `patch`
begins with:

```ts
{
  op: "clear";
}
```

The reset pull then includes `put` operations for all current non-deleted
Replicache-visible records. A known numeric cookie of `0` is a normal
incremental cookie and does not require `clear`; this avoids repeated clear
patches on an empty database whose current version is still `0`.

For an incremental pull from a known version greater than `0`, `patch` includes
only changed records:

```ts
{
  op: "put";
  key: string;
  value: JsonValue;
}
{
  op: "del";
  key: string;
}
```

Deleted records use `op: "del"`. Present records use `op: "put"` with the same
JSON values used by the reset pull.

If no records or mutation acknowledgements changed since the incoming cookie,
the response returns the current numeric cookie, an empty
`lastMutationIDChanges` object, and an empty patch.

`lastMutationIDChanges` includes only clients in the requested
`clientGroupID` whose acknowledgement version is greater than the incoming
cookie, except that reset pulls from version `0` include all known clients in
the requested group.

## Push Contract

`POST /replicache/push` continues to process supported mutations in mutation ID
order. When a mutation is accepted, the corresponding client row's
`lastMutationID` is updated and `last_modified_version` is advanced.

Successful mutations that change product records also advance the global
version for the changed entity keys. Permanent mutation errors still advance
the client row so the browser can observe the acknowledgement and stop
re-sending the rejected mutation.

## Boundaries

This ADR does not add websocket or server-sent-event pokes, shared browser
mutators, auth filters, hosted sync services, multi-user spaces, row-version
sync, per-space sync, batching APIs, or background workers.

## Tests

Expected evidence:

- ADR validation passes.
- Database migration tests cover sync metadata tables, product row insert,
  update, and delete version tracking, and client mutation acknowledgement
  version tracking.
- Pull tests cover reset pulls, legacy cookie reset behavior, repeated cookie
  no-op behavior, incremental puts, incremental deletes, and incremental
  `lastMutationIDChanges`.
- Push tests cover that accepted and permanently rejected mutations advance
  pull-visible client mutation acknowledgements.
- The browser client initializes Replicache with schema version `situ-v2`.
- `mise run check` and `mise run coverage` pass before the slice is considered
  complete.

## Consequences

Pull patch size becomes proportional to changed keys instead of total database
size. The global version remains intentionally simple and local-first friendly,
but it serializes all Replicache-visible writes through one monotonic version.
If Situ later needs independent read authorization or higher write concurrency,
row-version or per-space sync can replace this contract in a future ADR.
