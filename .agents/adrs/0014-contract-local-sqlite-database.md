---
status: active
category: contract
created: 2026-05-13
---

# 0014. Contract: Local SQLite Database

## Context

Situ is a local stateful app. Durable state should live on the user's machine in
one obvious place, and app actions should be able to compose primitive package
repositories inside one transaction.

The database layer should stay small. It should not become a central product
model package or hide product behavior behind a workflow engine.

## Decision

Use SQLite as the app database and Bun's built-in `bun:sqlite` driver as the
database adapter.

`projects/app/src/db/` owns:

- state home resolution for database files
- opening SQLite databases
- enabling required SQLite pragmas
- composing primitive package schema fragments
- applying app-level migrations
- transaction helpers shared by app actions

Primitive packages own schema fragments for their records. The app database
layer imports those fragments and composes them. Primitive packages must not
open SQLite connections or own migration runners.

The database package exports these app-facing helpers:

```ts
export type ResolveStateHomeInput = {
  readonly environment?: NodeJS.ProcessEnv;
};

export type ResolveDatabasePathInput = {
  readonly environment?: NodeJS.ProcessEnv;
  readonly stateHomePath?: string;
  readonly databasePath?: string;
};

export type OpenAppDatabaseInput = {
  readonly databasePath?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly migrate?: boolean;
};

export function resolveStateHome(input?: ResolveStateHomeInput): string;

export function resolveDatabasePath(input?: ResolveDatabasePathInput): string;

export function openAppDatabase(input?: OpenAppDatabaseInput): Database;

export function migrateDatabase(input: { readonly database: Database }): void;

export function withTransaction<T>(input: {
  readonly database: Database;
  readonly run: (database: Database) => T;
}): T;
```

`Database` is the type exported by `bun:sqlite`.

## State Home And Database Path

The default state home is:

```text
${SITU_HOME}
```

when `SITU_HOME` is set, otherwise:

```text
${HOME}/.situ
```

The default database path is:

```text
<state-home>/situ.db
```

Database open helpers create the state home directory when opening a file-backed
database. Tests may use `:memory:` and should not touch the user's state home.

Path rules:

- empty `SITU_HOME` is treated as unset
- `SITU_HOME`, `HOME`, `stateHomePath`, and `databasePath` must be absolute
  paths when provided
- `~` is not expanded
- missing `HOME` without `SITU_HOME` is a validation error
- `databasePath: ":memory:"` opens an in-memory database
- SQLite URI memory paths are not special-cased in this contract
- custom file-backed `databasePath` values create their parent directory

Invalid path inputs throw `ValidationError`.

## SQLite Settings

Every opened database should enable:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
```

`journal_mode = WAL` may be skipped for `:memory:` databases because SQLite does
not support WAL for in-memory databases.

For file-backed databases, failure to enable WAL should throw. For in-memory
databases, the helper should enable `foreign_keys` and skip the WAL assertion.

## Schema Fragments

A schema fragment is a small structural object:

```ts
export type SchemaFragment = {
  readonly packageName: string;
  readonly statements: readonly string[];
};
```

Primitive package `schema.ts` files export one fragment. The fragment contains
the package's current table/index creation SQL. The package should keep schema
SQL close to the types and repository that use it.

Each `statements` entry should be one executable SQL statement. Do not put
semicolon-delimited batches in a single entry.

The app database layer exports `appSchemaFragments` in this order:

1. `projects`
2. `tasks`
3. `comments`
4. `events`
5. `notifications`
6. `experiments`
7. `measurements`
8. `artifacts`
9. `reports`
10. `reviews`

Fragment `packageName` values must be unique.

## Migrations

The app applies migrations centrally from `projects/app/src/db/`.

A migration is:

```ts
export type SchemaMigration = {
  readonly id: string;
  readonly statements: readonly string[];
};
```

The app keeps an internal `_situ_migrations` table with `id` and `applied_at`.

The table shape is:

```sql
CREATE TABLE IF NOT EXISTS _situ_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
```

`applied_at` uses the UTC ISO timestamp format from `@situ/common`.

Migrations are applied in array order. Each migration runs in its own
transaction. Applying migrations twice must be safe: already-applied migration
ids are skipped.

The migration runner does not store or validate SQL checksums. Migrations are
an install/apply mechanism for the current local schema, not a compatibility
promise for every intermediate experimental build.

If any statement in a migration fails, that migration rolls back and its id is
not recorded.

For the initial app, the first migration composes the current package schema
fragments. While Situ remains an experimental local app, primitive ADRs may
change schema fragments without preserving upgrade compatibility for databases
created by earlier experimental builds. If a later ADR introduces a stable
release compatibility promise, schema changes after that point should add
explicit app-level migrations instead of changing already-applied migration ids.

`openAppDatabase()` runs migrations by default. Callers may pass
`migrate: false` only in tests that need to inspect pre-migration behavior.

When an incompatible experimental schema change matters, prefer an explicit
state reset or export/import path over complex compatibility machinery.

## Transactions

Cross-primitive writes belong in app actions. App actions should use the db
transaction helper when a write touches more than one repository, emits events,
or creates notifications.

Primitive repositories should accept a database handle or transaction handle
from the caller. They should not create their own connection.

`withTransaction` is synchronous because `bun:sqlite` is synchronous. It returns
the callback return value. If the callback throws, SQLite rolls back and the
original error is re-thrown.

Nested transactions are not supported by the helper. App actions should keep one
transaction boundary at the outer action layer.

## Boundaries

Do not introduce an ORM, a remote database, a background migration service, or a
package-local migration runner unless a later ADR explicitly replaces this
contract.

Do not put product behavior in migrations. Migrations shape storage; app actions
own product rules.

## Consequences

The database layer is boring and inspectable. Agents can reason from package
schema fragments to the composed SQLite database without learning an additional
framework.

Later primitive ADRs can add real SQL statements and repositories package by
package while keeping the database install path stable.
