import type { Database } from "bun:sqlite";

import { createArtifactRepository, type ArtifactRepository } from "@situ/artifacts";
import { createBaselineRepository, type BaselineRepository } from "@situ/baselines";
import { createCommentRepository, type CommentRepository } from "@situ/comments";
import { createEventRepository, type EventRepository } from "@situ/events";
import { createExperimentRepository, type ExperimentRepository } from "@situ/experiments";
import { createMeasurementRepository, type MeasurementRepository } from "@situ/measurements";
import { createNotificationRepository, type NotificationRepository } from "@situ/notifications";
import { createProjectRepository, type ProjectRepository } from "@situ/projects";
import { createReportRepository, type ReportRepository } from "@situ/reports";
import { createReviewRepository, type ReviewRepository } from "@situ/reviews";
import { createTaskRepository, type TaskRepository } from "@situ/tasks";

import { withTransaction } from "../db/index.js";

export type AppRepositories = {
  readonly projects: ProjectRepository;
  readonly tasks: TaskRepository;
  readonly comments: CommentRepository;
  readonly events: EventRepository;
  readonly notifications: NotificationRepository;
  readonly baselines: BaselineRepository;
  readonly experiments: ExperimentRepository;
  readonly measurements: MeasurementRepository;
  readonly artifacts: ArtifactRepository;
  readonly reviews: ReviewRepository;
  readonly reports: ReportRepository;
};

export type CreateAppRepositoriesInput = {
  readonly database: Database;
};

export function createAppRepositories(input: CreateAppRepositoriesInput): AppRepositories {
  return {
    projects: createProjectRepository({ database: input.database }),
    tasks: createTaskRepository({ database: input.database }),
    comments: createCommentRepository({ database: input.database }),
    events: createEventRepository({ database: input.database }),
    notifications: createNotificationRepository({ database: input.database }),
    baselines: createBaselineRepository({ database: input.database }),
    experiments: createExperimentRepository({ database: input.database }),
    measurements: createMeasurementRepository({ database: input.database }),
    artifacts: createArtifactRepository({ database: input.database }),
    reviews: createReviewRepository({ database: input.database }),
    reports: createReportRepository({ database: input.database }),
  };
}

export type AppActionContext = {
  readonly database: Database;
  readonly repositories: AppRepositories;
};

export type CreateAppActionContextInput = {
  readonly database: Database;
};

export function createAppActionContext(input: CreateAppActionContextInput): AppActionContext {
  return {
    database: input.database,
    repositories: createAppRepositories({ database: input.database }),
  };
}

export type RunAppTransactionInput<T> = {
  readonly context: AppActionContext;
  readonly run: (context: AppActionContext) => T;
};

export function runAppTransaction<T>(input: RunAppTransactionInput<T>): T {
  return withTransaction({
    database: input.context.database,
    run: (database) =>
      input.run(
        createAppActionContext({
          database,
        }),
      ),
  });
}
