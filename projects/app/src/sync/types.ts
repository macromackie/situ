import type { ActorRef, IsoTimestamp, SituId, TargetRef } from "@situ/common";
import type { SerializedError } from "@situ/errors";
import type { BaselineStatus } from "@situ/baselines";
import type { ExperimentStatus } from "@situ/experiments";
import type { NotificationRecipient } from "@situ/notifications";
import type { ReviewDecision } from "@situ/reviews";
import type { TaskStatus } from "@situ/tasks";

export type ReplicachePushRequest = {
  readonly pushVersion: 1;
  readonly clientGroupID: string;
  readonly mutations: readonly ReplicacheMutation[];
  readonly profileID: string;
  readonly schemaVersion: string;
};

export type ReplicacheMutation = {
  readonly clientID: string;
  readonly id: number;
  readonly name: string;
  readonly args: unknown;
  readonly timestamp: number;
};

export type CreateProjectMutationArgs = {
  readonly id?: SituId<"project">;
  readonly eventId?: SituId<"event">;
  readonly name: string;
  readonly repositoryPath: string;
  readonly goalMarkdown: string;
  readonly createdBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export type CreateTaskMutationArgs = {
  readonly id?: SituId<"task">;
  readonly eventId?: SituId<"event">;
  readonly projectId: SituId<"project">;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly status?: TaskStatus;
  readonly createdBy: ActorRef;
  readonly assignedTo?: ActorRef;
  readonly now?: IsoTimestamp;
};

export type MoveTaskMutationArgs = {
  readonly id: SituId<"task">;
  readonly eventId?: SituId<"event">;
  readonly status: TaskStatus;
  readonly actor: ActorRef;
  readonly now?: IsoTimestamp;
};

export type ArchiveProjectMutationArgs = {
  readonly id: SituId<"project">;
  readonly eventId?: SituId<"event">;
  readonly actor: ActorRef;
  readonly now?: IsoTimestamp;
};

export type AssignTaskMutationArgs = {
  readonly id: SituId<"task">;
  readonly eventId?: SituId<"event">;
  readonly actor: ActorRef;
  readonly assignedTo?: ActorRef;
  readonly now?: IsoTimestamp;
};

export type CreateCommentMutationArgs = {
  readonly id: SituId<"comment">;
  readonly target: TargetRef;
  readonly bodyMarkdown: string;
  readonly author: ActorRef;
  readonly now?: IsoTimestamp;
};

export type CreateNotificationMutationArgs = {
  readonly id: SituId<"notification">;
  readonly recipient: NotificationRecipient;
  readonly target: TargetRef;
  readonly createdBy: ActorRef;
  readonly summaryMarkdown: string;
  readonly bodyMarkdown?: string;
  readonly now?: IsoTimestamp;
};

export type CreateEventMutationArgs = {
  readonly id: SituId<"event">;
  readonly target: TargetRef;
  readonly actor: ActorRef;
  readonly summaryMarkdown: string;
  readonly bodyMarkdown?: string;
  readonly now?: IsoTimestamp;
};

export type ReadNotificationMutationArgs = {
  readonly id: SituId<"notification">;
  readonly now?: IsoTimestamp;
};

export type DismissNotificationMutationArgs = {
  readonly id: SituId<"notification">;
  readonly now?: IsoTimestamp;
};

export type CreateExperimentMutationArgs = {
  readonly id: SituId<"experiment">;
  readonly eventId?: SituId<"event">;
  readonly projectId: SituId<"project">;
  readonly taskId: SituId<"task">;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly createdBy: ActorRef;
  readonly assignedTo?: ActorRef;
  readonly status?: ExperimentStatus;
  readonly baseRef?: string;
  readonly branchName?: string;
  readonly worktreePath?: string;
  readonly now?: IsoTimestamp;
};

export type MoveExperimentMutationArgs = {
  readonly id: SituId<"experiment">;
  readonly eventId?: SituId<"event">;
  readonly status: ExperimentStatus;
  readonly actor: ActorRef;
  readonly now?: IsoTimestamp;
};

export type AssignExperimentMutationArgs = {
  readonly id: SituId<"experiment">;
  readonly eventId?: SituId<"event">;
  readonly actor: ActorRef;
  readonly assignedTo?: ActorRef;
  readonly now?: IsoTimestamp;
};

export type ReviseExperimentMutationArgs = {
  readonly id: SituId<"experiment">;
  readonly eventId?: SituId<"event">;
  readonly summaryMarkdown?: string;
  readonly status?: ExperimentStatus;
  readonly baseRef?: string;
  readonly clearBaseRef?: boolean;
  readonly branchName?: string;
  readonly clearBranchName?: boolean;
  readonly worktreePath?: string;
  readonly clearWorktreePath?: boolean;
  readonly actor: ActorRef;
  readonly now?: IsoTimestamp;
};

export type CreateBaselineMutationArgs = {
  readonly id: SituId<"baseline">;
  readonly eventId?: SituId<"event">;
  readonly projectId: SituId<"project">;
  readonly taskId?: SituId<"task">;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly createdBy: ActorRef;
  readonly status?: BaselineStatus;
  readonly now?: IsoTimestamp;
};

export type MoveBaselineMutationArgs = {
  readonly id: SituId<"baseline">;
  readonly eventId?: SituId<"event">;
  readonly status: BaselineStatus;
  readonly actor: ActorRef;
  readonly now?: IsoTimestamp;
};

export type CreateMeasurementMutationArgs = {
  readonly id: SituId<"measurement">;
  readonly baselineId?: SituId<"baseline">;
  readonly experimentId?: SituId<"experiment">;
  readonly revisionNumber?: number;
  readonly metricName: string;
  readonly numericValue: number;
  readonly unit?: string;
  readonly summaryMarkdown: string;
  readonly detailsMarkdown?: string;
  readonly measuredBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export type CreateArtifactMutationArgs = {
  readonly id: SituId<"artifact">;
  readonly target: TargetRef;
  readonly title: string;
  readonly summaryMarkdown: string;
  readonly uri: string;
  readonly mediaType?: string;
  readonly byteSize?: number;
  readonly sha256?: string;
  readonly createdBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export type CreateReportMutationArgs = {
  readonly id: SituId<"report">;
  readonly projectId: SituId<"project">;
  readonly target: TargetRef;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly generatedBy: ActorRef;
  readonly now?: IsoTimestamp;
};

export type CreateReviewMutationArgs = {
  readonly id: SituId<"review">;
  readonly experimentId: SituId<"experiment">;
  readonly revisionNumber: number;
  readonly decision: ReviewDecision;
  readonly bodyMarkdown: string;
  readonly reviewer: ActorRef;
  readonly now?: IsoTimestamp;
};

export type ReplicachePermanentMutationError = {
  readonly clientID: string;
  readonly mutationID: number;
  readonly mutationName: string;
  readonly error: SerializedError;
};

export type ReplicachePushResult = {
  readonly ok: true;
  readonly processedMutationCount: number;
  readonly skippedMutationCount: number;
  readonly permanentErrorCount: number;
  readonly permanentErrors: readonly ReplicachePermanentMutationError[];
};

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type ReplicachePullRequest = {
  readonly pullVersion: 1;
  readonly clientGroupID: string;
  readonly cookie: JsonValue;
  readonly profileID: string;
  readonly schemaVersion: string;
};

export type ReplicachePatchOperation =
  | {
      readonly op: "clear";
    }
  | {
      readonly op: "put";
      readonly key: string;
      readonly value: JsonValue;
    }
  | {
      readonly op: "del";
      readonly key: string;
    };

export type ReplicachePullResponse = {
  // Numeric global sync version. Pulls return records and mutation
  // acknowledgements that changed after the client's previous cookie.
  readonly cookie: JsonValue;
  readonly lastMutationIDChanges: Record<string, number>;
  readonly patch: readonly ReplicachePatchOperation[];
};
