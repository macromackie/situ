import type { ActorRef, IsoTimestamp, SituId } from "@situ/common";
import { NotFoundError } from "@situ/errors";
import * as v from "valibot";

import {
  assignExperimentAction,
  createAppActionContext,
  createExperimentAction,
  getExperimentAction,
  listExperimentsAction,
  moveExperimentAction,
  reviseExperimentAction,
} from "../../actions/index.js";
import { openAppDatabase } from "../../db/index.js";
import {
  booleanOption,
  defineCommandSpec,
  noPositionals,
  parseActorRef,
  parseAssignmentAssigneeFields,
  parseDefinedCommandSpec,
  parseExperimentStatus,
  parseOptionalAssigneeFields,
  parseOptionalAssigneeFilterFields,
  singlePositional,
  throwParserError,
  valueOption,
  type AssignedToFilter,
  type ExperimentStatus,
} from "../flags.js";
import { formatDataResult, formatExperimentLines } from "../format.js";
import type { SituCliInvocation, SituCliResult } from "../types.js";

export function runExperimentsCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult {
  const parsedCommand = parseExperimentCommand(input.invocation);

  return withActionContext({
    invocation: input.invocation,
    run: (context) => {
      switch (parsedCommand.subcommand) {
        case "create": {
          const result = createExperimentAction({
            context,
            id: parsedCommand.id,
            eventId: parsedCommand.eventId,
            projectId: parsedCommand.projectId,
            taskId: parsedCommand.taskId,
            title: parsedCommand.title,
            summaryMarkdown: parsedCommand.summaryMarkdown,
            status: parsedCommand.status,
            baseRef: parsedCommand.baseRef,
            branchName: parsedCommand.branchName,
            worktreePath: parsedCommand.worktreePath,
            createdBy: parsedCommand.actor,
            assignedTo: parsedCommand.assignedTo,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Created experiment ${result.experiment.id} (event ${result.event.id})`,
          });
        }

        case "list": {
          const experiments = listExperimentsAction({
            context,
            projectId: parsedCommand.projectId,
            taskId: parsedCommand.taskId,
            status: parsedCommand.status,
            assignedTo: parsedCommand.assignedTo,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { experiments },
            text: formatExperimentLines(experiments),
          });
        }

        case "get": {
          const experiment = getExperimentAction({
            context,
            id: parsedCommand.id,
          });

          if (experiment === undefined) {
            throw new NotFoundError({
              message: "Experiment was not found.",
              details: { id: parsedCommand.id },
            });
          }

          return formatDataResult({
            invocation: input.invocation,
            data: { experiment },
            text: formatExperimentLines([experiment]),
          });
        }

        case "move": {
          const result = moveExperimentAction({
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
            text: `Moved experiment ${result.experiment.id} to ${result.experiment.status} (event ${result.event.id})`,
          });
        }

        case "assign": {
          const result = assignExperimentAction({
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
            text: `Updated experiment ${result.experiment.id} assignment (event ${result.event.id})`,
          });
        }

        case "revise": {
          const result = reviseExperimentAction({
            context,
            id: parsedCommand.id,
            eventId: parsedCommand.eventId,
            summaryMarkdown: parsedCommand.summaryMarkdown,
            status: parsedCommand.status,
            baseRef: parsedCommand.baseRef,
            clearBaseRef: parsedCommand.clearBaseRef,
            branchName: parsedCommand.branchName,
            clearBranchName: parsedCommand.clearBranchName,
            worktreePath: parsedCommand.worktreePath,
            clearWorktreePath: parsedCommand.clearWorktreePath,
            actor: parsedCommand.actor,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Revised experiment ${result.experiment.id} to revision ${result.experiment.revisionNumber} (event ${result.event.id})`,
          });
        }
      }
    },
  });
}

