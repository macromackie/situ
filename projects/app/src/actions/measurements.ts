import type { SituId } from "@situ/common";
import type {
  CreateMeasurementInput,
  ListMeasurementsForBaselineInput,
  ListMeasurementsForExperimentInput,
  ListRecentMeasurementsInput,
  MeasurementRecord,
} from "@situ/measurements";

import type { AppActionContext } from "./context.js";

export type CreateMeasurementActionInput = CreateMeasurementInput & {
  readonly context: AppActionContext;
};

export type CreateMeasurementActionResult = {
  readonly measurement: MeasurementRecord;
};

export function createMeasurementAction(
  input: CreateMeasurementActionInput,
): CreateMeasurementActionResult {
  const measurement = input.context.repositories.measurements.create({
    id: input.id,
    baselineId: input.baselineId,
    experimentId: input.experimentId,
    revisionNumber: input.revisionNumber,
    metricName: input.metricName,
    numericValue: input.numericValue,
    unit: input.unit,
    summaryMarkdown: input.summaryMarkdown,
    detailsMarkdown: input.detailsMarkdown,
    measuredBy: input.measuredBy,
    now: input.now,
  });

  return { measurement };
}

export type GetMeasurementActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"measurement">;
};

export function getMeasurementAction(
  input: GetMeasurementActionInput,
): MeasurementRecord | undefined {
  return input.context.repositories.measurements.getById({
    id: input.id,
  });
}

export type ListMeasurementsActionInput = ListMeasurementsForExperimentInput & {
  readonly context: AppActionContext;
};

export function listMeasurementsAction(
  input: ListMeasurementsActionInput,
): readonly MeasurementRecord[] {
  return input.context.repositories.measurements.listForExperiment({
    experimentId: input.experimentId,
    revisionNumber: input.revisionNumber,
    metricName: input.metricName,
  });
}

export type ListBaselineMeasurementsActionInput = ListMeasurementsForBaselineInput & {
  readonly context: AppActionContext;
};

export function listBaselineMeasurementsAction(
  input: ListBaselineMeasurementsActionInput,
): readonly MeasurementRecord[] {
  return input.context.repositories.measurements.listForBaseline({
    baselineId: input.baselineId,
    metricName: input.metricName,
  });
}

export type ListRecentMeasurementsActionInput = ListRecentMeasurementsInput & {
  readonly context: AppActionContext;
};

export function listRecentMeasurementsAction(
  input: ListRecentMeasurementsActionInput,
): readonly MeasurementRecord[] {
  return input.context.repositories.measurements.listRecent({
    limit: input.limit,
  });
}
