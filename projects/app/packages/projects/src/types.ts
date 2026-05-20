import type { ActorRef, SituId, SyncMetadata } from "@situ/common";

export const projectsPackageName = "projects" as const;
export type ProjectsPackageName = typeof projectsPackageName;

export type ProjectStatus = "active" | "archived";

/**
 * Top-level container for autoresearch work in one repository.
 */
export type ProjectRecord = {
  readonly id: SituId<"project">;
  readonly name: string;
  readonly repositoryPath: string;
  readonly goalMarkdown: string;
  readonly status: ProjectStatus;
  readonly createdBy: ActorRef;
  readonly metadata: SyncMetadata;
};
