import migration from "./migrations/001-initial.js";
import type { Entity } from "../protocol/models.js";
import { Fault } from "../protocol/models.js";
export interface Storage {
  query<T = Record<string, any>>(
    sql: string,
    ...args: (string | number | null)[]
  ): T[];
  transaction<T>(fn: () => T): T;
}
export class Database {
  constructor(public storage: Storage) {
    for (const statement of migration.split(";").filter((s) => s.trim()))
      storage.query(statement);
    const schema = this.meta("schema");
    if (schema && schema !== "1")
      throw new Error(`Unsupported database schema ${schema}`);
    storage.query("INSERT OR IGNORE INTO metadata VALUES (?,?)", "schema", "1");
    storage.query(
      "INSERT OR IGNORE INTO metadata VALUES (?,?)",
      "workspace",
      crypto.randomUUID(),
    );
  }
  meta(key: string) {
    return this.storage.query("SELECT value FROM metadata WHERE key=?", key)[0]
      ?.value as string | undefined;
  }
  get<T extends Entity = Entity>(id: string, kind?: string): T {
    const row = this.storage.query(
      "SELECT data FROM entities WHERE id=?",
      id,
    )[0];
    if (!row) throw new Fault("not_found", `No ${kind ?? "item"} ${id}`, 404);
    const entity = JSON.parse(row.data) as T;
    if (kind && entity.kind !== kind)
      throw new Fault("wrong_kind", `${id} is not a ${kind}`, 400);
    return entity;
  }
  list<T extends Entity = Entity>(project: string, kind: string): T[] {
    return this.storage
      .query(
        "SELECT data FROM entities WHERE project=? AND kind=? ORDER BY id",
        project,
        kind,
      )
      .map((row) => JSON.parse(row.data));
  }
  all(kind: string): Entity[] {
    return this.storage
      .query("SELECT data FROM entities WHERE kind=? ORDER BY id", kind)
      .map((row) => JSON.parse(row.data));
  }
  save(entity: Entity) {
    this.storage.query(
      "INSERT INTO entities VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      entity.id,
      entity.kind,
      entity.projectId,
      JSON.stringify(entity),
    );
  }
}
