import type { SituId, TargetKind, TargetRef } from "@situ/common";
import { ConflictError, NotFoundError } from "@situ/errors";
import type { BaselineRecord } from "@situ/baselines";
import type { ExperimentRecord } from "@situ/experiments";
import type { MeasurementRecord } from "@situ/measurements";
import type { ReviewRecord } from "@situ/reviews";
import type { TaskRecord } from "@situ/tasks";

import type { AppActionContext } from "../actions/context.js";
import type {
  CollectProjectReportSnapshotInput,
  ProjectReportBaselineSnapshot,
  ProjectReportExperimentSnapshot,
  ProjectReportMeasurementSnapshot,
  ProjectReportReviewSnapshot,
  ProjectReportSnapshot,
  ProjectReportTaskSnapshot,
  ReportTargetAttachments,
} from "./types.js";

/**
 * Collects visible project records for deterministic report rendering.
 */
export function collectProjectReportSnapshot(
  input: CollectProjectReportSnapshotInput,
): ProjectReportSnapshot {
  const project = input.context.repositories.projects.getById({
    id: input.projectId,
  });

  if (project === undefined) {
    throw new NotFoundError({
      message: "Project was not found.",
      details: { id: input.projectId },
    });
  }

  const tasks = input.context.repositories.tasks.list({
    projectId: input.projectId,
  });
  const baselines = input.context.repositories.baselines.list({
    projectId: input.projectId,
  });
  const experiments = input.context.repositories.experiments.list({
    projectId: input.projectId,
  });
  assertExperimentsBelongToProjectTasks({
    experiments,
    projectId: input.projectId,
    taskIds: new Set(tasks.map((task) => task.id)),
  });

  const experimentsByTaskId = groupExperimentsByTaskId({ experiments });

  return {
    project,
    target: collectTargetAttachments({
      context: input.context,
      target: targetRef({
        targetKind: "project",
        targetId: project.id,
      }),
    }),
    baselines: baselines.map((baseline) =>
      collectBaselineSnapshot({
        context: input.context,
        baseline,
      }),
    ),
    tasks: tasks.map((task) =>
      collectTaskSnapshot({
        context: input.context,
        task,
        experiments: experimentsByTaskId.get(task.id) ?? [],
      }),
    ),
  };
}

type AssertExperimentsBelongToProjectTasksInput = {
  readonly experiments: readonly ExperimentRecord[];
  readonly projectId: SituId<"project">;
  readonly taskIds: ReadonlySet<SituId<"task">>;
};

function assertExperimentsBelongToProjectTasks(
  input: AssertExperimentsBelongToProjectTasksInput,
): void {
  for (const experiment of input.experiments) {
    if (input.taskIds.has(experiment.taskId)) {
      continue;
    }

    throw new ConflictError({
      message: "Project report could not be generated because experiment state is inconsistent.",
      details: {
        projectId: input.projectId,
        experimentId: experiment.id,
        taskId: experiment.taskId,
      },
    });
  }
}

type GroupExperimentsByTaskIdInput = {
  readonly experiments: readonly ExperimentRecord[];
};

function groupExperimentsByTaskId(
  input: GroupExperimentsByTaskIdInput,
): ReadonlyMap<SituId<"task">, readonly ExperimentRecord[]> {
  const experimentsByTaskId = new Map<SituId<"task">, ExperimentRecord[]>();

  for (const experiment of input.experiments) {
    const experimentsForTask = experimentsByTaskId.get(experiment.taskId) ?? [];
    experimentsForTask.push(experiment);
    experimentsByTaskId.set(experiment.taskId, experimentsForTask);
  }

  return experimentsByTaskId;
}

type CollectBaselineSnapshotInput = {
  readonly context: AppActionContext;
  readonly baseline: BaselineRecord;
};

