import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, artifact } from "./helpers.js";
import { read } from "../src/server/reads.js";
test("expired claims can be taken over; old owners cannot modify the new claim", async () => {
  const f = fixture();
  try {
    const t = await f.init(),
      a = await f.join("a"),
      b = await f.join("b");
    const w = await f.ready(t, a);
    f.advance(61000);
    await assert.rejects(
      f.call(
        "work.checkpoint",
        {
          workId: w.id,
          generation: w.generation,
          planRevision: 1,
          observed: "Late",
          next: "Continue",
          continueReason: "Still useful",
        },
        a.token,
      ),
      { code: "claim_lost" },
    );
    const next = await f.call(
      "work.start",
      { workId: w.id, expectedRevision: w.revision },
      b.token,
    );
    assert.equal(next.generation, 2);
    await f.call("session.heartbeat", {}, a.token);
    assert.equal(f.db.get(w.id).owner, b.id);
    await assert.rejects(
      f.call(
        "work.handoff",
        { workId: w.id, generation: 1, next: "Oops" },
        a.token,
      ),
      { code: "claim_lost" },
    );
    const late = await f.call(
      "post.create",
      {
        topicId: t.id,
        body: "Late observation from the previous owner",
        evidence: [artifact],
      },
      a.token,
    );
    assert(late.id);
  } finally {
    f.close();
  }
});
test("heartbeat renews presence but does not erase checkpoint obligations or terminate long work", async () => {
  const f = fixture();
  try {
    const t = await f.init(),
      a = await f.join("a");
    const w = await f.ready(t, a);
    for (let i = 0; i < 5; i++) {
      f.advance(30000);
      await f.call("session.heartbeat", {}, a.token);
      f.service.tick();
    }
    const next = read(
      f.service,
      "/v1/me/next",
      new URLSearchParams(),
      await f.service.actor(a.token),
    ) as any;
    assert(next.obligations.some((i: any) => i.kind === "checkin"));
    assert.equal(f.db.get(w.id).state, "active");
    assert(f.db.get(w.id).leaseUntil > f.service.clock());
    await f.call(
      "work.checkpoint",
      {
        workId: w.id,
        generation: 1,
        planRevision: 1,
        observed: "Still training, loss declining",
        next: "Complete evaluation",
        evidence: [artifact],
        continueReason: "Evaluation has not reached the predicted step",
      },
      a.token,
    );
    assert.equal(
      f.db.storage.query(
        "SELECT * FROM inbox WHERE entity_id=? AND kind='checkin' AND state='open'",
        w.id,
      ).length,
      0,
    );
  } finally {
    f.close();
  }
});
test("orphaned runner requires reconciliation before relaunch; cancelled work tells runner to stop", async () => {
  const f = fixture();
  try {
    const t = await f.init(),
      a = await f.join("a"),
      b = await f.join("b");
    const w = await f.ready(t, a);
    const job = await f.call(
      "job.register",
      {
        workId: w.id,
        generation: 1,
        jobId: "j-test",
        command: ["echo", "hello"],
        cwd: "/tmp",
        receiptPath: "/tmp/receipt.json",
      },
      a.token,
    );
    f.advance(121000);
    f.service.tick();
    assert.equal(f.db.get(job.id).status, "unknown");
    const next = await f.call(
      "work.start",
      { workId: w.id, expectedRevision: w.revision },
      b.token,
    );
    await assert.rejects(
      f.call(
        "job.register",
        {
          workId: w.id,
          generation: next.generation,
          jobId: "j-duplicate",
          command: ["echo"],
          cwd: "/tmp",
          receiptPath: "/tmp/duplicate",
        },
        b.token,
      ),
      { code: "job_unreconciled" },
    );
    await f.call("job.reconcile", {
      jobId: job.id,
      status: "failed",
      reason: "Process exited; receipt verified",
      evidence: [artifact],
    });
    await f.call(
      "work.checkpoint",
      {
        workId: w.id,
        generation: next.generation,
        planRevision: 1,
        observed: "Recovered failed run and verified its receipt",
        next: "Try corrected configuration",
        continueReason: "The failure was operational",
        evidence: [artifact],
      },
      b.token,
    );
    const second = await f.call(
      "job.register",
      {
        workId: w.id,
        generation: next.generation,
        jobId: "j-second",
        command: ["echo"],
        cwd: "/tmp",
        receiptPath: "/tmp/second.json",
      },
      b.token,
    );
    await f.call("work.cancel", {
      workId: w.id,
      expectedRevision: f.db.get(w.id).revision,
      reason: "Evaluator invalid",
    });
    const pulse = await f.call(
      "job.progress",
      {
        jobId: second.id,
        runnerToken: second.runnerToken,
        status: "running",
        note: "Alive",
      },
      b.token,
    );
    assert.equal(pulse.stop, true);
  } finally {
    f.close();
  }
});
test("alarm replay does not duplicate an occurrence", async () => {
  const f = fixture();
  try {
    const t = await f.init(),
      a = await f.join("a"),
      coordinator = await f.join("lead", ["coordinator"]);
    await f.ready(t, a);
    f.advance(61000);
    f.service.tick();
    f.service.tick();
    assert.equal(
      f.db.storage.query(
        "SELECT * FROM inbox WHERE recipient=? AND kind='unreachable'",
        coordinator.id,
      ).length,
      1,
    );
  } finally {
    f.close();
  }
});

test("replacement inherits unresolved obligations; terminal session writes can be retried exactly", async () => {
  const f = fixture();
  try {
    const t = await f.init(),
      a = await f.join("a", ["worker", "reviewer"]),
      b = await f.join("b"),
      lead = await f.join("lead", ["coordinator"]);
    const request = await f.call(
      "request.create",
      { topicId: t.id, recipient: a.id, body: "Reproduce the difficult seed" },
      lead.token,
    );
    await f.call("subscribe", { topicId: t.id, enabled: true }, a.token);
    f.advance(61000);
    await f.call(
      "session.replace",
      {
        oldSessionId: a.id,
        newSessionId: b.id,
        reason: "Original process exited",
      },
      lead.token,
    );
    const next = read(
      f.service,
      "/v1/me/next",
      new URLSearchParams(),
      await f.service.actor(b.token),
    ) as any;
    assert(next.obligations.some((i: any) => i.id === request.id));
    assert(next.session.roles.includes("reviewer"));
    await assert.rejects(
      f.call("post.create", { topicId: t.id, body: "Old identity" }, a.token),
      { code: "session_left" },
    );
    const id = "leave-test";
    await f.call("session.leave", {}, b.token, id);
    assert.equal((await f.call("session.leave", {}, b.token, id)).id, b.id);
  } finally {
    f.close();
  }
});
