import { ValidationError } from "@situ/errors";

import {
  assignExperimentInContext,
  createBaselineInContext,
  createArtifactAction,
  createCommentAction,
  createEventAction,
  createExperimentInContext,
  createMeasurementAction,
  createNotificationAction,
  createProjectInContext,
  createReportAction,
  createReviewAction,
  createTaskInContext,
  dismissNotificationAction,
  markNotificationReadAction,
  archiveProjectInContext,
  assignTaskInContext,
  moveBaselineInContext,
  moveExperimentInContext,
  moveTaskInContext,
  reviseExperimentInContext,
  type AppActionContext,
} from "../actions/index.js";
import type { ReplicacheMutation } from "./types.js";
import {
  parseCreateArtifactMutationArgs,
  parseCreateBaselineMutationArgs,
  parseCreateCommentMutationArgs,
  parseCreateEventMutationArgs,
  parseCreateExperimentMutationArgs,
  parseCreateMeasurementMutationArgs,
  parseCreateNotificationMutationArgs,
  parseCreateProjectMutationArgs,
  parseCreateReportMutationArgs,
  parseCreateReviewMutationArgs,
  parseCreateTaskMutationArgs,
  parseDismissNotificationMutationArgs,
  parseAssignExperimentMutationArgs,
  parseArchiveProjectMutationArgs,
  parseAssignTaskMutationArgs,
  parseMoveExperimentMutationArgs,
  parseMoveBaselineMutationArgs,
  parseMoveTaskMutationArgs,
  parseReadNotificationMutationArgs,
  parseReviseExperimentMutationArgs,
} from "./validation.js";

export type PreparedReplicacheMutation = {
  readonly apply: (context: AppActionContext) => void;
};

/**
 * Validates and prepares one supported Replicache mutation.
 *
 * Event-emitting mutators intentionally delegate to the app transition helpers.
 * Passive record mutators and events.create do not add automatic events here.
 */
export function prepareReplicacheMutation(
  mutation: ReplicacheMutation,
): PreparedReplicacheMutation {
  switch (mutation.name) {
    case "projects.create": {
      const args = parseCreateProjectMutationArgs(mutation.args);

      return {
        apply: (context) => {
          createProjectInContext({
            context,
            ...args,
          });
        },
      };
    }

    case "tasks.create": {
      const args = parseCreateTaskMutationArgs(mutation.args);

      return {
        apply: (context) => {
          createTaskInContext({
            context,
            ...args,
          });
        },
      };
    }

    case "tasks.move": {
      const args = parseMoveTaskMutationArgs(mutation.args);

      return {
        apply: (context) => {
          moveTaskInContext({
            context,
            ...args,
          });
        },
      };
    }

    case "projects.archive": {
      const args = parseArchiveProjectMutationArgs(mutation.args);

      return {
        apply: (context) => {
          archiveProjectInContext({
            context,
            ...args,
          });
        },
      };
    }

    case "tasks.assign": {
      const args = parseAssignTaskMutationArgs(mutation.args);

      return {
        apply: (context) => {
          assignTaskInContext({
            context,
            ...args,
          });
        },
      };
    }

    case "comments.create": {
      const args = parseCreateCommentMutationArgs(mutation.args);

      return {
        apply: (context) => {
          createCommentAction({
            context,
            ...args,
          });
        },
      };
    }

    case "notifications.create": {
      const args = parseCreateNotificationMutationArgs(mutation.args);

      return {
        apply: (context) => {
          createNotificationAction({
            context,
            ...args,
          });
        },
      };
    }

    case "events.create": {
      const args = parseCreateEventMutationArgs(mutation.args);

      return {
        apply: (context) => {
          createEventAction({
            context,
            ...args,
          });
        },
      };
    }

    case "notifications.read": {
      const args = parseReadNotificationMutationArgs(mutation.args);

      return {
        apply: (context) => {
          markNotificationReadAction({
            context,
            ...args,
          });
        },
      };
    }

    case "notifications.dismiss": {
      const args = parseDismissNotificationMutationArgs(mutation.args);

      return {
        apply: (context) => {
          dismissNotificationAction({
            context,
            ...args,
          });
        },
      };
    }

    case "experiments.create": {
      const args = parseCreateExperimentMutationArgs(mutation.args);

      return {
        apply: (context) => {
          createExperimentInContext({
            context,
            ...args,
          });
        },
      };
    }

    case "experiments.move": {
      const args = parseMoveExperimentMutationArgs(mutation.args);

      return {
        apply: (context) => {
          moveExperimentInContext({
            context,
            ...args,
          });
        },
      };
    }

    case "experiments.assign": {
      const args = parseAssignExperimentMutationArgs(mutation.args);

      return {
        apply: (context) => {
          assignExperimentInContext({
            context,
            ...args,
          });
        },
      };
    }

    case "experiments.revise": {
      const args = parseReviseExperimentMutationArgs(mutation.args);

      return {
        apply: (context) => {
          reviseExperimentInContext({
            context,
            ...args,
          });
        },
      };
    }

    case "baselines.create": {
      const args = parseCreateBaselineMutationArgs(mutation.args);

      return {
        apply: (context) => {
          createBaselineInContext({
            context,
            ...args,
          });
        },
      };
    }

    case "baselines.move": {
      const args = parseMoveBaselineMutationArgs(mutation.args);

      return {
        apply: (context) => {
          moveBaselineInContext({
            context,
            ...args,
          });
        },
      };
    }

    case "measurements.create": {
      const args = parseCreateMeasurementMutationArgs(mutation.args);

      return {
        apply: (context) => {
          createMeasurementAction({
            context,
            ...args,
          });
        },
      };
    }

    case "artifacts.create": {
      const args = parseCreateArtifactMutationArgs(mutation.args);

      return {
        apply: (context) => {
          createArtifactAction({
            context,
            ...args,
          });
        },
      };
    }

    case "reports.create": {
      const args = parseCreateReportMutationArgs(mutation.args);

      return {
        apply: (context) => {
          createReportAction({
            context,
            ...args,
          });
        },
      };
    }

    case "reviews.create": {
      const args = parseCreateReviewMutationArgs(mutation.args);

      return {
        apply: (context) => {
          createReviewAction({
            context,
            ...args,
          });
        },
      };
    }

    default:
      throw new ValidationError({
        message: "Unsupported Replicache mutator.",
        details: { name: mutation.name },
      });
  }
}