type ParsedExperimentCommand =
  | {
      readonly subcommand: "create";
      readonly id?: SituId<"experiment">;
      readonly eventId?: SituId<"event">;
      readonly projectId: SituId<"project">;
      readonly taskId: SituId<"task">;
      readonly title: string;
      readonly summaryMarkdown: string;
      readonly status?: ExperimentStatus;
      readonly baseRef?: string;
      readonly branchName?: string;
      readonly worktreePath?: string;
      readonly actor: ActorRef;
      readonly assignedTo?: ActorRef;
      readonly now?: IsoTimestamp;
    }
  | {
      readonly subcommand: "list";
      readonly projectId?: SituId<"project">;
      readonly taskId?: SituId<"task">;
      readonly status?: ExperimentStatus;
      readonly assignedTo?: AssignedToFilter;
    }
  | {
      readonly subcommand: "get";
      readonly id: SituId<"experiment">;
    }
  | {
      readonly subcommand: "move";
      readonly id: SituId<"experiment">;
      readonly eventId?: SituId<"event">;
      readonly status: ExperimentStatus;
      readonly actor: ActorRef;
      readonly now?: IsoTimestamp;
    }
  | {
      readonly subcommand: "assign";
      readonly id: SituId<"experiment">;
      readonly eventId?: SituId<"event">;
      readonly actor: ActorRef;
      readonly assignedTo?: ActorRef;
      readonly now?: IsoTimestamp;
    }
  | {
      readonly subcommand: "revise";
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

const createExperimentCommand = defineCommandSpec({
  command: "experiments create",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    valueOption({ key: "eventId", flag: "--event-id" }),
    valueOption({ key: "projectId", flag: "--project-id", required: true }),
    valueOption({ key: "taskId", flag: "--task-id", required: true }),
    valueOption({ key: "title", flag: "--title", required: true }),
    valueOption({ key: "summaryMarkdown", flag: "--summary", required: true }),
    valueOption({ key: "status", flag: "--status" }),
    valueOption({ key: "baseRef", flag: "--base-ref" }),
    valueOption({ key: "branchName", flag: "--branch-name" }),
    valueOption({ key: "worktreePath", flag: "--worktree-path" }),
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
    taskId: v.string(),
    title: v.string(),
    summaryMarkdown: v.string(),
    status: v.optional(v.string()),
    baseRef: v.optional(v.string()),
    branchName: v.optional(v.string()),
    worktreePath: v.optional(v.string()),
    actorKind: v.string(),
    actorId: v.string(),
    actorDisplayName: v.optional(v.string()),
    assignedToKind: v.optional(v.string()),
    assignedToId: v.optional(v.string()),
    assignedToDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
  }),
});

const listExperimentCommand = defineCommandSpec({
  command: "experiments list",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "projectId", flag: "--project-id" }),
    valueOption({ key: "taskId", flag: "--task-id" }),
    valueOption({ key: "status", flag: "--status" }),
    valueOption({ key: "assignedToKind", flag: "--assigned-to-kind" }),
    valueOption({ key: "assignedToId", flag: "--assigned-to-id" }),
  ],
  schema: v.object({
    projectId: v.optional(v.string()),
    taskId: v.optional(v.string()),
    status: v.optional(v.string()),
    assignedToKind: v.optional(v.string()),
    assignedToId: v.optional(v.string()),
  }),
});

const getExperimentCommand = defineCommandSpec({
  command: "experiments get",
  positionals: singlePositional({ key: "id", name: "experiment-id" }),
  options: [],
  schema: v.object({
    id: v.string(),
  }),
});

