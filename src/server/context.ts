import { Database } from "./database.js";
import {
  requireThat,
  type Entity,
  type Project,
  type Session,
  type Work,
} from "../protocol/models.js";
export class Context {
  constructor(
    public db: Database,
    public actor: Session | "admin",
    public now: number,
  ) {}
  get actorId() {
    return this.actor === "admin" ? "admin" : this.actor.id;
  }
  scope(project: string) {
    requireThat(
      this.actor === "admin" || this.actor.projectId === project,
      "forbidden",
      "This session belongs to another project",
      403,
    );
  }
  role(...roles: string[]) {
    const actor = this.actor;
    requireThat(
      actor === "admin" || roles.some((role) => actor.roles.includes(role)),
      "forbidden",
      `Requires ${roles.join(" or ")}`,
      403,
    );
  }
  session() {
    requireThat(
      this.actor !== "admin",
      "session_required",
      "Join as a named agent first",
      400,
    );
    return this.actor;
  }
  entity<T extends Entity = Entity>(id: string, kind?: string): T {
    const e = this.db.get<T>(id, kind);
    this.scope(e.projectId);
    return e;
  }
  project(id: string) {
    return this.entity<Project>(id, "project");
  }
  revision(e: Entity, expected: number) {
    requireThat(
      e.revision === expected,
      "revision_conflict",
      `Expected revision ${expected}; current revision is ${e.revision}`,
    );
  }
  create(
    kind: string,
    projectId: string,
    fields: Record<string, any>,
    fixedId?: string,
  ): Entity {
    const entity = {
      ...fields,
      id: fixedId ?? `${kind[0]}-${crypto.randomUUID()}`,
      kind,
      projectId,
      revision: 1,
      createdAt: this.now,
      updatedAt: this.now,
      author: this.actorId,
    };
    requireThat(
      !this.db.storage.query("SELECT id FROM entities WHERE id=?", entity.id)
        .length,
      "already_exists",
      `ID ${entity.id} already exists`,
    );
    this.db.save(entity);
    return entity;
  }
  update<T extends Entity>(e: T, patch: Record<string, any>): T {
    const next = {
      ...e,
      ...patch,
      revision: e.revision + 1,
      updatedAt: this.now,
    };
    this.db.save(next);
    return next;
  }
  held(id: string, generation: number): Work {
    const w = this.entity<Work>(id, "work");
    requireThat(
      w.state === "active" &&
        w.owner === this.actorId &&
        w.generation === generation &&
        w.leaseUntil > this.now,
      "claim_lost",
      "Work claim expired or belongs to another session; inspect and explicitly take over",
    );
    return w;
  }
  notify(
    recipient: string,
    project: string,
    kind: string,
    entityId: string,
    subject: string,
    data: Record<string, any> = {},
    stableId?: string,
  ) {
    const id = stableId ?? `i-${crypto.randomUUID()}`;
    this.db.storage.query(
      "INSERT OR IGNORE INTO inbox(id,recipient,project,kind,subject,entity_id,state,due,data) VALUES(?,?,?,?,?,?,'open',?,?)",
      id,
      recipient,
      project,
      kind,
      subject,
      entityId,
      this.now,
      JSON.stringify(data),
    );
    return id;
  }
  broadcast(
    project: string,
    roles: string[],
    kind: string,
    entityId: string,
    subject: string,
    data: Record<string, any> = {},
    occurrence?: string,
  ) {
    for (const s of this.db
      .list<Session>(project, "session")
      .filter(
        (s) =>
          !s.left &&
          s.id !== this.actorId &&
          s.roles.some((r) => roles.includes(r)),
      )) {
      this.notify(
        s.id,
        project,
        kind,
        entityId,
        subject,
        data,
        occurrence ? `${occurrence}-${s.id}` : undefined,
      );
    }
  }
  schedule(
    id: string,
    project: string,
    kind: string,
    entityId: string,
    due: number,
    basis: number,
  ) {
    this.db.storage.query(
      "INSERT INTO schedules VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET due=excluded.due,basis=excluded.basis",
      id,
      project,
      kind,
      entityId,
      due,
      basis,
    );
  }
  unschedule(id: string) {
    this.db.storage.query("DELETE FROM schedules WHERE id=?", id);
  }
  event(
    project: string,
    kind: string,
    entityId: string,
    detail: Record<string, any>,
  ) {
    this.db.storage.query(
      "INSERT INTO events(project,kind,entity_id,actor,at,detail) VALUES(?,?,?,?,?,?)",
      project,
      kind,
      entityId,
      this.actorId,
      this.now,
      JSON.stringify(detail),
    );
  }
  clearCheckin(workId: string) {
    this.db.storage.query(
      "UPDATE inbox SET state='resolved' WHERE entity_id=? AND kind='checkin' AND state='open'",
      workId,
    );
  }
}
