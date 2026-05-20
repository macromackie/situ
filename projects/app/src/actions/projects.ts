import type { ActorRef, IsoTimestamp, SituId } from "@situ/common";
import type { EventRecord } from "@situ/events";
import type { CreateProjectInput, ProjectRecord, ProjectStatus } from "@situ/projects";

import type { AppActionContext } from "./context.js";
import { runAppTransaction } from "./context.js";

export type CreateProjectActionInput = CreateProjectInput & {
  readonly context: AppActionContext;
  readonly eventId?: SituId<"event">;
};

export type CreateProjectActionResult = {
  readonly project: ProjectRecord;
  readonly event: EventRecord;
};

export type CreateProjectInContextInput = Omit<CreateProjectActionInput, "context"> & {
  readonly context: AppActionContext;
};

/**
 * Creates a project and event inside the caller's context.
 */
export function createProjectInContext(
  input: CreateProjectInContextInput,
): CreateProjectActionResult {
  const project = input.context.repositories.projects.create({
    id: input.id,
    name: input.name,
    repositoryPath: input.repositoryPath,
    goalMarkdown: input.goalMarkdown,
    createdBy: input.createdBy,
    now: input.now,
  });
  const event = input.context.repositories.events.create({
    id: input.eventId,
    target: {
      targetKind: "project",
      targetId: project.id,
    },
    actor: project.createdBy,
    summaryMarkdown: "Created project",
    now: input.now,
  });

  return {
    project,
    event,
  };
}

/**
 * Creates a project and event in one app transaction.
 */
export function createProjectAction(input: CreateProjectActionInput): CreateProjectActionResult {
  return runAppTransaction({
    context: input.context,
    run: (context) =>
      createProjectInContext({
        ...input,
        context,
      }),
  });
}

export type GetProjectActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"project">;
};

export function getProjectAction(input: GetProjectActionInput): ProjectRecord | undefined {
  return input.context.repositories.projects.getById({
    id: input.id,
  });
}

export type ListProjectsActionInput = {
  readonly context: AppActionContext;
  readonly status?: ProjectStatus;
  readonly repositoryPath?: string;
};

export function listProjectsAction(input: ListProjectsActionInput): readonly ProjectRecord[] {
  return input.context.repositories.projects.list({
    status: input.status,
    repositoryPath: input.repositoryPath,
  });
}

export type ArchiveProjectActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"project">;
  readonly actor: ActorRef;
  readonly now?: IsoTimestamp;
  readonly eventId?: SituId<"event">;
};

export type ArchiveProjectActionResult = {
  readonly project: ProjectRecord;
  readonly event: EventRecord;
};

export type ArchiveProjectInContextInput = Omit<ArchiveProjectActionInput, "context"> & {
  readonly context: AppActionContext;
};

/**
 * Archives a project and creates an event inside the caller's context.
 */
export function archiveProjectInContext(
  input: ArchiveProjectInContextInput,
): ArchiveProjectActionResult {
  const project = input.context.repositories.projects.archive({
    id: input.id,
    now: input.now,
  });
  const event = input.context.repositories.events.create({
    id: input.eventId,
    target: {
      targetKind: "project",
      targetId: project.id,
    },
    actor: input.actor,
    summaryMarkdown: "Archived project",
    now: input.now,
  });

  return {
    project,
    event,
  };
}

/**
 * Archives a project and creates an event in one app transaction.
 */
export function archiveProjectAction(input: ArchiveProjectActionInput): ArchiveProjectActionResult {
  return runAppTransaction({
    context: input.context,
    run: (context) =>
      archiveProjectInContext({
        ...input,
        context,
      }),
  });
}
