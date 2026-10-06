import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { json, command, runtime, home } from "../src/cli/connection.js";
import { artifact } from "../src/cli/operations.js";
if (!process.env.SITU_HOME)
  throw new Error("Set SITU_HOME to a disposable example runtime");
const admin = await json(join(runtime, "admin.json"));
await command(
  "project.create",
  {
    id: "example",
    title: "Navigation study · example",
    goal: "Synthetic observer fixture. These are not real research results.",
    focus: "Test whether corridor failures come from turning or memory",
  },
  admin,
);
const members = [];
for (const [name, roles] of [
  ["Coordinator", ["coordinator"]],
  ["Baseline worker", ["worker"]],
  ["Independent reviewer", ["worker", "reviewer"]],
  ["Project curator", ["curator"]],
] as const) {
  const token = randomUUID() + randomUUID();
  const s = await command(
    "session.join",
    { projectId: "example", name, token },
    admin,
  );
  await command("session.grant", { sessionId: s.id, roles }, admin);
  members.push({ ...admin, token, sessionId: s.id, projectId: "example" });
}
const t = await command(
  "topic.create",
  {
    projectId: "example",
    title: "Establish a fixed scenario baseline",
    brief:
      "Compare open rooms and corridors on the same held-out seeds. Keep inference cost fixed.",
  },
  members[1],
);
const child = await command(
  "topic.create",
  {
    projectId: "example",
    title: "Isolate memory from turning",
    brief: "Hold corridor geometry fixed and vary cue delay.",
    parentId: t.id,
  },
  members[1],
);
const sample = join(home, "fixture.json");
await writeFile(
  sample,
  JSON.stringify({ synthetic: true, observation: "Example fixture only" }),
);
const evidence = await artifact(sample, "Synthetic scenario receipt");
const plan = {
  question: "Are failures concentrated in corridors?",
  prediction: "Corridors will have more failed episodes than open rooms",
  test: "Compare identical frozen seeds across scenario groups",
  falsifier: "Failure rates are similar after matching episode length",
  next: "Inspect the first three failure trajectories",
  source: "synthetic observer fixture",
  budget: "Example only; no experiment launched",
};
let w = await command(
  "work.propose",
  { topicId: t.id, title: "Measure the scenario baseline", plan },
  members[1],
);
w = await command(
  "work.admit",
  {
    workId: w.id,
    expectedRevision: w.revision,
    reason: "Bounded baseline fixture",
  },
  members[0],
);
w = await command(
  "work.start",
  { workId: w.id, expectedRevision: w.revision },
  members[1],
);
w = await command(
  "work.checkpoint",
  {
    workId: w.id,
    generation: w.generation,
    planRevision: 1,
    observed:
      "The example highlights where a paired scenario report would be attached.",
    next: "Compare the difficult trajectories",
    continueReason: "The aggregate does not distinguish the cause",
    evidence: [evidence],
  },
  members[1],
);
w = await command(
  "work.finish",
  {
    workId: w.id,
    generation: w.generation,
    outcome: "result",
    summary:
      "Synthetic example: a corridor gap motivates a controlled follow-up.",
    evidence: [evidence],
  },
  members[1],
);
let review = await command(
  "review.submit",
  {
    workId: w.id,
    expectedRevision: w.revision,
    claim: "Example: corridor failures warrant a matched control",
    evidence: [evidence],
  },
  members[1],
);
await command(
  "review.decide",
  {
    reviewId: review.id,
    expectedRevision: review.revision,
    decision: "accepted",
    rationale:
      "Fixture demonstrates an independent review. This is not an experimental conclusion.",
    evidence: [evidence],
  },
  members[2],
);
let active = await command(
  "work.propose",
  {
    topicId: child.id,
    title: "Compare short and delayed cues",
    plan: {
      ...plan,
      prediction: "Longer cue delay increases identity errors",
      next: "Run the matched delay control",
    },
  },
  members[1],
);
active = await command(
  "work.admit",
  {
    workId: active.id,
    expectedRevision: active.revision,
    reason: "One controlled follow-up",
  },
  members[0],
);
active = await command(
  "work.start",
  { workId: active.id, expectedRevision: active.revision },
  members[1],
);
await command(
  "post.create",
  {
    topicId: child.id,
    body: "Keep turn count fixed while changing cue delay. A difference in both would leave the cause ambiguous.",
  },
  members[2],
);
const p = await fetch(admin.endpoint + "/v1/projects/example").then((r) =>
  r.json(),
);
await command(
  "project.update",
  {
    projectId: "example",
    expectedRevision: p.project.revision,
    brief:
      "The baseline branch is complete in this synthetic fixture. One follow-up separates memory retention from navigation difficulty. The next useful evidence is a matched delay comparison, followed by independent replication.",
    sources: [w.id, active.id],
  },
  members[3],
);
console.log(
  JSON.stringify({
    project: admin.endpoint + "/#/projects/example",
    topic: child.id,
    work: w.id,
    active: active.id,
  }),
);
