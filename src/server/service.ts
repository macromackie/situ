import { parseCommand } from "../protocol/commands.js";
import {
  canonical,
  digest,
  Fault,
  requireThat,
  type Entity,
  type Session,
} from "../protocol/models.js";
import { Database } from "./database.js";
import { Context } from "./context.js";
import { communication } from "./domain/communication.js";
import { work } from "./domain/work.js";
import { researchEvidence } from "./domain/evidence.js";
export interface Keys {
  admin: string;
  join: string;
}
export class Service {
  constructor(
    public db: Database,
    public keys: Keys,
    public clock: () => number = Date.now,
  ) {}
  get workspaceId() {
    return this.db.meta("workspace")!;
  }
  async actor(token: string, allowLeft = false): Promise<Session | "admin"> {
    if (token && token === this.keys.admin) return "admin";
    const row = this.db.storage.query(
      "SELECT entity_id FROM sessions WHERE token_hash=?",
      await digest(token),
    )[0];
    requireThat(
      row,
      "unauthorized",
      "Set SITU_SESSION to a joined session file",
      401,
    );
    const s = this.db.get<Session>(row.entity_id, "session");
    requireThat(
      allowLeft || !s.left,
      "session_left",
      "This session has left; join a new session",
      401,
    );
    return s;
  }
  async execute(value: unknown, token: string) {
    const command = parseCommand(value);
    requireThat(
      command.workspaceId === this.workspaceId,
      "workspace_changed",
      "Command belongs to another workspace",
    );
    let actor: Session | "admin";
    let tokenHash: string | undefined;
    if (command.type === "session.join") {
      requireThat(
        token === this.keys.join || token === this.keys.admin,
        "unauthorized",
        "Join credential required",
        401,
      );
      actor = "admin";
      tokenHash = await digest(command.input.token);
    } else if (command.type === "job.progress") {
      const job = this.db.get(command.input.jobId, "job");
      requireThat(
        (await digest(command.input.runnerToken)) === job.runnerHash,
        "unauthorized",
        "Runner credential does not match this job",
        401,
      );
      actor = this.db.get<Session>(job.author, "session");
    } else actor = await this.actor(token, true);
    const cleanPayload =
      command.type === "session.join"
        ? { ...command, input: { ...command.input, token: tokenHash } }
        : command.type === "job.progress"
          ? {
              ...command,
              input: { ...command.input, runnerToken: "[credential]" },
            }
          : command;
    const payload = canonical(cleanPayload);
    const runnerToken = crypto.randomUUID() + crypto.randomUUID();
    const runnerSecret =
      command.type === "job.register"
        ? { token: runnerToken, hash: await digest(runnerToken) }
        : undefined;
    const c = new Context(this.db, actor, this.clock());
    return this.db.storage.transaction(() => {
      const previous = this.db.storage.query(
        "SELECT * FROM receipts WHERE id=?",
        command.id,
      )[0];
      if (previous) {
        requireThat(
          previous.actor === c.actorId && previous.payload === payload,
          "id_reused",
          "Command ID was already used with different content or by another session",
        );
        return JSON.parse(previous.result);
      }
      if (actor !== "admin" && command.type !== "job.progress") {
        c.actor = this.db.get<Session>(actor.id, "session");
        requireThat(
          !c.actor.left,
          "session_left",
          "This session has left",
          401,
        );
      }
      let result: any;
      if (command.type === "session.join") {
        const i = command.input;
        c.project(i.projectId);
        result = c.create("session", i.projectId, {
          name: i.name,
          roles: ["worker"],
          lastSeen: c.now,
          left: false,
          tokenHash,
        });
        this.db.storage.query(
          "INSERT INTO sessions VALUES(?,?)",
          tokenHash!,
          result.id,
        );
        result = { ...result, tokenHash: undefined };
      } else {
        result =
          communication(c, command) ??
          work(c, command) ??
          researchEvidence(c, command, runnerSecret);
        if (result === undefined)
          throw new Fault("unsupported", "Unsupported command", 400);
      }
      if (
        !["session.heartbeat", "inbox.read", "job.progress"].includes(
          command.type,
        )
      ) {
        const project =
          result.projectId ??
          (actor === "admin"
            ? "projectId" in command.input
              ? command.input.projectId
              : ""
            : actor.projectId);
        c.event(project, command.type, result.id ?? command.id, {
          commandId: command.id,
          title:
            result.title ??
            result.name ??
            result.claim ??
            result.body?.slice(0, 120) ??
            result.subject ??
            command.type,
          topicId:
            result.topicId ??
            ("topicId" in command.input ? command.input.topicId : undefined),
          workId:
            result.workId ??
            ("workId" in command.input ? command.input.workId : undefined),
        });
      }
      const receipt = {
        commandId: command.id,
        workspaceId: this.workspaceId,
        result: publicEntity(result),
      };
      this.db.storage.query(
        "INSERT INTO receipts VALUES(?,?,?,?)",
        command.id,
        c.actorId,
        payload,
        JSON.stringify(receipt),
      );
      return receipt;
    });
  }
  tick() {
    const c = new Context(this.db, "admin", this.clock());
    this.db.storage.transaction(() => {
      const schedules = this.db.storage.query(
        "SELECT * FROM schedules WHERE due<=? ORDER BY due LIMIT 100",
        c.now,
      );
      for (const s of schedules) {
        c.unschedule(s.id);
        const e = this.db.get(s.entity_id);
        if (s.kind === "reflection") {
          c.broadcast(
            s.project,
            ["coordinator", "curator"],
            "reflection",
            e.id,
            "Reflect on current focus, evidence, and next experiments",
            {},
            `reflection-${e.id}-${s.due}`,
          );
          c.schedule(
            s.id,
            s.project,
            "reflection",
            e.id,
            c.now + e.policy.reflectionSeconds * 1000,
            e.revision,
          );
        } else if (e.state === "active" && e.generation === s.basis) {
          if (s.kind === "checkin") {
            c.notify(
              e.owner,
              s.project,
              "checkin",
              e.id,
              `Checkpoint due: ${e.title}`,
              {},
              `checkin-${e.id}-${s.due}`,
            );
          } else if (e.leaseUntil <= c.now) {
            c.broadcast(
              s.project,
              ["coordinator"],
              "unreachable",
              e.id,
              `Owner unreachable: ${e.title}`,
              {},
              `lease-${e.id}-${s.basis}`,
            );
            c.event(s.project, "work.unreachable", e.id, {
              generation: e.generation,
            });
          }
        }
      }
      for (const job of this.db
        .all("job")
        .filter((j) => j.status === "running" && c.now - j.lastSeen > 120000))
        c.update(job, { status: "unknown" });
    });
  }
  nextAlarm(): number | undefined {
    const scheduled = this.db.storage.query(
      "SELECT MIN(due) AS due FROM schedules",
    )[0]?.due;
    const jobs = this.db
      .all("job")
      .filter((j) => j.status === "running")
      .map((j) => j.lastSeen + 120001);
    const all = [scheduled, ...jobs].filter(
      (v): v is number => typeof v === "number",
    );
    return all.length
      ? Math.max(this.clock() + 100, Math.min(...all))
      : undefined;
  }
}
export function publicEntity(e: any): any {
  if (Array.isArray(e)) return e.map(publicEntity);
  if (!e || typeof e !== "object") return e;
  return Object.fromEntries(
    Object.entries(e)
      .filter(([k]) => !["tokenHash", "runnerHash"].includes(k))
      .map(([k, v]) => [k, publicEntity(v)]),
  );
}
