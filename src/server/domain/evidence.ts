import type { Command } from "../../protocol/commands.js";
import {
  requireThat,
  mergeEvidence,
  type Work,
} from "../../protocol/models.js";
import { Context } from "../context.js";
export function researchEvidence(
  c: Context,
  command: Command,
  runnerSecret?: { token: string; hash: string },
): any {
  switch (command.type) {
    case "job.register": {
      const i = command.input,
        w = c.held(i.workId, i.generation);
      requireThat(
        !c.db
          .list(w.projectId, "job")
          .some(
            (j) =>
              j.workId === w.id && ["running", "unknown"].includes(j.status),
          ),
        "job_unreconciled",
        "Reconcile the previous execution before launching another",
      );
      requireThat(
        !c.db.storage.query(
          "SELECT id FROM inbox WHERE entity_id=? AND state='open' AND kind IN ('checkin','progress_review')",
          w.id,
        ).length,
        "checkpoint_required",
        "Record the due checkpoint or resolve the outside review before launching another job",
      );
      requireThat(
        runnerSecret,
        "internal",
        "Runner credential was not prepared",
        500,
      );
      const job = c.create(
        "job",
        w.projectId,
        {
          ...i,
          status: "running",
          runnerHash: runnerSecret.hash,
          planRevision: w.planRevision,
          evidence: [],
          lastSeen: c.now,
        },
        i.jobId,
      );
      return { ...job, runnerHash: undefined, runnerToken: runnerSecret.token };
    }
    case "job.progress": {
      const i = command.input,
        j = c.entity(i.jobId, "job");
      requireThat(
        ["running", "unknown"].includes(j.status),
        "job_terminal",
        "A terminal receipt cannot be overwritten",
      );
      const w = c.entity<Work>(j.workId, "work");
      const stop = w.state === "cancelled";
      const next = c.update(j, {
        status: i.status,
        lastSeen: c.now,
        note: i.note,
        evidence: mergeEvidence(j.evidence, i.evidence),
      });
      if (i.evidence.length)
        c.update(w, { evidence: mergeEvidence(w.evidence, i.evidence) });
      return { ...next, runnerHash: undefined, stop };
    }
    case "job.reconcile": {
      c.role("coordinator");
      const i = command.input,
        j = c.entity(i.jobId, "job");
      requireThat(
        ["running", "unknown"].includes(j.status),
        "job_terminal",
        "Job is already terminal",
      );
      requireThat(
        c.now - j.lastSeen > 120000,
        "runner_recent",
        "The runner reported recently; use its live control path first",
      );
      return c.update(j, {
        status: i.status,
        evidence: mergeEvidence(j.evidence, i.evidence),
        reconciliation: { by: c.actorId, reason: i.reason, at: c.now },
      });
    }
    case "review.submit": {
      const i = command.input,
        w = c.entity<Work>(i.workId, "work");
      c.revision(w, i.expectedRevision);
      requireThat(
        w.state === "finished",
        "work_unfinished",
        "Finish the work and attach its evidence before submitting a conclusion",
      );
      requireThat(
        i.evidence.every((e) =>
          w.evidence.some((x) => x.uri === e.uri && x.sha256 === e.sha256),
        ),
        "evidence_required",
        "Submitted evidence must reference the work’s recorded artifacts",
      );
      requireThat(
        !c.db
          .list(w.projectId, "review")
          .some((r) => r.workId === w.id && r.state === "pending"),
        "review_pending",
        "A review of this work is already pending",
      );
      const p = c.project(w.projectId);
      const review = c.create("review", w.projectId, {
        workId: w.id,
        topicId: w.topicId,
        claim: i.claim,
        evidence: i.evidence,
        workRevision: w.revision,
        planRevision: w.planRevision,
        policyRevision: p.policyRevision,
        workSnapshot: w,
        state: "pending",
        decisions: [],
        challenges: [],
      });
      c.broadcast(
        w.projectId,
        ["reviewer", "coordinator"],
        "review",
        review.id,
        `Review: ${w.title}`,
      );
      return review;
    }
    case "review.decide": {
      c.role("reviewer");
      const i = command.input,
        r = c.entity(i.reviewId, "review");
      c.revision(r, i.expectedRevision);
      requireThat(
        r.state === "pending",
        "review_closed",
        "This candidate already has a decision",
      );
      requireThat(
        c.actorId !== r.author && c.actorId !== r.workSnapshot.owner,
        "independent_review",
        "The author and work owner cannot accept their own candidate",
      );
      requireThat(
        c.entity(r.workId, "work").revision === r.workRevision,
        "work_changed",
        "Work evidence changed after submission; withdraw and submit a fresh candidate",
      );
      requireThat(
        c.project(r.projectId).policyRevision === r.policyRevision,
        "policy_changed",
        "Policy changed; submit a fresh candidate under the current criteria",
      );
      const next = c.update(r, {
        state: i.decision,
        decisions: [...r.decisions, { ...i, by: c.actorId, at: c.now }],
      });
      c.broadcast(
        r.projectId,
        ["coordinator", "curator"],
        "decision",
        r.id,
        `${i.decision}: ${r.claim.slice(0, 90)}`,
      );
      if (r.author !== "admin")
        c.notify(
          r.author,
          r.projectId,
          "decision",
          r.id,
          i.rationale.slice(0, 120),
          { decision: i.decision },
        );
      return next;
    }
    case "review.withdraw": {
      const i = command.input,
        r = c.entity(i.reviewId, "review");
      c.revision(r, i.expectedRevision);
      if (c.actorId !== r.author) c.role("coordinator");
      requireThat(
        r.state === "pending",
        "review_closed",
        "Only a pending candidate can be withdrawn",
      );
      return c.update(r, {
        state: "withdrawn",
        withdrawal: { by: c.actorId, reason: i.reason, at: c.now },
      });
    }
    case "review.challenge": {
      const i = command.input,
        r = c.entity(i.reviewId, "review");
      requireThat(
        r.state === "accepted",
        "not_accepted",
        "Challenge an accepted conclusion; use posts to discuss other candidates",
      );
      const next = c.update(r, {
        state: "challenged",
        challenges: [...r.challenges, { ...i, by: c.actorId, at: c.now }],
      });
      c.broadcast(
        r.projectId,
        ["reviewer", "coordinator"],
        "challenge",
        r.id,
        `Contradictory evidence: ${r.claim.slice(0, 90)}`,
      );
      return next;
    }
    default:
      return undefined;
  }
}
