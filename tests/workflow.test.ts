import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture, artifact, plan } from "./helpers.js";
import { read } from "../src/server/reads.js";
test("30 workers join independently; exact retries do not duplicate research", async () => {
  const f = fixture();
  try {
    const t = await f.init();
    const workers = await Promise.all(
      Array.from({ length: 30 }, (_, i) => f.join("worker-" + i)),
    );
    assert.equal(new Set(workers.map((w) => w.id)).size, 30);
    const id = randomUUID(),
      input = { topicId: t.id, body: "A reproducible observation" };
    const a = await f.call("post.create", input, workers[0].token, id),
      b = await f.call("post.create", input, workers[0].token, id);
    assert.equal(a.id, b.id);
    assert.equal(f.db.list("p", "post").length, 1);
    await assert.rejects(
      f.call(
        "post.create",
        { ...input, body: "Different content" },
        workers[0].token,
        id,
      ),
      { code: "id_reused" },
    );
    await assert.rejects(
      f.call(
        "project.update",
        { projectId: "p", expectedRevision: 1, focus: "Everything" },
        workers[0].token,
      ),
      { code: "forbidden" },
    );
  } finally {
    f.close();
  }
});
test("reading requests does not resolve them; ordinary subscriptions coalesce without losing requests", async () => {
  const f = fixture();
  try {
    const t = await f.init(),
      a = await f.join("a"),
      b = await f.join("b");
    await f.call("subscribe", { topicId: t.id, enabled: true }, b.token);
    for (let i = 0; i < 4; i++)
      await f.call(
        "post.create",
        { topicId: t.id, body: "Observation " + i },
        a.token,
      );
    const req = await f.call(
      "request.create",
      { topicId: t.id, recipient: b.id, body: "Please reproduce seed 2" },
      a.token,
    );
    await f.call("inbox.read", { ids: [req.id] }, b.token);
    const inbox = read(
      f.service,
      "/v1/me/inbox",
      new URLSearchParams(),
      await f.service.actor(b.token),
    ) as any;
    assert.equal(inbox.items.length, 2);
    assert.equal(
      inbox.items.find((i: any) => i.kind === "request").state,
      "open",
    );
    assert.equal(
      inbox.items.find((i: any) => i.kind === "digest").data.count,
      4,
    );
    await f.call(
      "inbox.defer",
      { id: req.id, reason: "After current run", seconds: 60 },
      b.token,
    );
    let next = read(
      f.service,
      "/v1/me/next",
      new URLSearchParams(),
      await f.service.actor(b.token),
    ) as any;
    assert.equal(next.deferred, 1);
    f.advance(61000);
    next = read(
      f.service,
      "/v1/me/next",
      new URLSearchParams(),
      await f.service.actor(b.token),
    ) as any;
    assert(next.obligations.some((i: any) => i.id === req.id));
    await f.call(
      "inbox.resolve",
      {
        id: req.id,
        response: "Reproduced; attached to work",
        disposition: "answered",
      },
      b.token,
    );
    assert.equal(
      f.db.storage.query(
        "SELECT * FROM inbox WHERE recipient=? AND kind='response'",
        a.id,
      ).length,
      1,
    );
  } finally {
    f.close();
  }
});
test("conclusion acceptance requires independent review of frozen evidence and policy", async () => {
  const f = fixture();
  try {
    const t = await f.init(),
      a = await f.join("a", ["worker", "reviewer"]),
      b = await f.join("b", ["reviewer"]);
    let w = await f.ready(t, a);
    w = await f.call(
      "work.finish",
      {
        workId: w.id,
        generation: w.generation,
        outcome: "negative",
        summary: "The predicted gain did not appear",
        evidence: [artifact],
      },
      a.token,
    );
    const r = await f.call(
      "review.submit",
      {
        workId: w.id,
        expectedRevision: w.revision,
        claim: "Balancing alone did not improve matched accuracy",
        evidence: [artifact],
      },
      a.token,
    );
    const decision = {
      reviewId: r.id,
      expectedRevision: r.revision,
      decision: "accepted",
      rationale: "Independently repeated the same frozen evaluation",
      evidence: [artifact],
    };
    await assert.rejects(f.call("review.decide", decision, a.token), {
      code: "independent_review",
    });
    const accepted = await f.call("review.decide", decision, b.token);
    assert.equal(accepted.state, "accepted");
    assert.equal(accepted.workSnapshot.plan.prediction, plan.prediction);
    const challenged = await f.call(
      "review.challenge",
      {
        reviewId: r.id,
        reason: "A longer context reverses the result",
        evidence: [{ ...artifact, sha256: "b".repeat(64) }],
      },
      a.token,
    );
    assert.equal(challenged.state, "challenged");
    assert.equal(challenged.decisions.length, 1);
  } finally {
    f.close();
  }
});
test("focus and review backpressure block new commitments, not evidence collection", async () => {
  const f = fixture();
  try {
    const t = await f.init(),
      a = await f.join("a"),
      b = await f.join("b");
    const p = f.db.get("p");
    await f.call("project.update", {
      projectId: "p",
      expectedRevision: p.revision,
      policy: { ...p.policy, maxActiveWork: 1 },
    });
    await f.ready(t, a);
    let w = await f.call(
      "work.propose",
      { topicId: t.id, title: "Another test", plan },
      b.token,
    );
    w = await f.call("work.admit", {
      workId: w.id,
      expectedRevision: w.revision,
      reason: "Next in the queue",
    });
    await assert.rejects(
      f.call(
        "work.start",
        { workId: w.id, expectedRevision: w.revision },
        b.token,
      ),
      { code: "capacity_unavailable" },
    );
    const post = await f.call(
      "post.create",
      {
        topicId: t.id,
        body: "Counterexample still worth recording",
        evidence: [artifact],
      },
      b.token,
    );
    assert(post.id);
  } finally {
    f.close();
  }
});
test("cross-project writes and nested reply trees are rejected", async () => {
  const f = fixture();
  try {
    const t = await f.init(),
      a = await f.join("a");
    await f.call("project.create", {
      id: "other",
      title: "Other",
      goal: "Other",
      focus: "Other",
    });
    const other = await f.call("topic.create", {
      projectId: "other",
      title: "Other",
      brief: "Other",
    });
    await assert.rejects(
      f.call(
        "post.create",
        { topicId: other.id, body: "Wrong scope" },
        a.token,
      ),
      { code: "forbidden" },
    );
    const p = await f.call(
      "post.create",
      { topicId: t.id, body: "Root" },
      a.token,
    );
    const r = await f.call(
      "post.create",
      { topicId: t.id, body: "Reply", replyTo: p.id },
      a.token,
    );
    await assert.rejects(
      f.call(
        "post.create",
        { topicId: t.id, body: "Deep reply", replyTo: r.id },
        a.token,
      ),
      { code: "reply_depth" },
    );
  } finally {
    f.close();
  }
});

test("event catch-up retains every event while the observer tail includes the newest", async () => {
  const f = fixture();
  try {
    const t = await f.init();
    for (let i = 0; i < 12; i++) {
      await f.call("post.create", { topicId: t.id, body: `Observation ${i}` });
    }
    const all = read(
      f.service,
      "/v1/events",
      new URLSearchParams({ project: "p", limit: "100" }),
      "admin",
    ) as any;
    const tail = read(
      f.service,
      "/v1/events",
      new URLSearchParams({ project: "p", limit: "5", tail: "1" }),
      "admin",
    ) as any;
    assert.deepEqual(tail.items, all.items.slice(-5));
    assert.equal(tail.after, all.after);
    const collected: any[] = [];
    let after = 0;
    for (;;) {
      const page = read(
        f.service,
        "/v1/events",
        new URLSearchParams({ project: "p", limit: "5", after: String(after) }),
        "admin",
      ) as any;
      collected.push(...page.items);
      after = page.after;
      if (!page.hasMore) break;
    }
    assert.deepEqual(collected, all.items);
  } finally {
    f.close();
  }
});
