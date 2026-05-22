import { expect, test } from "bun:test";

import { collectOverfitEvidence } from "./overfit-evidence.js";

test("flags accepted experiments with suspicious dev and held-out accuracy gaps", () => {
  const evidence = collectOverfitEvidence({
    experiments: [
      {
        id: "experiment_dev_lookup",
        title: "Dev-trained frontier",
        status: "accepted",
      },
    ],
    measurements: [
      {
        experimentId: "experiment_dev_lookup",
        metricName: "dev_accuracy",
        numericValue: 1,
      },
      {
        experimentId: "experiment_dev_lookup",
        metricName: "final_accuracy",
        numericValue: 0.785,
      },
    ],
  });

  expect(evidence.ok).toBe(false);
  expect(evidence.acceptedOverfitRiskCount).toBe(1);
  expect(evidence.acceptedOverfitRiskExperimentIds).toEqual(["experiment_dev_lookup"]);
  expect(evidence.acceptedOverfitRisks[0]).toEqual({
    experimentId: "experiment_dev_lookup",
    devMetricName: "dev_accuracy",
    devValue: 1,
    heldoutMetricName: "final_accuracy",
    heldoutValue: 0.785,
    gap: 0.21499999999999997,
    reasons: [
      "near-perfect-dev-with-heldout-gap",
      "large-dev-heldout-gap",
      "dev-label-leakage-mentioned",
    ],
  });
});

test("does not flag risky experiments that are not accepted", () => {
  const evidence = collectOverfitEvidence({
    experiments: [
      {
        id: "experiment_watch",
        title: "Dev-trained frontier",
        status: "ready_for_review",
      },
      {
        id: "experiment_rejected",
        title: "Lookup table",
        status: "rejected",
      },
    ],
    measurements: [
      {
        experimentId: "experiment_watch",
        metricName: "dev_accuracy",
        numericValue: 1,
      },
      {
        experimentId: "experiment_watch",
        metricName: "heldout_accuracy",
        numericValue: 0.78,
      },
      {
        experimentId: "experiment_rejected",
        metricName: "dev_accuracy",
        numericValue: 1,
      },
      {
        experimentId: "experiment_rejected",
        metricName: "final_accuracy",
        numericValue: 0.78,
      },
    ],
  });

  expect(evidence).toEqual({
    ok: true,
    acceptedOverfitRiskCount: 0,
    acceptedOverfitRiskExperimentIds: [],
    acceptedOverfitRisks: [],
  });
});

test("can keep evidence while allowing explicit dev-only acceptance cases", () => {
  const evidence = collectOverfitEvidence({
    allowAcceptedOverfitRisk: true,
    experiments: [
      {
        id: "experiment_dev_only",
        status: "accepted",
      },
    ],
    measurements: [
      {
        experimentId: "experiment_dev_only",
        metricName: "dev_score",
        numericValue: 0.98,
      },
      {
        experimentId: "experiment_dev_only",
        metricName: "test_score",
        numericValue: 0.7,
      },
    ],
  });

  expect(evidence.ok).toBe(true);
  expect(evidence.acceptedOverfitRiskCount).toBe(1);
  expect(evidence.acceptedOverfitRiskExperimentIds).toEqual(["experiment_dev_only"]);
});
