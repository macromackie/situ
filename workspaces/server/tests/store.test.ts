import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { commandSchema, contextBrief } from "../../core/src/index";
import { ResearchStore } from "../src/store";

function setup() {
  const db = new DatabaseSync(":memory:");
  const store = new ResearchStore(
    (sql, ...bindings) => db.prepare(sql).all(...bindings),
    (work) => {
      db.exec("BEGIN");
      try {
        const result = work();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  );
  const send = (value: object, requestId: string = crypto.randomUUID()) =>
    store.apply(commandSchema.parse({ ...value, actor: "test", requestId }));
  send({
    type: "project.create",
    project: { id: "project", title: "Research" },
  });
  return { db, store, send };
}

test("concurrent research preserves evidence, rejects stale edits, and makes retries idempotent", () => {
  const { db, store, send } = setup();
  try {
    const create = {
      type: "record.create",
      record: {
        id: "experiment",
        projectId: "project",
        kind: "experiment",
        title: "A test",
        body: "Original evidence",
        tags: ["important"],
      },
    };
    const first = send(create, "same-command");
    assert.deepEqual(send(create, "same-command"), first);
    assert.throws(
      () =>
        send(
          { ...create, record: { ...create.record, title: "Changed" } },
          "same-command",
        ),
      /already used/,
    );
    send({
      type: "record.update",
      id: "experiment",
      revision: 1,
      patch: { title: "Refined question" },
    });
    assert.equal(store.record("experiment").body, "Original evidence");
    assert.deepEqual(store.record("experiment").tags, ["important"]);
    assert.throws(
      () =>
        send({
          type: "record.update",
          id: "experiment",
          revision: 1,
          patch: { body: "Would lose newer edits" },
        }),
      /Revision conflict/,
    );
    assert.equal(store.changes(0, "experiment")[0].record!.title, "A test");
    send({
      type: "record.create",
      record: {
        id: "child",
        projectId: "project",
        kind: "run",
        title: "Child",
        links: [{ target: "experiment", relation: "derived_from" }],
      },
    });
    assert.equal(store.record("child").links[0].revision, 2);
    assert.equal(store.record("experiment", 1).title, "A test");
    assert.throws(
      () =>
        send({
          type: "record.update",
          id: "experiment",
          revision: 2,
          patch: { links: [{ target: "child", relation: "derived_from" }] },
        }),
      /cycle/,
    );
    send({
      type: "record.update",
      id: "experiment",
      revision: 2,
      patch: { links: [{ target: "child", relation: "related" }] },
    });
    assert.equal(store.record("experiment").revision, 3);
  } finally {
    db.close();
  }
});

test("measurement batches are atomic and briefs retain conflicting evidence", () => {
  const { db, store, send } = setup();
  try {
    send({
      type: "record.create",
      record: {
        id: "run",
        projectId: "project",
        kind: "run",
        title: "Longer history",
      },
    });
    const sample = {
      recordId: "run",
      metric: "success",
      cohort: "held-out-v1",
      step: 0,
      value: 0.5,
    };
    const receipt = send(
      { type: "samples.append", samples: [sample] },
      "measure",
    );
    assert.deepEqual(
      send({ type: "samples.append", samples: [sample] }, "measure"),
      receipt,
    );
    assert.throws(
      () =>
        send({
          type: "samples.append",
          samples: [{ ...sample, step: 1 }, sample],
        }),
      /already exists/,
    );
    assert.equal(store.snapshot().sampleCount, 1);
    send({
      type: "record.create",
      record: {
        id: "finding",
        projectId: "project",
        kind: "finding",
        title: "No improvement on navigation",
        body: "Null result on a narrow cohort",
        assessment: "inconclusive",
        links: [{ target: "run", relation: "contradicts" }],
      },
    });
    send({
      type: "record.create",
      record: {
        id: "experiment",
        projectId: "project",
        kind: "experiment",
        title: "Longer history experiment",
      },
    });
    send({
      type: "record.create",
      record: {
        id: "hypothesis",
        projectId: "project",
        kind: "note",
        title: "Compare matching conditions",
        links: [
          { target: "experiment", relation: "related" },
          { target: "run", relation: "related" },
        ],
      },
    });
    for (let index = 0; index < 40; index++) {
      send({
        type: "record.create",
        record: {
          id: `stage-${index}`,
          projectId: "project",
          kind: "run",
          title: `Stage ${index}`,
          links: [{ target: "experiment", relation: "related" }],
        },
      });
    }
    const brief = contextBrief(store.snapshot(), "project", "history");
    assert.equal(brief.findings[0].id, "finding");
    assert.equal(brief.findings[0].links[0].relation, "contradicts");
    for (const id of ["experiment", "hypothesis", "run"]) {
      assert.ok(brief.other.some((record) => record.id === id));
    }
    assert.deepEqual(brief.omitted, { findings: 0, active: 0, other: 13 });
    const byId = contextBrief(store.snapshot(), "project", "run");
    assert.deepEqual(
      new Set(byId.other.map((record) => record.id)),
      new Set(["run", "hypothesis"]),
    );
    assert.equal(byId.findings[0].links[0].relation, "contradicts");
    assert.equal(store.samples("run", 0).length, 1);
  } finally {
    db.close();
  }
});
