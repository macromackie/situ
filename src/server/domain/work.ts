import type { Command } from "../../protocol/commands.js";
import {
  requireThat,
  mergeEvidence,
  type Work,
} from "../../protocol/models.js";
import { Context } from "../context.js";
function idleJobs(c: Context, w: Work) {
  requireThat(
    !c.db
      .list(w.projectId, "job")
      .some(
        (j) => j.workId === w.id && ["running", "unknown"].includes(j.status),
      ),
    "job_unreconciled",
    "A runner is active or unknown. Reconcile its durable receipt before relaunch or finishing",
  );
}
function due(c: Context, w: Work) {
  const p = c.project(w.projectId);
  c.schedule(
    `checkin-${w.id}`,
    w.projectId,
    "checkin",
    w.id,
    c.now + p.policy.checkInSeconds * 1000,
    w.generation,
  );
  c.schedule(
    `lease-${w.id}`,
    w.projectId,
    "lease",
    w.id,
    w.leaseUntil,
    w.generation,
  );
}
export function work(c: Context, command: Command): any {
  switch (command.type) {
    case "work.propose": {
      const i = command.input,
        t = c.entity(i.topicId, "topic");
      for (const id of i.dependsOn) c.entity(id, "work");
      const w = c.create("work", t.projectId, {
        ...i,
        state: "proposed",
        planRevision: 1,
        planHistory: [],
        owner: null,
        generation: 0,
        leaseUntil: 0,
        evidence: [],
        checkpoints: [],
        next: i.plan.next,
      });
      c.broadcast(
        t.projectId,
        ["coordinator"],
        "proposal",
        w.id,
        `Proposed: ${i.title}`,
      );
      return w;
    }
    case "work.admit": {
      c.role("coordinator");
      const i = command.input,
        w = c.entity<Work>(i.workId, "work");
      c.revision(w, i.expectedRevision);
      requireThat(
        ["proposed", "ready"].includes(w.state),
        "wrong_state",
        "Only proposed work can be admitted",
      );
      return c.update(w, {
        state: "ready",
        admission: {
          reason: i.reason,
          by: c.actorId,
          policyRevision: c.project(w.projectId).policyRevision,
          at: c.now,
        },
      });
    }
    case "work.start": {
      c.session();
      const i = command.input,
        w = c.entity<Work>(i.workId, "work");
      c.revision(w, i.expectedRevision);
      requireThat(
        w.state === "ready" || (w.state === "active" && w.leaseUntil <= c.now),
        "not_available",
        "Work is not ready or has a live owner",
      );
      const recovering = w.state === "active";
      const p = c.project(w.projectId),
        others = c.db
          .list<Work>(w.projectId, "work")
          .filter((x) => x.id !== w.id && x.state === "active");
      requireThat(
        recovering || others.length < p.policy.maxActiveWork,
        "capacity_unavailable",
        "Active work capacity is full",
      );
      const topics = new Set(others.map((x) => x.topicId));
      topics.add(w.topicId);
      requireThat(
        recovering || topics.size <= p.policy.maxActiveTopics,
        "focus_capacity",
        "Active topic capacity is full; finish a branch before starting another",
      );
      const pending = c.db
        .list(w.projectId, "review")
        .filter((r) => r.state === "pending");
      requireThat(
        recovering ||
          w.purpose === "validation" ||
          pending.length < p.policy.maxPendingReviews,
        "review_backlog",
        "Review capacity is full; help validate pending results before starting another experiment",
      );
      for (const id of w.dependsOn)
        requireThat(
          c.entity(id, "work").state === "finished",
          "dependency_pending",
          `Dependency ${id} is unfinished`,
        );
      const next = c.update(w, {
        state: "active",
        owner: c.actorId,
        generation: w.generation + 1,
        leaseUntil: c.now + p.policy.leaseSeconds * 1000,
      });
      c.db.storage.query(
        "INSERT OR IGNORE INTO subscriptions VALUES(?,?)",
        c.actorId,
        w.topicId,
      );
      due(c, next);
      return next;
    }
    case "work.checkpoint": {
      const i = command.input,
        w = c.held(i.workId, i.generation);
      requireThat(
        w.planRevision === i.planRevision,
        "plan_changed",
        "Checkpoint must identify the current plan",
      );
      const checkpoint = { at: c.now, by: c.actorId, ...i };
      const next = c.update(w, {
        next: i.next,
        evidence: mergeEvidence(w.evidence, i.evidence),
        checkpoints: [...w.checkpoints, checkpoint],
        lastCheckpoint: c.now,
      });
      c.clearCheckin(w.id);
      due(c, next);
      const previous = w.checkpoints.slice(-2);
      if (
        !i.evidence.length &&
        previous.length === 2 &&
        previous.every((v: any) => !v.evidence.length)
      )
        c.broadcast(
          w.projectId,
          ["coordinator", "reviewer"],
          "progress_review",
          w.id,
          `Outside review requested: ${w.title}`,
          {},
          `progress-${w.id}-${next.revision}`,
        );
      return next;
    }
    case "work.revise": {
      const i = command.input,
        w = c.held(i.workId, i.generation);
      c.revision(w, i.expectedRevision);
      idleJobs(c, w);
      return c.update(w, {
        planHistory: [
          ...w.planHistory,
          {
            plan: w.plan,
            revision: w.planRevision,
            reason: i.reason,
            at: c.now,
          },
        ],
        plan: i.plan,
        planRevision: w.planRevision + 1,
        next: i.plan.next,
      });
    }
    case "work.handoff": {
      const i = command.input,
        w = c.held(i.workId, i.generation);
      c.unschedule(`lease-${w.id}`);
      c.unschedule(`checkin-${w.id}`);
      c.clearCheckin(w.id);
      const next = c.update(w, {
        state: "ready",
        owner: null,
        leaseUntil: 0,
        next: i.next,
        blockers: i.blockers ?? "",
      });
      c.broadcast(
        w.projectId,
        ["coordinator"],
        "handoff",
        w.id,
        `Handoff: ${w.title}`,
      );
      return next;
    }
    case "work.finish": {
      const i = command.input,
        w = c.held(i.workId, i.generation);
      idleJobs(c, w);
      c.unschedule(`lease-${w.id}`);
      c.unschedule(`checkin-${w.id}`);
      c.clearCheckin(w.id);
      const next = c.update(w, {
        state: "finished",
        outcome: i.outcome,
        summary: i.summary,
        evidence: mergeEvidence(w.evidence, i.evidence),
        leaseUntil: 0,
      });
      c.broadcast(
        w.projectId,
        ["reviewer", "coordinator"],
        "result",
        w.id,
        `Result ready: ${w.title}`,
      );
      return next;
    }
    case "work.cancel": {
      c.role("coordinator");
      const i = command.input,
        w = c.entity<Work>(i.workId, "work");
      c.revision(w, i.expectedRevision);
      requireThat(
        ["proposed", "ready", "active"].includes(w.state),
        "wrong_state",
        "Work is already terminal",
      );
      c.unschedule(`lease-${w.id}`);
      c.unschedule(`checkin-${w.id}`);
      if (w.owner)
        c.notify(w.owner, w.projectId, "stop", w.id, i.reason, {
          reason: i.reason,
        });
      return c.update(w, {
        state: "cancelled",
        cancelReason: i.reason,
        leaseUntil: 0,
      });
    }
    default:
      return undefined;
  }
}