const moveExperimentCommand = defineCommandSpec({
  command: "experiments move",
  positionals: singlePositional({ key: "id", name: "experiment-id" }),
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

const assignExperimentCommand = defineCommandSpec({
  command: "experiments assign",
  positionals: singlePositional({ key: "id", name: "experiment-id" }),
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

const reviseExperimentCommand = defineCommandSpec({
  command: "experiments revise",
  positionals: singlePositional({ key: "id", name: "experiment-id" }),
  options: [
    valueOption({ key: "eventId", flag: "--event-id" }),
    valueOption({ key: "summaryMarkdown", flag: "--summary" }),
    valueOption({ key: "status", flag: "--status" }),
    valueOption({ key: "baseRef", flag: "--base-ref" }),
    valueOption({ key: "branchName", flag: "--branch-name" }),
    valueOption({ key: "worktreePath", flag: "--worktree-path" }),
    valueOption({ key: "actorKind", flag: "--actor-kind", required: true }),
    valueOption({ key: "actorId", flag: "--actor-id", required: true }),
    valueOption({ key: "actorDisplayName", flag: "--actor-display-name" }),
    valueOption({ key: "now", flag: "--now" }),
    booleanOption({ key: "clearBaseRef", flag: "--clear-base-ref" }),
    booleanOption({ key: "clearBranchName", flag: "--clear-branch-name" }),
    booleanOption({ key: "clearWorktreePath", flag: "--clear-worktree-path" }),
  ],
  schema: v.object({
    id: v.string(),
    eventId: v.optional(v.string()),
    summaryMarkdown: v.optional(v.string()),
    status: v.optional(v.string()),
    baseRef: v.optional(v.string()),
    branchName: v.optional(v.string()),
    worktreePath: v.optional(v.string()),
    actorKind: v.string(),
    actorId: v.string(),
    actorDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
    clearBaseRef: v.boolean(),
    clearBranchName: v.boolean(),
    clearWorktreePath: v.boolean(),
  }),
});

function parseExperimentCommand(invocation: SituCliInvocation): ParsedExperimentCommand {
  const [subcommand, ...args] = invocation.rest;

  if (subcommand === undefined) {
    throwParserError({
      message: "Command experiments requires a subcommand.",
      details: { command: "experiments" },
      outputMode: invocation.outputMode,
    });
  }

  switch (subcommand) {
    case "create": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: createExperimentCommand,
      });
      const assignedTo = parseOptionalAssigneeFields({
        invocation,
        kind: options.assignedToKind,
        id: options.assignedToId,
        displayName: options.assignedToDisplayName,
      });

      return {
        subcommand,
        id: options.id as SituId<"experiment"> | undefined,
        eventId: options.eventId as SituId<"event"> | undefined,
        projectId: options.projectId as SituId<"project">,
        taskId: options.taskId as SituId<"task">,
        title: options.title,
        summaryMarkdown: options.summaryMarkdown,
        status:
          options.status === undefined
            ? undefined
            : parseExperimentStatus({
                invocation,
                status: options.status,
              }),
        baseRef: options.baseRef,
        branchName: options.branchName,
        worktreePath: options.worktreePath,
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
        spec: listExperimentCommand,
      });

      return {
        subcommand,
        projectId: options.projectId as SituId<"project"> | undefined,
        taskId: options.taskId as SituId<"task"> | undefined,
        status:
          options.status === undefined
            ? undefined
            : parseExperimentStatus({
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

    case "get": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: getExperimentCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"experiment">,
      };
    }

    case "move": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: moveExperimentCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"experiment">,
        eventId: options.eventId as SituId<"event"> | undefined,
        status: parseExperimentStatus({
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
        spec: assignExperimentCommand,
      });
      const assignedTo = parseAssignmentAssigneeFields({
        invocation,
        clear: options.clear,
        assignedToKind: options.assignedToKind,
        assignedToId: options.assignedToId,
        assignedToDisplayName: options.assignedToDisplayName,
        command: "experiments assign",
      });

      return {
        subcommand,
        id: options.id as SituId<"experiment">,
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

    case "revise": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: reviseExperimentCommand,
      });

      assertNoClearAndValue({
        invocation,
        clearFlag: "--clear-base-ref",
        clear: options.clearBaseRef,
        valueFlag: "--base-ref",
        value: options.baseRef,
      });
      assertNoClearAndValue({
        invocation,
        clearFlag: "--clear-branch-name",
        clear: options.clearBranchName,
        valueFlag: "--branch-name",
        value: options.branchName,
      });
      assertNoClearAndValue({
        invocation,
        clearFlag: "--clear-worktree-path",
        clear: options.clearWorktreePath,
        valueFlag: "--worktree-path",
        value: options.worktreePath,
      });
      assertHasRevisionFlag({
        invocation,
        summaryMarkdown: options.summaryMarkdown,
        status: options.status,
        baseRef: options.baseRef,
        clearBaseRef: options.clearBaseRef,
        branchName: options.branchName,
        clearBranchName: options.clearBranchName,
        worktreePath: options.worktreePath,
        clearWorktreePath: options.clearWorktreePath,
      });

      return {
        subcommand,
        id: options.id as SituId<"experiment">,
        eventId: options.eventId as SituId<"event"> | undefined,
        summaryMarkdown: options.summaryMarkdown,
        status:
          options.status === undefined
            ? undefined
            : parseExperimentStatus({
                invocation,
                status: options.status,
              }),
        baseRef: options.baseRef,
        clearBaseRef: options.clearBaseRef ? true : undefined,
        branchName: options.branchName,
        clearBranchName: options.clearBranchName ? true : undefined,
        worktreePath: options.worktreePath,
        clearWorktreePath: options.clearWorktreePath ? true : undefined,
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

    default:
      throwParserError({
        message: `Unknown experiments subcommand: ${subcommand}.`,
        details: { command: "experiments", subcommand },
        outputMode: invocation.outputMode,
      });
  }
}

function assertNoClearAndValue(input: {
  readonly invocation: SituCliInvocation;
  readonly clearFlag: string;
  readonly clear: boolean;
  readonly valueFlag: string;
  readonly value?: string;
}): void {
  if (!input.clear || input.value === undefined) {
    return;
  }

  throwParserError({
    message: `${input.clearFlag} cannot be combined with ${input.valueFlag}.`,
    details: {
      clearFlag: input.clearFlag,
      valueFlag: input.valueFlag,
    },
    outputMode: input.invocation.outputMode,
  });
}

function assertHasRevisionFlag(input: {
  readonly invocation: SituCliInvocation;
  readonly summaryMarkdown?: string;
  readonly status?: string;
  readonly baseRef?: string;
  readonly clearBaseRef: boolean;
  readonly branchName?: string;
  readonly clearBranchName: boolean;
  readonly worktreePath?: string;
  readonly clearWorktreePath: boolean;
}): void {
  if (
    input.summaryMarkdown !== undefined ||
    input.status !== undefined ||
    input.baseRef !== undefined ||
    input.clearBaseRef ||
    input.branchName !== undefined ||
    input.clearBranchName ||
    input.worktreePath !== undefined ||
    input.clearWorktreePath
  ) {
    return;
  }

  throwParserError({
    message: "Command experiments revise requires at least one revision flag.",
    details: {
      flags: [
        "--summary",
        "--status",
        "--base-ref",
        "--clear-base-ref",
        "--branch-name",
        "--clear-branch-name",
        "--worktree-path",
        "--clear-worktree-path",
      ],
    },
    outputMode: input.invocation.outputMode,
  });
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
