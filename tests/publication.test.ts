import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.js";
import {
  publicationView,
  currentRelease,
  draft,
  validateDocument,
} from "../src/server/publication/index.js";
import { dataset } from "../src/protocol/artifacts.js";
import type {
  PublicationDocument,
  SourceSnapshot,
} from "../src/protocol/publication/index.js";

function document(snapshotId: string): PublicationDocument {
  const source = {
    snapshotId,
    recordId: "p",
    relationship: "context" as const,
  };
  return {
    schemaVersion: 1,
    figures: [],
    updates: [],
    pages: [
      {
        id: "now",
        template: "overview",
        title: "A controlled baseline first",
        summary: { text: "We are establishing a baseline.", sources: [source] },
        sections: [
          {
            id: "plan",
            blocks: [
              {
                id: "next",
                kind: "next-test",
                text: "Measure the frozen scenarios.",
                sources: [source],
              },
            ],
          },
        ],
        archived: false,
      },
    ],
  };
}
test("publication releases pin evidence, reject conflicting writers, and keep drafts private to the draft view", async () => {
  const f = fixture();
  try {
    await f.init();
    const curator = await f.join("curator", ["curator"]),
      worker = await f.join("worker");
    const source = await f.call(
      "publication.capture",
      { projectId: "p" },
      curator.token,
    );
    const input = {
      projectId: "p",
      snapshotId: source.id,
      expectedRevision: source.draftRevision,
      baseRelease: 0,
      document: document(source.id),
    };
    await assert.rejects(
      f.call("publication.save", input, worker.token),
      /Requires curator/,
    );
    await assert.rejects(
      f.call(
        "topic.create",
        { projectId: "p", title: "No research writes", brief: "No" },
        curator.token,
      ),
      /Requires/,
    );
    const saved = await f.call("publication.save", input, curator.token);
    assert.equal(publicationView(f.db, "p", 1).release, null);
    assert.equal(
      publicationView(f.db, "p", 1, undefined, true).release?.document.pages[0]
        .title,
      input.document.pages[0].title,
    );
    await assert.rejects(
      f.call("publication.save", input, curator.token),
      /Draft revision/,
    );
    const publish = {
      projectId: "p",
      expectedRevision: saved.revision,
      expectedRelease: 0,
    };
    const first = await f.call(
      "publication.publish",
      publish,
      curator.token,
      "publish-once",
    );
    assert.equal(
      (
        await f.call(
          "publication.publish",
          publish,
          curator.token,
          "publish-once",
        )
      ).revision,
      1,
    );
    assert.equal(first.through, source.through);
    await assert.rejects(
      f.call("publication.publish", publish, curator.token),
      /Draft revision/,
    );
    await f.call("project.update", {
      projectId: "p",
      expectedRevision: 1,
      focus: "A new controlled question",
    });
    const view = publicationView(f.db, "p", 1);
    assert(view.freshness.pending > 0);
    assert(view.freshness.changedSources.includes("p"));
    assert.equal(view.sources[source.id].records.p.focus, "Baseline first");
    const next = draft(f.db, "p")!;
    await f.call(
      "publication.save",
      {
        ...input,
        expectedRevision: next.revision,
        baseRelease: 1,
        document: {
          ...input.document,
          pages: [{ ...input.document.pages[0], title: "Unpublished change" }],
        },
      },
      curator.token,
    );
    assert.equal(
      currentRelease(f.db, "p")?.document.pages[0].title,
      first.document.pages[0].title,
    );
  } finally {
    f.close();
  }
});
test("curation notifications coalesce, exclude presence, and retain changes newer than the published snapshot", async () => {
  const f = fixture();
  try {
    const topic = await f.init();
    const curator = await f.join("curator", ["curator"]),
      worker = await f.join("worker");
    const source = await f.call(
      "publication.capture",
      { projectId: "p" },
      curator.token,
    );
    const count = () =>
      f.db.storage.query(
        "SELECT * FROM inbox WHERE kind='curation' AND state='open'",
      );
    await f.call(
      "post.create",
      { topicId: topic.id, body: "A meaningful observation" },
      worker.token,
    );
    await f.call(
      "post.create",
      { topicId: topic.id, body: "A follow-up" },
      worker.token,
    );
    assert.equal(count().length, 1);
    const save = await f.call(
      "publication.save",
      {
        projectId: "p",
        snapshotId: source.id,
        expectedRevision: source.draftRevision,
        baseRelease: 0,
        document: document(source.id),
      },
      curator.token,
    );
    await f.call(
      "publication.publish",
      { projectId: "p", expectedRevision: save.revision, expectedRelease: 0 },
      curator.token,
    );
    assert.equal(count().length, 1);
    const newer = await f.call(
      "publication.capture",
      { projectId: "p", after: source.through },
      curator.token,
    );
    const d = draft(f.db, "p")!;
    const updated = await f.call(
      "publication.save",
      {
        projectId: "p",
        snapshotId: newer.id,
        expectedRevision: d.revision,
        baseRelease: 1,
        document: document(newer.id),
      },
      curator.token,
    );
    await f.call(
      "publication.publish",
      {
        projectId: "p",
        expectedRevision: updated.revision,
        expectedRelease: 1,
      },
      curator.token,
    );
    assert.equal(count().length, 0);
    await f.call("session.heartbeat", {}, worker.token);
    assert.equal(count().length, 0);
    assert.equal(publicationView(f.db, "p", 1).freshness.pending, 0);
  } finally {
    f.close();
  }
});
test("publication links survive archiving; published updates require explicit corrections", async () => {
  const f = fixture();
  try {
    await f.init();
    const s = await f.call("publication.capture", { projectId: "p" });
    const doc = document(s.id);
    doc.pages.push({
      ...doc.pages[0],
      id: "question",
      template: "question",
      title: "Does balancing help?",
    });
    doc.updates.push({
      id: "first",
      pageIds: ["question"],
      kind: "result",
      headline: "No measurement yet",
      body: "The baseline is pending.",
      occurredAt: 1000000,
      sources: doc.pages[0].summary.sources,
    });
    let d = await f.call("publication.save", {
      projectId: "p",
      snapshotId: s.id,
      expectedRevision: s.draftRevision,
      baseRelease: 0,
      document: doc,
    });
    await f.call("publication.publish", {
      projectId: "p",
      expectedRevision: d.revision,
      expectedRelease: 0,
    });
    d = draft(f.db, "p")!;
    const broken = structuredClone(doc);
    broken.updates[0].body = "Rewrite history";
    assert(
      validateDocument(broken, { [s.id]: s }, doc).some((i) =>
        i.message.includes("immutable"),
      ),
    );
    broken.pages.pop();
    assert(
      validateDocument(broken, { [s.id]: s }, doc).some((i) =>
        i.message.includes("archive"),
      ),
    );
    await f.call("publication.archive", {
      projectId: "p",
      pageId: "question",
      expectedRevision: d.revision,
      expectedRelease: 1,
      reason: "This question is superseded by a narrower test.",
    });
    assert.equal(currentRelease(f.db, "p")?.document.pages[1].archived, true);
    assert.equal(
      currentRelease(f.db, "p", 1)?.document.pages[1].archived,
      false,
    );
    assert.equal(currentRelease(f.db, "p")?.document.updates.length, 2);
  } finally {
    f.close();
  }
});
test("figure validation rejects incompatible cohorts, invented timelines and mismatched replays", () => {
  const doc = document("s");
  const data = dataset.parse({
    schema: "situ.dataset.v1",
    metric: "success",
    unit: "fraction",
    direction: "higher",
    cohortId: "frozen-v1",
    evaluatorVersion: "eval1",
    environmentVersion: "env1",
    series: [
      {
        id: "baseline",
        label: "Baseline",
        seed: "1",
        values: [{ scenario: "corridor", value: 0, n: 20 }],
      },
    ],
  });
  const sources: Record<string, SourceSnapshot> = {
    s: {
      id: "s",
      projectId: "p",
      through: 1,
      capturedAt: 1,
      records: {
        p: { kind: "project", createdAt: 1 },
        a: { kind: "asset", dataset: data },
        b: {
          kind: "asset",
          dataset: {
            ...data,
            cohortId: "different",
            series: [{ ...data.series[0], id: "candidate" }],
          },
        },
        v1: {
          kind: "asset",
          mediaType: "video/mp4",
          replay: {
            seed: "1",
            scenario: "corridor",
            environmentVersion: "env1",
            duration: 10,
          },
        },
        v2: {
          kind: "asset",
          mediaType: "video/mp4",
          replay: {
            seed: "2",
            scenario: "corridor",
            environmentVersion: "env1",
            duration: 10,
          },
        },
      },
    },
  };
  const ref = (recordId: string) => ({
    snapshotId: "s",
    recordId,
    relationship: "supports" as const,
  });
  doc.figures.push({
    id: "scores",
    kind: "comparison",
    title: "Scores",
    caption: "Matched comparison",
    sources: [ref("a"), ref("b")],
    assetIds: ["a", "b"],
    baseline: "baseline",
  });
  doc.figures.push({
    id: "timeline",
    kind: "timeline",
    title: "History",
    caption: "Source timestamps",
    sources: [ref("p")],
    lanes: [{ id: "l", label: "Baseline" }],
    items: [
      {
        id: "i",
        label: "Event",
        laneId: "l",
        source: ref("p"),
        startField: "updatedAt",
      },
    ],
  });
  doc.figures.push({
    id: "replay",
    kind: "replay",
    title: "Matched",
    caption: "Compare",
    sources: [ref("v1"), ref("v2")],
    left: { assetId: "v1", start: 0, end: 5 },
    right: { assetId: "v2", start: 0, end: 5 },
    alignment: "matched",
  });
  const issues = validateDocument(doc, sources);
  assert(issues.some((i) => i.message.includes("cohort")));
  assert(issues.some((i) => i.message.includes("timestamps")));
  assert(issues.some((i) => i.message.includes("same seed")));
  assert.equal(data.series[0].values[0].value, 0);
  assert.throws(() =>
    dataset.parse({
      ...data,
      series: [
        { ...data.series[0], values: [{ scenario: "x", value: 0.5, n: 0 }] },
      ],
    }),
  );
});
test("source scopes cannot cross projects and challenged acceptance cannot be republished", async () => {
  const f = fixture();
  try {
    const topic = await f.init();
    const worker = await f.join("worker"),
      reviewer = await f.join("reviewer", ["reviewer"]);
    const evidence = {
      uri: "file:///tmp/proof.json",
      sha256: "a".repeat(64),
      title: "Matched result",
    };
    let work = await f.ready(topic, worker);
    work = await f.call(
      "work.finish",
      {
        workId: work.id,
        generation: work.generation,
        outcome: "negative",
        summary: "No measured gain",
        evidence: [evidence],
      },
      worker.token,
    );
    let review = await f.call(
      "review.submit",
      {
        workId: work.id,
        expectedRevision: work.revision,
        claim: "No gain on this cohort",
        evidence: [evidence],
      },
      worker.token,
    );
    review = await f.call(
      "review.decide",
      {
        reviewId: review.id,
        expectedRevision: review.revision,
        decision: "accepted",
        rationale: "Independent reproduction agrees",
        evidence: [evidence],
      },
      reviewer.token,
    );
    const source = await f.call("publication.capture", {
      projectId: "p",
      recordIds: [review.id, work.id],
    });
    assert(!source.records[topic.id]);
    assert(source.records.p);
    const doc = document(source.id);
    const r = {
      snapshotId: source.id,
      recordId: review.id,
      relationship: "supports" as const,
    };
    doc.pages[0].sections[0].blocks = [
      {
        id: "claim",
        kind: "statement",
        stance: "interpretation",
        text: "No gain on the frozen cohort",
        sources: [r],
        acceptedReview: r,
      },
    ];
    let saved = await f.call("publication.save", {
      projectId: "p",
      snapshotId: source.id,
      expectedRevision: source.draftRevision,
      baseRelease: 0,
      document: doc,
    });
    await f.call("publication.publish", {
      projectId: "p",
      expectedRevision: saved.revision,
      expectedRelease: 0,
    });
    await f.call(
      "review.challenge",
      {
        reviewId: review.id,
        reason: "The positive control exposed an evaluator bug",
        evidence: [{ ...evidence, sha256: "b".repeat(64) }],
      },
      worker.token,
    );
    saved = draft(f.db, "p")!;
    await assert.rejects(
      f.call("publication.publish", {
        projectId: "p",
        expectedRevision: saved.revision,
        expectedRelease: 1,
      }),
      { code: "invalid_publication" },
    );
    assert.equal(currentRelease(f.db, "p")?.revision, 1);
    assert(
      publicationView(f.db, "p", 1).freshness.changedSources.includes(
        review.id,
      ),
    );
    await f.call("project.create", {
      id: "other",
      title: "Other",
      goal: "Other",
      focus: "Other",
    });
    await assert.rejects(
      f.call("publication.capture", {
        projectId: "other",
        recordIds: [work.id],
      }),
      { code: "missing_record" },
    );
  } finally {
    f.close();
  }
});