function collectBaselineSnapshot(
  input: CollectBaselineSnapshotInput,
): ProjectReportBaselineSnapshot {
  const measurements = input.context.repositories.measurements.listForBaseline({
    baselineId: input.baseline.id,
  });

  return {
    baseline: input.baseline,
    target: collectTargetAttachments({
      context: input.context,
      target: targetRef({
        targetKind: "baseline",
        targetId: input.baseline.id,
      }),
    }),
    measurements: measurements.map((measurement) =>
      collectMeasurementSnapshot({
        context: input.context,
        measurement,
      }),
    ),
  };
}

type CollectTaskSnapshotInput = {
  readonly context: AppActionContext;
  readonly task: TaskRecord;
  readonly experiments: readonly ExperimentRecord[];
};

function collectTaskSnapshot(input: CollectTaskSnapshotInput): ProjectReportTaskSnapshot {
  return {
    task: input.task,
    target: collectTargetAttachments({
      context: input.context,
      target: targetRef({
        targetKind: "task",
        targetId: input.task.id,
      }),
    }),
    experiments: input.experiments.map((experiment) =>
      collectExperimentSnapshot({
        context: input.context,
        experiment,
      }),
    ),
  };
}

type CollectExperimentSnapshotInput = {
  readonly context: AppActionContext;
  readonly experiment: ExperimentRecord;
};

function collectExperimentSnapshot(
  input: CollectExperimentSnapshotInput,
): ProjectReportExperimentSnapshot {
  const measurements = input.context.repositories.measurements.listForExperiment({
    experimentId: input.experiment.id,
  });
  const reviews = input.context.repositories.reviews.listForExperiment({
    experimentId: input.experiment.id,
  });

  return {
    experiment: input.experiment,
    target: collectTargetAttachments({
      context: input.context,
      target: targetRef({
        targetKind: "experiment",
        targetId: input.experiment.id,
      }),
    }),
    measurements: measurements.map((measurement) =>
      collectMeasurementSnapshot({
        context: input.context,
        measurement,
      }),
    ),
    reviews: reviews.map((review) =>
      collectReviewSnapshot({
        context: input.context,
        review,
      }),
    ),
  };
}

type CollectMeasurementSnapshotInput = {
  readonly context: AppActionContext;
  readonly measurement: MeasurementRecord;
};

function collectMeasurementSnapshot(
  input: CollectMeasurementSnapshotInput,
): ProjectReportMeasurementSnapshot {
  return {
    measurement: input.measurement,
    target: collectTargetAttachments({
      context: input.context,
      target: targetRef({
        targetKind: "measurement",
        targetId: input.measurement.id,
      }),
    }),
  };
}

type CollectReviewSnapshotInput = {
  readonly context: AppActionContext;
  readonly review: ReviewRecord;
};

function collectReviewSnapshot(input: CollectReviewSnapshotInput): ProjectReportReviewSnapshot {
  return {
    review: input.review,
    target: collectTargetAttachments({
      context: input.context,
      target: targetRef({
        targetKind: "review",
        targetId: input.review.id,
      }),
    }),
  };
}

type CollectTargetAttachmentsInput = {
  readonly context: AppActionContext;
  readonly target: TargetRef;
};

function collectTargetAttachments(input: CollectTargetAttachmentsInput): ReportTargetAttachments {
  return {
    comments: input.context.repositories.comments.listForTarget({
      target: input.target,
    }),
    events: input.context.repositories.events.listForTarget({
      target: input.target,
    }),
    artifacts: input.context.repositories.artifacts.listForTarget({
      target: input.target,
    }),
    reports: input.context.repositories.reports.listForTarget({
      target: input.target,
    }),
  };
}

type TargetRefInput<TKind extends TargetKind> = {
  readonly targetKind: TKind;
  readonly targetId: SituId<TKind>;
};

function targetRef<TKind extends TargetKind>(input: TargetRefInput<TKind>): TargetRef<TKind> {
  return {
    targetKind: input.targetKind,
    targetId: input.targetId,
  };
}
