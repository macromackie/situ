import { send } from "../workspaces/cli/src/client";
const actor = "example-agent";
let sequence = 0;
const submit = (value: object) =>
  send({ ...value, requestId: `demo-${sequence++}`, actor });
await submit({
  type: "project.create",
  project: {
    id: "demo",
    title: "Policy research · demo",
    description:
      "Synthetic example data. Explore parallel experiments, shared evidence, and model lineage.",
  },
});
const create = (id: string, kind: string, title: string, rest: object = {}) =>
  submit({
    type: "record.create",
    record: { id, projectId: "demo", kind, title, ...rest },
  });
await create(
  "question-history",
  "question",
  "What helps agents navigate unfamiliar maps?",
  {
    body: "We are testing whether observation history or a broader scenario curriculum improves navigation. Compare only within the same evaluation cohort.\n\nThese measurements illustrate the interface; they are not paintbot results.",
    state: "active",
    tags: ["navigation"],
  },
);
await create("exp-baseline", "experiment", "Establish a compact baseline", {
  state: "done",
  body: "Train a small policy with the existing observation window. Use this as the shared control for the next experiments.",
  links: [{ target: "question-history", relation: "related" }],
  tags: ["baseline"],
});
await create("exp-history", "experiment", "Extend observation history", {
  state: "active",
  body: "Keep the model and training budget fixed. Increase the history window to test whether partial observability limits navigation.",
  links: [
    { target: "exp-baseline", relation: "derived_from" },
    { target: "question-history", relation: "related" },
  ],
  tags: ["memory"],
});
await create(
  "exp-curriculum",
  "experiment",
  "Broaden the scenario curriculum",
  {
    state: "active",
    body: "Sample more short navigation problems before training on complete games. Evaluate against the same held-out maps as the control.",
    links: [
      { target: "exp-baseline", relation: "derived_from" },
      { target: "question-history", relation: "related" },
    ],
    tags: ["data"],
  },
);
for (const [index, label] of [
  "Baseline",
  "Longer history",
  "Scenario curriculum",
].entries()) {
  const parent = ["exp-baseline", "exp-history", "exp-curriculum"][index];
  await create(`run-${index}`, "run", `${label} · seed 7`, {
    state: "done",
    body: "Illustrative run. All values are synthetic, with no external training job attached.",
    links: [{ target: parent, relation: "derived_from" }],
    metadata: {
      source: "synthetic-example",
      seed: 7,
      evaluation: "demo-navigation-v1",
    },
    tags: ["synthetic"],
  });
  await submit({
    type: "samples.append",
    samples: Array.from({ length: 13 }, (_, step) => ({
      recordId: `run-${index}`,
      metric: "Navigation success",
      cohort: "demo-navigation-v1",
      direction: "higher",
      unit: "rate",
      step: step * 100,
      value: Number(
        (
          0.18 +
          (0.27 + index * 0.09) * (1 - Math.exp(-step / 4)) +
          Math.sin(step + index) * 0.012
        ).toFixed(3),
      ),
    })),
  });
}
await create(
  "finding-curriculum",
  "finding",
  "Broader scenarios are worth reproducing",
  {
    body: "In this synthetic example, curriculum coverage shows the largest improvement. A single seed is not enough to conclude that it will generalize. Next: reproduce across several seeds.",
    assessment: "promising",
    state: "open",
    links: [
      { target: "run-2", relation: "supports" },
      { target: "question-history", relation: "related" },
    ],
    tags: ["synthetic"],
  },
);
await create(
  "finding-history",
  "finding",
  "History gains need a stronger control",
  {
    body: "The synthetic history run improves on the baseline, but the comparison does not isolate extra input capacity. Match the compute budget before attributing the gain to memory.",
    assessment: "inconclusive",
    links: [
      { target: "run-1", relation: "related" },
      { target: "question-history", relation: "related" },
    ],
    tags: ["synthetic"],
  },
);
await create("note-next", "note", "Try harder held-out maps", {
  body: "The next pass should test whether these gains survive a shift in map layout. Keep this as a separate cohort so the charts cannot mix the two evaluations.",
  links: [{ target: "exp-curriculum", relation: "related" }],
});
console.log("Demo ready: /projects/demo. All demo measurements are synthetic.");
