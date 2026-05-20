import type { ActorRef, IsoTimestamp, SituId } from "@situ/common";

import type { AppActionContext } from "../actions/index.js";

export type PrimitiveRecordCounts = {
  readonly projects: number;
  readonly tasks: number;
  readonly comments: number;
  readonly events: number;
  readonly notifications: number;
  readonly experiments: number;
  readonly measurements: number;
  readonly artifacts: number;
  readonly reviews: number;
  readonly reports: number;
};

export type TaskStatusCounts = {
  readonly triage: number;
  readonly backlog: number;
  readonly in_progress: number;
  readonly in_review: number;
  readonly done: number;
  readonly canceled: number;
};

export type ExperimentStatusCounts = {
  readonly planned: number;
  readonly running: number;
  readonly ready_for_review: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly abandoned: number;
};

export type NotificationInspectionCounts = {
  readonly unread: number;
  readonly read: number;
  readonly dismissed: number;
};

export type StaleTaskStatus = "in_progress" | "in_review";
export type StaleExperimentStatus = "running" | "ready_for_review";

export type StaleTaskAssignment = {
  readonly target: {
    readonly targetKind: "task";
    readonly targetId: SituId<"task">;
  };
  readonly projectId: SituId<"project">;
  readonly title: string;
  readonly status: StaleTaskStatus;
  readonly assignedTo: ActorRef;
  readonly updatedAt: IsoTimestamp;
  readonly ageHours: number;
};

export type StaleExperimentAssignment = {
  readonly target: {
    readonly targetKind: "experiment";
    readonly targetId: SituId<"experiment">;
  };
  readonly projectId: SituId<"project">;
  readonly taskId: SituId<"task">;
  readonly title: string;
  readonly status: StaleExperimentStatus;
  readonly assignedTo: ActorRef;
  readonly updatedAt: IsoTimestamp;
  readonly ageHours: number;
};

export type StaleAssignment = StaleTaskAssignment | StaleExperimentAssignment;

export type MaintenanceInspection = {
  readonly generatedAt: IsoTimestamp;
  readonly staleAfterHours: number;
  readonly records: PrimitiveRecordCounts;
  readonly tasks: TaskStatusCounts;
  readonly experiments: ExperimentStatusCounts;
  readonly notifications: NotificationInspectionCounts;
  readonly staleAssignments: readonly StaleAssignment[];
};

export type MaintenanceInspectionOptions = {
  readonly now?: IsoTimestamp;
  readonly staleAfterHours?: number;
};

export type InspectMaintenanceInput = MaintenanceInspectionOptions & {
  readonly context: AppActionContext;
};

export type NormalizedMaintenanceInspectionOptions = {
  readonly generatedAt: IsoTimestamp;
  readonly staleAfterHours: number;
};
