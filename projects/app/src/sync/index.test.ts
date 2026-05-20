import { expect, test } from "bun:test";

import type {
  ArchiveProjectMutationArgs,
  AssignExperimentMutationArgs,
  AssignTaskMutationArgs,
  CreateArtifactMutationArgs,
  CreateCommentMutationArgs,
  CreateEventMutationArgs,
  CreateExperimentMutationArgs,
  CreateMeasurementMutationArgs,
  CreateNotificationMutationArgs,
  CreateProjectMutationArgs,
  CreateReportMutationArgs,
  CreateReviewMutationArgs,
  CreateTaskMutationArgs,
  DismissNotificationMutationArgs,
  JsonValue,
  MoveExperimentMutationArgs,
  MoveTaskMutationArgs,
  ReadNotificationMutationArgs,
  ReplicacheMutation,
  ReplicachePatchOperation,
  ReplicachePermanentMutationError,
  ReplicachePullRequest,
  ReplicachePullResponse,
  ReplicachePushRequest,
  ReplicachePushResult,
  ReviseExperimentMutationArgs,
} from "@situ/app";

type PublicSyncMutationArgs =
  | CreateProjectMutationArgs
  | CreateTaskMutationArgs
  | MoveTaskMutationArgs
  | ArchiveProjectMutationArgs
  | AssignTaskMutationArgs
  | CreateCommentMutationArgs
  | CreateNotificationMutationArgs
  | ReadNotificationMutationArgs
  | DismissNotificationMutationArgs
  | CreateEventMutationArgs
  | CreateExperimentMutationArgs
  | MoveExperimentMutationArgs
  | AssignExperimentMutationArgs
  | ReviseExperimentMutationArgs
  | CreateMeasurementMutationArgs
  | CreateArtifactMutationArgs
  | CreateReviewMutationArgs
  | CreateReportMutationArgs;

type PublicReplicacheTypes =
  | JsonValue
  | ReplicacheMutation
  | ReplicachePatchOperation
  | ReplicachePermanentMutationError
  | ReplicachePullRequest
  | ReplicachePullResponse
  | ReplicachePushRequest
  | ReplicachePushResult;

test("exports public Replicache type contracts from the app root", () => {
  const mutationArgs: PublicSyncMutationArgs | undefined = undefined;
  const replicacheTypes: PublicReplicacheTypes | undefined = undefined;

  expect(mutationArgs).toBeUndefined();
  expect(replicacheTypes).toBeUndefined();
});
