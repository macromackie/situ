import {
  Fault,
  requireThat,
  type Entity,
  type Session,
} from "../protocol/models.js";
import { Context } from "./context.js";
import { publicEntity, Service } from "./service.js";
export function read(
  service: Service,
  path: string,
  params: URLSearchParams,
  actor: Session | "admin" | null,
) {
  const db = service.db,
    now = service.clock();
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 50)));
  requireThat(
    Number.isInteger(limit),
    "invalid_limit",
    "Limit must be an integer",
    400,
  );
  const project =
    params.get("project") ??
    (actor && actor !== "admin" ? actor.projectId : "");
  const context = actor ? new Context(db, actor, now) : null;
  const scope = (id: string) => context?.scope(id);
  const page = (items: any[]) => {
    const cursor = params.get("cursor");
    let after = "";
    if (cursor) {
      try {
        const c = JSON.parse(atob(cursor));
        requireThat(
          c.workspace === service.workspaceId &&
            c.path === path &&
            c.project === project,
          "bad_cursor",
          "Cursor belongs to another query",
        );
        after = c.after;
        requireThat(typeof after === "string", "bad_cursor", "Invalid cursor");
      } catch (e) {
        if (e instanceof Fault) throw e;
        throw new Fault("bad_cursor", "Invalid cursor", 400);
      }
    }
    const ordered = items.slice().sort((a, b) => a.id.localeCompare(b.id));
    const remaining = ordered.filter(
      (item) => !after || item.id.localeCompare(after) > 0,
    );
    const result = remaining.slice(0, limit);
    return {
      items: publicEntity(result),
      total: items.length,
      nextCursor:
        remaining.length > limit
          ? btoa(
              JSON.stringify({
                workspace: service.workspaceId,
                path,
                project,
                after: result.at(-1).id,
              }),
            )
          : null,
    };
  };
  if (path === "/v1/status")
    return {
      workspaceId: service.workspaceId,
      schema: 1,
      version: "0.3.0",
      runtime: "celld 0.6.1",
      now,
    };
  if (path === "/v1/projects")
    return page(
      db
        .all("project")
        .filter((p) => !actor || actor === "admin" || p.id === actor.projectId),
    );
  if (path === "/v1/events") {
    if (project) scope(project);
    requireThat(
      !actor || actor === "admin" || !!project,
      "project_required",
      "Project required",
      400,
    );
    const after = Number(params.get("after") ?? 0);
    requireThat(
      Number.isSafeInteger(after) && after >= 0,
      "bad_cursor",
      "after must be a nonnegative event sequence",
      400,
    );
    const tail = params.get("tail") === "1";
    const rows = db.storage.query(
      `SELECT * FROM events WHERE seq>? ${project ? "AND project=?" : ""} ORDER BY seq ${tail ? "DESC" : "ASC"} LIMIT ?`,
      after,
      ...(project ? [project] : []),
      limit + 1,
    );
    const visible = rows.slice(0, limit);
    if (tail) visible.reverse();
    return {
      items: visible.map((r) => ({ ...r, detail: JSON.parse(r.detail) })),
      after: visible.at(-1)?.seq ?? after,
      hasMore: rows.length > limit,
    };
  }
  if (path === "/v1/me/inbox" || path === "/v1/me/next") {
    requireThat(context, "unauthorized", "Session required", 401);
    const s = context.session();
    const rows: any[] = db.storage
      .query(
        "SELECT * FROM inbox WHERE recipient=? AND state='open' ORDER BY CASE kind WHEN 'stop' THEN 0 WHEN 'request' THEN 1 WHEN 'checkin' THEN 2 ELSE 3 END,due,id",
        s.id,
      )
      .map((r) => ({ ...r, data: JSON.parse(r.data) }));
    if (path.endsWith("/inbox")) return page(rows);
    const due = rows.filter((r) => r.due <= now),
      owned = db
        .list(s.projectId, "work")
        .filter((w) => w.owner === s.id && w.state === "active");
    return {
      reviews: s.roles.some((r) => ["reviewer", "coordinator"].includes(r))
        ? publicEntity(
            db
              .list(s.projectId, "review")
              .filter((r) => r.state === "pending")
              .slice(0, limit),
          )
        : [],
      proposals: s.roles.includes("coordinator")
        ? publicEntity(
            db
              .list(s.projectId, "work")
              .filter((w) => w.state === "proposed")
              .slice(0, limit),
          )
        : [],
      session: publicEntity({
        ...s,
        presence: now - s.lastSeen > 300000 ? "unreachable" : "present",
      }),
      obligations: publicEntity(due.slice(0, limit)),
      backlog: due.length,
      hasMore: due.length > limit,
      deferred: rows.length - due.length,
      work: publicEntity(owned),
      ready: publicEntity(
        db
          .list(s.projectId, "work")
          .filter((w) => w.state === "ready")
          .slice(0, 10),
      ),
      recoverable: publicEntity(
        db
          .list(s.projectId, "work")
          .filter((w) => w.state === "active" && w.leaseUntil <= now)
          .slice(0, limit),
      ),
      capabilities: {
        delivery: "checkpoint-pull",
        autonomousWake: false,
        heartbeat: "explicit or supervised process",
      },
    };
  }
  const parts = path.split("/").filter(Boolean);
  if (parts[1] === "commands" && parts[2]) {
    requireThat(context, "unauthorized", "Session required", 401);
    const receipt = db.storage.query(
      "SELECT actor,result FROM receipts WHERE id=?",
      parts[2],
    )[0];
    requireThat(
      receipt,
      "not_found",
      "No receipt; retry the saved command with the same ID",
      404,
    );
    requireThat(
      actor === "admin" || receipt.actor === context.actorId,
      "forbidden",
      "Receipt belongs to another caller",
      403,
    );
    return JSON.parse(receipt.result);
  }
  if (parts[1] === "projects" && parts[2]) {
    const p = db.get(parts[2], "project");
    scope(p.id);
    if (parts[3] && parts[3] !== "brief") {
      const kind = (
        {
          topics: "topic",
          work: "work",
          sessions: "session",
          reviews: "review",
          jobs: "job",
        } as Record<string, string>
      )[parts[3]];
      requireThat(kind, "not_found", "Unknown collection", 404);
      return page(db.list(p.id, kind));
    }
    const work = db.list(p.id, "work"),
      reviews = db.list(p.id, "review"),
      jobs = db.list(p.id, "job");
    return {
      project: publicEntity(p),
      counts: {
        openRequests: db.storage.query(
          "SELECT COUNT(*) AS count FROM inbox WHERE project=? AND kind='request' AND state='open'",
          p.id,
        )[0].count,
        overdueCheckins: db.storage.query(
          "SELECT COUNT(*) AS count FROM inbox WHERE project=? AND kind='checkin' AND state='open' AND due<=?",
          p.id,
          now,
        )[0].count,
        active: work.filter((w) => w.state === "active").length,
        ready: work.filter((w) => w.state === "ready").length,
        proposed: work.filter((w) => w.state === "proposed").length,
        finished: work.filter((w) => w.state === "finished").length,
        pendingReview: reviews.filter((r) => r.state === "pending").length,
        accepted: reviews.filter((r) => r.state === "accepted").length,
      },
      topics: publicEntity(db.list(p.id, "topic")),
      work: publicEntity(work),
      reviews: publicEntity(reviews),
      jobs: publicEntity(jobs),
      sessions: publicEntity(
        db.list(p.id, "session").map((s) => ({
          ...s,
          presence: s.left
            ? "left"
            : now - s.lastSeen > p.policy.leaseSeconds * 1000
              ? "unreachable"
              : "present",
        })),
      ),
    };
  }
  const kind = (
    {
      topics: "topic",
      work: "work",
      reviews: "review",
      posts: "post",
      jobs: "job",
    } as Record<string, string>
  )[parts[1]];
  if (kind && parts[2]) {
    const entity = db.get(parts[2], kind);
    scope(entity.projectId);
    if (parts[3] === "posts" && kind === "topic")
      return page(
        db
          .list(entity.projectId, "post")
          .filter((p) => p.topicId === entity.id)
          .sort((a, b) => a.createdAt - b.createdAt),
      );
    if (kind === "topic")
      return {
        topic: publicEntity(entity),
        work: publicEntity(
          db
            .list(entity.projectId, "work")
            .filter((w) => w.topicId === entity.id),
        ),
        reviews: publicEntity(
          db
            .list(entity.projectId, "review")
            .filter((r) => r.topicId === entity.id),
        ),
      };
    if (kind === "work")
      return {
        work: publicEntity(entity),
        jobs: publicEntity(
          db
            .list(entity.projectId, "job")
            .filter((j) => j.workId === entity.id),
        ),
        reviews: publicEntity(
          db
            .list(entity.projectId, "review")
            .filter((r) => r.workId === entity.id),
        ),
      };
    return publicEntity(entity);
  }
  throw new Fault("not_found", "Unknown API route", 404);
}
