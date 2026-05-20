import type { ActorRef, IsoTimestamp, SituId } from "@situ/common";
import { NotFoundError } from "@situ/errors";
import * as v from "valibot";

import {
  createAppActionContext,
  createBaselineAction,
  getBaselineAction,
  listBaselinesAction,
  moveBaselineAction,
} from "../../actions/index.js";
import { openAppDatabase } from "../../db/index.js";
import {
  defineCommandSpec,
  noPositionals,
  parseActorRef,
  parseBaselineStatus,
  parseDefinedCommandSpec,
  singlePositional,
  throwParserError,
  valueOption,
  type BaselineStatus,
} from "../flags.js";
import { formatBaselineLines, formatDataResult } from "../format.js";
import type { SituCliInvocation, SituCliResult } from "../types.js";

export function runBaselinesCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult {
  const parsedCommand = parseBaselineCommand(input.invocation);

  return withActionContext({
    invocation: input.invocation,
    run: (context) => {
      switch (parsedCommand.subcommand) {
        case "create": {
          const result = createBaselineAction({
            context,
            id: parsedCommand.id,
            eventId: parsedCommand.eventId,
            projectId: parsedCommand.projectId,
            taskId: parsedCommand.taskId,
            title: parsedCommand.title,
            summaryMarkdown: parsedCommand.summaryMarkdown,
            status: parsedCommand.status,
            createdBy: parsedCommand.actor,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Created baseline ${result.baseline.id} (event ${result.event.id})`,
          });
        }

        case "list": {
          const baselines = listBaselinesAction({
            context,
            projectId: parsedCommand.projectId,
            taskId: parsedCommand.taskId,
            status: parsedCommand.status,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { baselines },
            text: formatBaselineLines(baselines),
          });
        }

        case "get": {
          const baseline = getBaselineAction({
            context,
            id: parsedCommand.id,
          });

          if (baseline === undefined) {
            throw new NotFoundError({
              message: "Baseline was not found.",
              details: { id: parsedCommand.id },
            });
          }

          return formatDataResult({
            invocation: input.invocation,
            data: { baseline },
            text: formatBaselineLines([baseline]),
          });
        }

        case "move": {
          const result = moveBaselineAction({
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
            text: `Moved baseline ${result.baseline.id} to ${result.baseline.status} (event ${result.event.id})`,
          });
        }
      }
    },
  });
}

type ParsedBaselineCommand =
  | {
      readonly subcommand: "create";
      readonly id?: SituId<"baseline">;
      readonly eventId?: SituId<"event">;
      readonly projectId: SituId<"project">;
      readonly taskId?: SituId<"task">;
      readonly title: string;
      readonly summaryMarkdown: string;
      readonly status?: BaselineStatus;
      readonly actor: ActorRef;
      readonly now?: IsoTimestamp;
    }
  | {
      readonly subcommand: "list";
      readonly projectId?: SituId<"project">;
      readonly taskId?: SituId<"task">;
      readonly status?: BaselineStatus;
    }
  | {
      readonly subcommand: "get";
      readonly id: SituId<"baseline">;
    }
  | {
      readonly subcommand: "move";
      readonly id: SituId<"baseline">;
      readonly eventId?: SituId<"event">;
      readonly status: BaselineStatus;
      readonly actor: ActorRef;
      readonly now?: IsoTimestamp;
    };

const createBaselineCommand = defineCommandSpec({
  command: "baselines create",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    valueOption({ key: "eventId", flag: "--event-id" }),
    valueOption({ key: "projectId", flag: "--project-id", required: true }),
    valueOption({ key: "taskId", flag: "--task-id" }),
    valueOption({ key: "title", flag: "--title", required: true }),
    valueOption({ key: "summaryMarkdown", flag: "--summary", required: true }),
    valueOption({ key: "status", flag: "--status" }),
    valueOption({ key: "actorKind", flag: "--actor-kind", required: true }),
    valueOption({ key: "actorId", flag: "--actor-id", required: true }),
    valueOption({ key: "actorDisplayName", flag: "--actor-display-name" }),
    valueOption({ key: "now", flag: "--now" }),
  ],
  schema: v.object({
    id: v.optional(v.string()),
    eventId: v.optional(v.string()),
    projectId: v.string(),
    taskId: v.optional(v.string()),
    title: v.string(),
    summaryMarkdown: v.string(),
    status: v.optional(v.string()),
    actorKind: v.string(),
    actorId: v.string(),
    actorDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
  }),
});

const listBaselineCommand = defineCommandSpec({
  command: "baselines list",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "projectId", flag: "--project-id" }),
    valueOption({ key: "taskId", flag: "--task-id" }),
    valueOption({ key: "status", flag: "--status" }),
  ],
  schema: v.object({
    projectId: v.optional(v.string()),
    taskId: v.optional(v.string()),
    status: v.optional(v.string()),
  }),
});

const getBaselineCommand = defineCommandSpec({
  command: "baselines get",
  positionals: singlePositional({ key: "id", name: "baseline-id" }),
  options: [],
  schema: v.object({
    id: v.string(),
  }),
});

const moveBaselineCommand = defineCommandSpec({
  command: "baselines move",
  positionals: singlePositional({ key: "id", name: "baseline-id" }),
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

function parseBaselineCommand(invocation: SituCliInvocation): ParsedBaselineCommand {
  const [subcommand, ...args] = invocation.rest;

  if (subcommand === undefined) {
    throwParserError({
      message: "Command baselines requires a subcommand.",
      details: { command: "baselines" },
      outputMode: invocation.outputMode,
    });
  }

  switch (subcommand) {
    case "create":
      return parseCreateBaselineCommand({ invocation, args });

    case "list":
      return parseListBaselineCommand({ invocation, args });

    case "get":
      return parseGetBaselineCommand({ invocation, args });

    case "move":
      return parseMoveBaselineCommand({ invocation, args });

    default:
      throwParserError({
        message: `Unknown baselines subcommand: ${subcommand}.`,
        details: { command: "baselines", subcommand },
        outputMode: invocation.outputMode,
      });
  }
}

function parseCreateBaselineCommand(input: {
  readonly invocation: SituCliInvocation;
  readonly args: readonly string[];
}): Extract<ParsedBaselineCommand, { readonly subcommand: "create" }> {
  const options = parseDefinedCommandSpec({
    invocation: input.invocation,
    args: input.args,
    spec: createBaselineCommand,
  });

  return {
    subcommand: "create",
    id: options.id as SituId<"baseline"> | undefined,
    eventId: options.eventId as SituId<"event"> | undefined,
    projectId: options.projectId as SituId<"project">,
    taskId: options.taskId as SituId<"task"> | undefined,
    title: options.title,
    summaryMarkdown: options.summaryMarkdown,
    status: parseOptionalBaselineStatus({
      invocation: input.invocation,
      status: options.status,
    }),
    actor: parseActorRef({
      invocation: input.invocation,
      kindFlag: "--actor-kind",
      kind: options.actorKind,
      id: options.actorId,
      displayName: options.actorDisplayName,
    }),
    now: options.now as IsoTimestamp | undefined,
  };
}

function parseListBaselineCommand(input: {
  readonly invocation: SituCliInvocation;
  readonly args: readonly string[];
}): Extract<ParsedBaselineCommand, { readonly subcommand: "list" }> {
  const options = parseDefinedCommandSpec({
    invocation: input.invocation,
    args: input.args,
    spec: listBaselineCommand,
  });

  return {
    subcommand: "list",
    projectId: options.projectId as SituId<"project"> | undefined,
    taskId: options.taskId as SituId<"task"> | undefined,
    status: parseOptionalBaselineStatus({
      invocation: input.invocation,
      status: options.status,
    }),
  };
}

function parseGetBaselineCommand(input: {
  readonly invocation: SituCliInvocation;
  readonly args: readonly string[];
}): Extract<ParsedBaselineCommand, { readonly subcommand: "get" }> {
  const options = parseDefinedCommandSpec({
    invocation: input.invocation,
    args: input.args,
    spec: getBaselineCommand,
  });

  return {
    subcommand: "get",
    id: options.id as SituId<"baseline">,
  };
}

function parseMoveBaselineCommand(input: {
  readonly invocation: SituCliInvocation;
  readonly args: readonly string[];
}): Extract<ParsedBaselineCommand, { readonly subcommand: "move" }> {
  const options = parseDefinedCommandSpec({
    invocation: input.invocation,
    args: input.args,
    spec: moveBaselineCommand,
  });

  return {
    subcommand: "move",
    id: options.id as SituId<"baseline">,
    eventId: options.eventId as SituId<"event"> | undefined,
    status: parseBaselineStatus({
      invocation: input.invocation,
      status: options.status,
    }),
    actor: parseActorRef({
      invocation: input.invocation,
      kindFlag: "--actor-kind",
      kind: options.actorKind,
      id: options.actorId,
      displayName: options.actorDisplayName,
    }),
    now: options.now as IsoTimestamp | undefined,
  };
}

function parseOptionalBaselineStatus(input: {
  readonly invocation: SituCliInvocation;
  readonly status?: string;
}): BaselineStatus | undefined {
  if (input.status === undefined) {
    return undefined;
  }

  return parseBaselineStatus({
    invocation: input.invocation,
    status: input.status,
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
