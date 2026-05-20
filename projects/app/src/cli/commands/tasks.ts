import type { ActorRef, IsoTimestamp, SituId } from "@situ/common";
import { NotFoundError } from "@situ/errors";
import * as v from "valibot";

import {
  assignTaskAction,
  createAppActionContext,
  createTaskAction,
  getTaskAction,
  listProjectsAction,
  listTasksAction,
  moveTaskAction,
} from "../../actions/index.js";
import { openAppDatabase } from "../../db/index.js";
import { findCurrentRepositoryRoot } from "../../repositories/index.js";
import {
  booleanOption,
  defineCommandSpec,
  noPositionals,
  parseActorRef,
  parseAssignmentAssigneeFields,
  parseDefinedCommandSpec,
  parseOptionalAssigneeFields,
  parseOptionalAssigneeFilterFields,
  parseProjectStatus,
  parseTaskStatus,
  singlePositional,
  throwParserError,
  valueOption,
  type AssignedToFilter,
  type ProjectStatus,
  type TaskStatus,
} from "../flags.js";
import { formatDataResult, formatTaskLines } from "../format.js";
import type { SituCliInvocation, SituCliResult } from "../types.js";

export function runTasksCommand(input: { readonly invocation: SituCliInvocation }): SituCliResult {
  const parsedCommand = parseTaskCommand(input.invocation);

  return withActionContext({
    invocation: input.invocation,
    run: (context) => {
      switch (parsedCommand.subcommand) {
        case "create": {
          const result = createTaskAction({
            context,
            id: parsedCommand.id,
            eventId: parsedCommand.eventId,
            projectId: parsedCommand.projectId,
            title: parsedCommand.title,
            bodyMarkdown: parsedCommand.body,
            status: parsedCommand.status,
            createdBy: parsedCommand.actor,
            assignedTo: parsedCommand.assignedTo,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Created task ${result.task.id} (event ${result.event.id})`,
          });
        }

        case "list": {
          const tasks = listTasksAction({
            context,
            projectId: parsedCommand.projectId,
            status: parsedCommand.status,
            assignedTo: parsedCommand.assignedTo,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { tasks },
            text: formatTaskLines(tasks),
          });
        }

        case "current": {
          const projects = listProjectsAction({
            context,
            repositoryPath: parsedCommand.repositoryPath,
            status: parsedCommand.projectStatus,
          });
          const tasks = listTasksAction({
            context,
            projectIds: projects.map((project) => project.id),
            status: parsedCommand.status,
            assignedTo: parsedCommand.assignedTo,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { projects, tasks },
            text: formatTaskLines(tasks),
          });
        }

        case "get": {
          const task = getTaskAction({
            context,
            id: parsedCommand.id,
          });

          if (task === undefined) {
            throw new NotFoundError({
              message: "Task was not found.",
              details: { id: parsedCommand.id },
            });
          }

          return formatDataResult({
            invocation: input.invocation,
            data: { task },
            text: formatTaskLines([task]),
          });
        }

        case "move": {
          const result = moveTaskAction({
            context,
            id: parsedCommand.id,
            eventId: parsedCommand.eventId,
            status: parsedCommand.status,
            actor: parsedCommand.actor,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Moved task ${result.task.id} to ${result.task.status} (event ${result.event.id})`,
          });
        }

        case "assign": {
          const result = assignTaskAction({
            context,
            id: parsedCommand.id,
            eventId: parsedCommand.eventId,
            actor: parsedCommand.actor,
            assignedTo: parsedCommand.assignedTo,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Updated task ${result.task.id} assignment (event ${result.event.id})`,
          });
        }
      }
    },
  });
}

type ParsedTaskCommand =
  | {
      readonly subcommand: "create";
      readonly id?: SituId<"task">;
      readonly eventId?: SituId<"event">;
      readonly projectId: SituId<"project">;
      readonly title: string;
      readonly body: string;
      readonly status?: TaskStatus;
      readonly actor: ActorRef;
      readonly assignedTo?: ActorRef;
      readonly now?: IsoTimestamp;
    }
  | {
      readonly subcommand: "list";
      readonly projectId?: SituId<"project">;
      readonly status?: TaskStatus;
      readonly assignedTo?: AssignedToFilter;
    }
  | {
      readonly subcommand: "current";
      readonly projectStatus?: ProjectStatus;
      readonly status?: TaskStatus;
      readonly assignedTo?: AssignedToFilter;
      readonly repositoryPath: string;
    }
  | {
      readonly subcommand: "get";
      readonly id: SituId<"task">;
    }
  | {
      readonly subcommand: "move";
      readonly id: SituId<"task">;
      readonly eventId?: SituId<"event">;
      readonly status: TaskStatus;
      readonly actor: ActorRef;
      readonly now?: IsoTimestamp;
    }
  | {
      readonly subcommand: "assign";
      readonly id: SituId<"task">;
      readonly eventId?: SituId<"event">;
      readonly actor: ActorRef;
      readonly assignedTo?: ActorRef;
      readonly now?: IsoTimestamp;
    };

const createTaskCommand = defineCommandSpec({
  command: "tasks create",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    valueOption({ key: "eventId", flag: "--event-id" }),
    valueOption({ key: "projectId", flag: "--project-id", required: true }),
    valueOption({ key: "title", flag: "--title", required: true }),
    valueOption({ key: "body", flag: "--body", required: true }),
    valueOption({ key: "status", flag: "--status" }),
    valueOption({ key: "actorKind", flag: "--actor-kind", required: true }),
    valueOption({ key: "actorId", flag: "--actor-id", required: true }),
    valueOption({ key: "actorDisplayName", flag: "--actor-display-name" }),
    valueOption({ key: "assignedToKind", flag: "--assigned-to-kind" }),
    valueOption({ key: "assignedToId", flag: "--assigned-to-id" }),
    valueOption({ key: "assignedToDisplayName", flag: "--assigned-to-display-name" }),
    valueOption({ key: "now", flag: "--now" }),
  ],
  schema: v.object({
    id: v.optional(v.string()),
    eventId: v.optional(v.string()),
    projectId: v.string(),
    title: v.string(),
    body: v.string(),
    status: v.optional(v.string()),
    actorKind: v.string(),
    actorId: v.string(),
    actorDisplayName: v.optional(v.string()),
    assignedToKind: v.optional(v.string()),
    assignedToId: v.optional(v.string()),
    assignedToDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
  }),
});

const listTaskCommand = defineCommandSpec({
  command: "tasks list",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "projectId", flag: "--project-id" }),
    valueOption({ key: "status", flag: "--status" }),
    valueOption({ key: "assignedToKind", flag: "--assigned-to-kind" }),
    valueOption({ key: "assignedToId", flag: "--assigned-to-id" }),
  ],
  schema: v.object({
    projectId: v.optional(v.string()),
    status: v.optional(v.string()),
    assignedToKind: v.optional(v.string()),
    assignedToId: v.optional(v.string()),
  }),
});

const currentTaskCommand = defineCommandSpec({
  command: "tasks current",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "projectStatus", flag: "--project-status" }),
    valueOption({ key: "status", flag: "--status" }),
    valueOption({ key: "assignedToKind", flag: "--assigned-to-kind" }),
    valueOption({ key: "assignedToId", flag: "--assigned-to-id" }),
  ],
  schema: v.object({
    projectStatus: v.optional(v.string()),
    status: v.optional(v.string()),
    assignedToKind: v.optional(v.string()),
    assignedToId: v.optional(v.string()),
  }),
});

const getTaskCommand = defineCommandSpec({
  command: "tasks get",
  positionals: singlePositional({ key: "id", name: "task-id" }),
  options: [],
  schema: v.object({
    id: v.string(),
  }),
});

const moveTaskCommand = defineCommandSpec({
  command: "tasks move",
  positionals: singlePositional({ key: "id", name: "task-id" }),
  options: [
    valueOption({ key: "eventId", flag: "--event-id" }),
    valueOption({ key: "status", flag: "--status", required: true }),
    valueOption({ key: "actorKind", flag: "--actor-kind", required: true }),
    valueOption({ key: "actorId", flag: "--actor-id", required: true }),
    valueOption({ key: "actorDisplayName", flag: "--actor-display-name" }),
    valueOption({ key: "now", flag: "--now" }),
  ],
  schema: v.object({
    id: v.string(),
    eventId: v.optional(v.string()),
    status: v.string(),
    actorKind: v.string(),
    actorId: v.string(),
    actorDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
  }),
});

const assignTaskCommand = defineCommandSpec({
  command: "tasks assign",
  positionals: singlePositional({ key: "id", name: "task-id" }),
  options: [
    valueOption({ key: "eventId", flag: "--event-id" }),
    valueOption({ key: "actorKind", flag: "--actor-kind", required: true }),
    valueOption({ key: "actorId", flag: "--actor-id", required: true }),
    valueOption({ key: "actorDisplayName", flag: "--actor-display-name" }),
    valueOption({ key: "assignedToKind", flag: "--assigned-to-kind" }),
    valueOption({ key: "assignedToId", flag: "--assigned-to-id" }),
    valueOption({ key: "assignedToDisplayName", flag: "--assigned-to-display-name" }),
    valueOption({ key: "now", flag: "--now" }),
    booleanOption({ key: "clear", flag: "--clear" }),
  ],
  schema: v.object({
    id: v.string(),
    eventId: v.optional(v.string()),
    actorKind: v.string(),
    actorId: v.string(),
    actorDisplayName: v.optional(v.string()),
    assignedToKind: v.optional(v.string()),
    assignedToId: v.optional(v.string()),
    assignedToDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
    clear: v.boolean(),
  }),
});

function parseTaskCommand(invocation: SituCliInvocation): ParsedTaskCommand {
  const [subcommand, ...args] = invocation.rest;

  if (subcommand === undefined) {
    throwParserError({
      message: "Command tasks requires a subcommand.",
      details: { command: "tasks" },
      outputMode: invocation.outputMode,
    });
  }

  switch (subcommand) {
    case "create": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: createTaskCommand,
      });
      const assignedTo = parseOptionalAssigneeFields({
        invocation,
        kind: options.assignedToKind,
        id: options.assignedToId,
        displayName: options.assignedToDisplayName,
      });

      return {
        subcommand,
        id: options.id as SituId<"task"> | undefined,
        eventId: options.eventId as SituId<"event"> | undefined,
        projectId: options.projectId as SituId<"project">,
        title: options.title,
        body: options.body,
        status:
          options.status === undefined
            ? undefined
            : parseTaskStatus({
                invocation,
                status: options.status,
              }),
        actor: parseActorRef({
          invocation,
          kindFlag: "--actor-kind",
          kind: options.actorKind,
          id: options.actorId,
          displayName: options.actorDisplayName,
        }),
        assignedTo,
        now: options.now as IsoTimestamp | undefined,
      };
    }

    case "list": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: listTaskCommand,
      });

      return {
        subcommand,
        projectId: options.projectId as SituId<"project"> | undefined,
        status:
          options.status === undefined
            ? undefined
            : parseTaskStatus({
                invocation,
                status: options.status,
              }),
        assignedTo: parseOptionalAssigneeFilterFields({
          invocation,
          kind: options.assignedToKind,
          id: options.assignedToId,
        }),
      };
    }

    case "current": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: currentTaskCommand,
      });
      const assignedTo = parseOptionalAssigneeFilterFields({
        invocation,
        kind: options.assignedToKind,
        id: options.assignedToId,
      });

      return {
        subcommand,
        projectStatus:
          options.projectStatus === undefined
            ? undefined
            : parseProjectStatus({
                invocation,
                status: options.projectStatus,
              }),
        status:
          options.status === undefined
            ? undefined
            : parseTaskStatus({
                invocation,
                status: options.status,
              }),
        assignedTo,
        repositoryPath: findCurrentRepositoryRoot({ cwd: invocation.cwd }),
      };
    }

    case "get": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: getTaskCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"task">,
      };
    }

    case "move": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: moveTaskCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"task">,
        eventId: options.eventId as SituId<"event"> | undefined,
        status: parseTaskStatus({
          invocation,
          status: options.status,
        }),
        actor: parseActorRef({
          invocation,
          kindFlag: "--actor-kind",
          kind: options.actorKind,
          id: options.actorId,
          displayName: options.actorDisplayName,
        }),
        now: options.now as IsoTimestamp | undefined,
      };
    }

    case "assign": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: assignTaskCommand,
      });
      const assignedTo = parseAssignmentAssigneeFields({
        invocation,
        clear: options.clear,
        assignedToKind: options.assignedToKind,
        assignedToId: options.assignedToId,
        assignedToDisplayName: options.assignedToDisplayName,
      });

      return {
        subcommand,
        id: options.id as SituId<"task">,
        eventId: options.eventId as SituId<"event"> | undefined,
        actor: parseActorRef({
          invocation,
          kindFlag: "--actor-kind",
          kind: options.actorKind,
          id: options.actorId,
          displayName: options.actorDisplayName,
        }),
        assignedTo,
        now: options.now as IsoTimestamp | undefined,
      };
    }

    default:
      throwParserError({
        message: `Unknown tasks subcommand: ${subcommand}.`,
        details: { command: "tasks", subcommand },
        outputMode: invocation.outputMode,
      });
  }
}

function withActionContext(input: {
  readonly invocation: SituCliInvocation;
  readonly run: (context: ReturnType<typeof createAppActionContext>) => SituCliResult;
}): SituCliResult {
  const database = openAppDatabase({
    databasePath: input.invocation.databasePath,
    environment: input.invocation.environment,
  });

  try {
    return input.run(createAppActionContext({ database }));
  } finally {
    database.close();
  }
}
