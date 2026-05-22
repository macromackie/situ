export type OverfitExperimentInput = {
  readonly id?: string;
  readonly title?: string;
  readonly status?: string;
  readonly summaryMarkdown?: string;
};

export type OverfitMeasurementInput = {
  readonly experimentId?: string;
  readonly metricName?: string;
  readonly numericValue?: number;
  readonly summaryMarkdown?: string;
};

export type OverfitRisk = {
  readonly experimentId: string;
  readonly devMetricName: string;
  readonly devValue: number;
  readonly heldoutMetricName?: string;
  readonly heldoutValue?: number;
  readonly gap?: number;
  readonly reasons: readonly string[];
};

export type OverfitEvidence = {
  readonly ok: boolean;
  readonly acceptedOverfitRiskCount: number;
  readonly acceptedOverfitRiskExperimentIds: readonly string[];
  readonly acceptedOverfitRisks: readonly OverfitRisk[];
};

const nearPerfectDevThreshold = 0.995;
const nearPerfectHeldoutGapThreshold = 0.1;
const largeDevThreshold = 0.9;
const largeHeldoutGapThreshold = 0.2;

export function collectOverfitEvidence(input: {
  readonly experiments: readonly OverfitExperimentInput[];
  readonly measurements: readonly OverfitMeasurementInput[];
  readonly allowAcceptedOverfitRisk?: boolean;
}): OverfitEvidence {
  const acceptedRisks = input.experiments
    .filter((experiment) => experiment.status === "accepted" && experiment.id !== undefined)
    .flatMap((experiment) =>
      overfitRiskForExperiment({
        experiment: experiment as OverfitExperimentInput & { readonly id: string },
        measurements: input.measurements,
      }),
    );

  return {
    ok: input.allowAcceptedOverfitRisk === true || acceptedRisks.length === 0,
    acceptedOverfitRiskCount: acceptedRisks.length,
    acceptedOverfitRiskExperimentIds: acceptedRisks.map((risk) => risk.experimentId),
    acceptedOverfitRisks: acceptedRisks,
  };
}

function overfitRiskForExperiment(input: {
  readonly experiment: OverfitExperimentInput & { readonly id: string };
  readonly measurements: readonly OverfitMeasurementInput[];
}): readonly OverfitRisk[] {
  const measurements = input.measurements.filter(
    (measurement) => measurement.experimentId === input.experiment.id,
  );
  const dev = bestMetricValue({
    measurements,
    matchMetricName: isOptimizedDevMetricName,
  });
  const heldout = bestMetricValue({
    measurements,
    matchMetricName: isHeldoutMetricName,
  });
  const reasons = new Set<string>();

  if (dev !== undefined && heldout !== undefined) {
    const gap = dev.value - heldout.value;

    if (dev.value >= nearPerfectDevThreshold && gap >= nearPerfectHeldoutGapThreshold) {
      reasons.add("near-perfect-dev-with-heldout-gap");
    }

    if (dev.value >= largeDevThreshold && gap >= largeHeldoutGapThreshold) {
      reasons.add("large-dev-heldout-gap");
    }
  }

  if (mentionsDevLeakage(input.experiment) || measurements.some(mentionsDevLeakage)) {
    reasons.add("dev-label-leakage-mentioned");
  }

  if (reasons.size === 0 || dev === undefined) {
    return [];
  }

  return [
    {
      experimentId: input.experiment.id,
      devMetricName: dev.metricName,
      devValue: dev.value,
      heldoutMetricName: heldout?.metricName,
      heldoutValue: heldout?.value,
      gap: heldout === undefined ? undefined : dev.value - heldout.value,
      reasons: [...reasons],
    },
  ];
}

function bestMetricValue(input: {
  readonly measurements: readonly OverfitMeasurementInput[];
  readonly matchMetricName: (metricName: string) => boolean;
}): { readonly metricName: string; readonly value: number } | undefined {
  const values = input.measurements.flatMap((measurement) => {
    if (
      measurement.metricName === undefined ||
      measurement.numericValue === undefined ||
      !Number.isFinite(measurement.numericValue) ||
      !input.matchMetricName(measurement.metricName)
    ) {
      return [];
    }

    return [
      {
        metricName: measurement.metricName,
        value: measurement.numericValue,
      },
    ];
  });

  return values.sort((left, right) => right.value - left.value)[0];
}

function isOptimizedDevMetricName(metricName: string): boolean {
  const normalized = normalizeMetricName(metricName);

  return normalized.startsWith("dev_") && isAccuracyLikeMetricName(normalized);
}

function isHeldoutMetricName(metricName: string): boolean {
  const normalized = normalizeMetricName(metricName);

  return (
    isAccuracyLikeMetricName(normalized) &&
    (normalized.startsWith("final_") ||
      normalized.startsWith("heldout_") ||
      normalized.startsWith("held_out_") ||
      normalized.startsWith("test_"))
  );
}

function isAccuracyLikeMetricName(metricName: string): boolean {
  return metricName.includes("accuracy") || metricName.includes("score");
}

function mentionsDevLeakage(input: {
  readonly title?: string;
  readonly summaryMarkdown?: string;
}): boolean {
  const text = [input.title, input.summaryMarkdown].join(" ").toLowerCase();
  const compact = text.replaceAll(/[^a-z0-9]+/gu, " ");

  return (
    compact.includes("dev trained") ||
    compact.includes("train on dev") ||
    compact.includes("trained on dev") ||
    compact.includes("dev label") ||
    compact.includes("dev lookup") ||
    compact.includes("lookup table") ||
    compact.includes("memorized") ||
    compact.includes("memorize")
  );
}

function normalizeMetricName(metricName: string): string {
  return metricName
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "_");
}
