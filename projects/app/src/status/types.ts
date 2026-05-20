import type { Database } from "bun:sqlite";
import type { IsoTimestamp, SituId } from "@situ/common";

export type SituProjectStatusCounts = {
  readonly active: number;
  readonly archived: number;
};

export type SituWorkStatusCounts = {
  readonly pending: number;
  readonly running: number;
  readonly review: number;
  readonly attention: number;
  readonly completed: number;
};

export type SituTaskStatusCounts = {
  readonly triage: number;
  readonly backlog: number;
  readonly in_progress: number;
  readonly in_review: number;
  readonly done: number;
  readonly canceled: number;
};

export type SituExperimentStatusCounts = {
  readonly planned: number;
  readonly running: number;
  readonly ready_for_review: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly abandoned: number;
};

export type SituNotificationStatusCounts = {
  readonly unread: number;
  readonly read: number;
  readonly dismissed: number;
};

export type SituReviewDecisionCounts = {
  readonly approved: number;
  readonly changes_requested: number;
  readonly rejected: number;
  readonly commented: number;
};

export type SituStatusOutput = {
  readonly generatedAt: IsoTimestamp;
  readonly repositoryPath?: string;
  readonly projectIds: readonly SituId<"project">[];
  readonly projects: SituProjectStatusCounts;
  readonly work: SituWorkStatusCounts;
  readonly tasks: SituTaskStatusCounts;
  readonly experiments: SituExperimentStatusCounts;
  readonly notifications: SituNotificationStatusCounts;
  readonly reviews: SituReviewDecisionCounts;
  readonly staleAssignments: number;
  readonly isIdle: boolean;
};

export type GetSituStatusInput = {
  readonly database: Database;
  readonly projectId?: SituId<"project">;
  readonly repositoryPath?: string;
  readonly generatedAt?: IsoTimestamp;
  readonly staleAfterHours?: number;
};
