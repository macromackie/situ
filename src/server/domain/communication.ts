import type { Command } from "../../protocol/commands.js";
import { requireThat, type Session } from "../../protocol/models.js";
import { Context } from "../context.js";
export function communication(c: Context, command: Command): any {
  switch (command.type) {
    case "project.create": {
      c.role("admin");
      const i = command.input;
      const p = c.create(
        "project",
        i.id,
        { ...i, brief: "", sources: [], policyRevision: 1 },
        i.id,
      );
      c.schedule(
        `reflection-${p.id}`,
        p.id,
        "reflection",
        p.id,
        c.now + i.policy.reflectionSeconds * 1000,
        1,
      );
      return p;
    }
    case "project.update": {
      c.role("coordinator");
      const i = command.input,
        p = c.project(i.projectId);
      c.revision(p, i.expectedRevision);
      if (i.policy || i.focus) c.role("coordinator");
      for (const id of i.sources ?? []) c.entity(id);
      const patch: Record<string, any> = {};
      for (const key of ["brief", "focus", "sources", "policy"] as const)
        if (i[key] !== undefined) patch[key] = i[key];
      if (i.policy) patch.policyRevision = p.policyRevision + 1;
      const next = c.update(p, patch);
      c.db.storage.query(
        "UPDATE inbox SET state='resolved' WHERE entity_id=? AND kind='reflection'",
        p.id,
      );
      c.schedule(
        `reflection-${p.id}`,
        p.id,
        "reflection",
        p.id,
        c.now + next.policy.reflectionSeconds * 1000,
        next.revision,
      );
      return next;
    }
    case "session.grant": {
      c.role("coordinator");
      const s = c.entity<Session>(command.input.sessionId, "session");
      return c.update(s, { roles: command.input.roles });
    }
    case "session.replace": {
      c.role("coordinator");
      const i = command.input,
        old = c.entity<Session>(i.oldSessionId, "session"),
        next = c.entity<Session>(i.newSessionId, "session");
      requireThat(
        old.id !== next.id && old.projectId === next.projectId && !next.left,
        "invalid_replacement",
        "Select a live replacement in the same project",
      );
      requireThat(
        old.left ||
          c.now - old.lastSeen >
            c.project(old.projectId).policy.leaseSeconds * 1000,
        "session_present",
        "The old session is still reporting",
      );
      c.update(old, {
        left: true,
        replacedBy: next.id,
        replacementReason: i.reason,
      });
      const replacement = c.update(next, {
        roles: old.roles,
        replaces: old.id,
      });
      const items = c.db.storage.query(
        "SELECT id,data FROM inbox WHERE recipient=? AND state='open'",
        old.id,
      );
      for (const item of items)
        c.db.storage.query(
          "UPDATE inbox SET recipient=?,data=? WHERE id=?",
          next.id,
          JSON.stringify({
            ...JSON.parse(item.data),
            originalRecipient: old.id,
          }),
          item.id,
        );
      for (const sub of c.db.storage.query(
        "SELECT topic_id FROM subscriptions WHERE session_id=?",
        old.id,
      ))
        c.db.storage.query(
          "INSERT OR IGNORE INTO subscriptions VALUES(?,?)",
          next.id,
          sub.topic_id,
        );
      c.db.storage.query(
        "DELETE FROM subscriptions WHERE session_id=?",
        old.id,
      );
      c.notify(
        next.id,
        next.projectId,
        "handoff",
        old.id,
        `Recovered ${items.length} outstanding obligations`,
        { reason: i.reason },
      );
      return replacement;
    }
    case "session.heartbeat": {
      const s = c.session();
      c.db.save({ ...s, lastSeen: c.now });
      for (const w of c.db
        .list(s.projectId, "work")
        .filter(
          (w) =>
            w.owner === s.id && w.state === "active" && w.leaseUntil > c.now,
        )) {
        c.db.save({
          ...w,
          leaseUntil: c.now + c.project(s.projectId).policy.leaseSeconds * 1000,
        });
        c.schedule(
          `lease-${w.id}`,
          s.projectId,
          "lease",
          w.id,
          c.now + c.project(s.projectId).policy.leaseSeconds * 1000,
          w.generation,
        );
      }
      return { id: s.id, lastSeen: c.now };
    }
    case "session.leave": {
      const s = c.session();
      c.update(s, { left: true });
      for (const w of c.db
        .list(s.projectId, "work")
        .filter((w) => w.owner === s.id && w.state === "active")) {
        c.db.save({ ...w, leaseUntil: c.now });
        c.schedule(
          `lease-${w.id}`,
          s.projectId,
          "lease",
          w.id,
          c.now,
          w.generation,
        );
      }
      return { id: s.id };
    }
    case "topic.create": {
      const i = command.input;
      c.project(i.projectId);
      if (i.parentId)
        requireThat(
          c.entity(i.parentId, "topic").projectId === i.projectId,
          "wrong_project",
          "Parent is in another project",
        );
      return c.create("topic", i.projectId, { ...i, sources: [] });
    }
    case "topic.update": {
      c.role("coordinator");
      const i = command.input,
        t = c.entity(i.topicId, "topic");
      c.revision(t, i.expectedRevision);
      for (const id of i.sources) c.entity(id);
      return c.update(t, { brief: i.brief, sources: i.sources });
    }
    case "post.create": {
      const i = command.input,
        t = c.entity(i.topicId, "topic");
      if (i.replyTo) {
        const parent = c.entity(i.replyTo, "post");
        requireThat(
          parent.topicId === t.id && !parent.replyTo,
          "reply_depth",
          "Reply to a top-level post in this topic; link deeper discussion in the text",
          400,
        );
      }
      const p = c.create("post", t.projectId, i);
      for (const recipient of new Set(i.mentions)) {
        const s = c.entity<Session>(recipient, "session");
        requireThat(
          !s.left,
          "session_gone",
          "Mentioned session has left; select its replacement",
        );
        c.notify(s.id, t.projectId, "mention", p.id, `Mention in ${t.title}`, {
          body: i.body,
        });
      }
      for (const row of c.db.storage.query(
        "SELECT session_id FROM subscriptions WHERE topic_id=?",
        t.id,
      )) {
        if (row.session_id === c.actorId || i.mentions.includes(row.session_id))
          continue;
        const existing = c.db.storage.query(
          "SELECT id,data FROM inbox WHERE recipient=? AND kind='digest' AND entity_id=? AND state='open'",
          row.session_id,
          t.id,
        )[0];
        if (existing) {
          const d = JSON.parse(existing.data);
          d.count += 1;
          d.latest = p.id;
          c.db.storage.query(
            "UPDATE inbox SET data=?,read_at=NULL WHERE id=?",
            JSON.stringify(d),
            existing.id,
          );
        } else
          c.notify(
            row.session_id,
            t.projectId,
            "digest",
            t.id,
            `Updates in ${t.title}`,
            { count: 1, latest: p.id },
          );
      }
      return p;
    }
    case "request.create": {
      const i = command.input,
        t = c.entity(i.topicId, "topic"),
        s = c.entity<Session>(i.recipient, "session");
      requireThat(
        !s.left,
        "session_gone",
        "Recipient has left; select its replacement",
      );
      if (i.workId)
        requireThat(
          c.entity(i.workId, "work").topicId === t.id,
          "wrong_topic",
          "Request work belongs to a different topic",
        );
      const p = c.create("post", t.projectId, {
        topicId: t.id,
        body: i.body,
        mentions: [],
        evidence: [],
        requestTo: s.id,
      });
      const id = c.notify(
        s.id,
        t.projectId,
        "request",
        p.id,
        i.body.slice(0, 120),
        { body: i.body, from: c.actorId, workId: i.workId },
      );
      return { id, post: p.id };
    }
    case "subscribe": {
      const s = c.session(),
        t = c.entity(command.input.topicId, "topic");
      if (command.input.enabled)
        c.db.storage.query(
          "INSERT OR IGNORE INTO subscriptions VALUES(?,?)",
          s.id,
          t.id,
        );
      else
        c.db.storage.query(
          "DELETE FROM subscriptions WHERE session_id=? AND topic_id=?",
          s.id,
          t.id,
        );
      return { id: t.id, subscribed: command.input.enabled };
    }
    case "inbox.read": {
      const s = c.session();
      for (const id of command.input.ids)
        c.db.storage.query(
          "UPDATE inbox SET read_at=? WHERE id=? AND recipient=?",
          c.now,
          id,
          s.id,
        );
      return { read: command.input.ids };
    }
    case "inbox.resolve":
    case "inbox.defer": {
      const s = c.session(),
        i = command.input;
      const row = c.db.storage.query(
        "SELECT * FROM inbox WHERE id=? AND recipient=?",
        i.id,
        s.id,
      )[0];
      requireThat(row, "not_found", "Inbox item not found", 404);
      requireThat(
        row.state === "open",
        "already_resolved",
        "This item has already been resolved",
      );
      if (command.type === "inbox.defer") {
        const input = command.input;
        c.db.storage.query(
          "UPDATE inbox SET due=?,data=? WHERE id=?",
          c.now + input.seconds * 1000,
          JSON.stringify({ ...JSON.parse(row.data), deferred: input.reason }),
          i.id,
        );
      } else {
        const input = command.input;
        c.db.storage.query(
          "UPDATE inbox SET state='resolved',data=? WHERE id=?",
          JSON.stringify({
            ...JSON.parse(row.data),
            response: input.response,
            disposition: input.disposition,
          }),
          i.id,
        );
        if (row.kind === "request") {
          const from = JSON.parse(row.data).from;
          if (from && from !== "admin")
            c.notify(
              from,
              row.project,
              "response",
              row.entity_id,
              input.response.slice(0, 120),
              { response: input.response, disposition: input.disposition },
            );
        }
      }
      return { id: i.id };
    }
    default:
      return undefined;
  }
}
