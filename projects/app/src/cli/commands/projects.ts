import { basename } from "node:path";

import type { ActorRef, IsoTimestamp, SituId } from "@situ/common";
import { NotFoundError } from "@situ/errors";
import * as v from "valibot";

import {
  archiveProjectAction,
  createAppActionContext,
  createProjectAction,
  getProjectAction,
  listProjectsAction,
} from "../../actions/index.js";
import { openAppDatabase } from "../../db/index.js";
import { findCurrentRepositoryRoot } from "../../repositories/index.js";
import {
  defineCommandSpec,
  noPositionals,
  parseActorRef,
  parseDefinedCommandSpec,
  parseProjectStatus,
  singlePositional,
  throwParserError,
  valueOption,
  type ProjectStatus,
} from "../flags.js";
import { formatDataResult, formatProjectLines } from "../format.js";
import type { SituCliInvocation, SituCliResult } from "../types.js";

export function runProjectsCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult {
  const parsedCommand = parseProjectCommand(input.invocation);

  return withActionContext({
    invocation: input.invocation,
    run: (context) => {
      switch (parsedCommand.subcommand) {
        case "create": {
          const result = createProjectAction({
            context,
            id: parsedCommand.id,
            eventId: parsedCommand.eventId,
            name: parsedCommand.name,
            repositoryPath: parsedCommand.repositoryPath,
            goalMarkdown: parsedCommand.goal,
            createdBy: parsedCommand.actor,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Created project ${result.project.id} (event ${result.event.id})`,
          });
        }

        case "init": {
          const result = createProjectAction({
            context,
            id: parsedCommand.id,
            eventId: parsedCommand.eventId,
            name: parsedCommand.name,
            repositoryPath: parsedCommand.repositoryPath,
            goalMarkdown: parsedCommand.goal,
            createdBy: parsedCommand.actor,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Initialized project ${result.project.id} (event ${result.event.id})`,
          });
        }

        case "list": {
          const projects = listProjectsAction({
            context,
            status: parsedCommand.status,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { projects },
            text: formatProjectLines(projects),
          });
        }

        case "current": {
          const projects = listProjectsAction({
            context,
            status: parsedCommand.status,
            repositoryPath: parsedCommand.repositoryPath,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { projects },
            text: formatProjectLines(projects),
          });
        }

        case "get": {
          const project = getProjectAction({
            context,
            id: parsedCommand.id,
          });

          if (project === undefined) {
            throw new NotFoundError({
              message: "Project was not found.",
              details: { id: parsedCommand.id },
            });
          }

          return formatDataResult({
            invocation: input.invocation,
            data: { project },
            text: formatProjectLines([project]),
          });
        }

        case "archive": {
          const result = archiveProjectAction({
            context,
            id: parsedCommand.id,
            eventId: parsedCommand.eventId,
            actor: parsedCommand.actor,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Archived project ${result.project.id} (event ${result.event.id})`,
          });
        }
      }
    },
  });
}

type ParsedProjectCommand =
  | {
      readonly subcommand: "create";
      readonly id?: SituId<"project">;
      readonly eventId?: SituId<"event">;
      readonly name: string;
      readonly repositoryPath: string;
      readonly goal: string;
      readonly actor: ActorRef;
      readonly now?: IsoTimestamp;
    }
  | {
      readonly subcommand: "init";
      readonly id?: SituId<"project">;
      readonly eventId?: SituId<"event">;
      readonly name: string;
      readonly repositoryPath: string;
      readonly goal: string;
      readonly actor: ActorRef;
      readonly now?: IsoTimestamp;
    }
  | {
      readonly subcommand: "list";
      readonly status?: ProjectStatus;
    }
  | {
      readonly subcommand: "current";
      readonly status?: ProjectStatus;
      readonly repositoryPath: string;
    }
  | {
      readonly subcommand: "get";
      readonly id: SituId<"project">;
    }
  | {
      readonly subcommand: "archive";
      readonly id: SituId<"project">;
      readonly eventId?: SituId<"event">;
      readonly actor: ActorRef;
      readonly now?: IsoTimestamp;
    };

const createProjectCommand = defineCommandSpec({
  command: "projects create",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    valueOption({ key: "eventId", flag: "--event-id" }),
    valueOption({ key: "name", flag: "--name", required: true }),
    valueOption({ key: "repositoryPath", flag: "--repository-path", required: true }),
    valueOption({ key: "goal", flag: "--goal", required: true }),
    valueOption({ key: "actorKind", flag: "--actor-kind", required: true }),
    valueOption({ key: "actorId", flag: "--actor-id", required: true }),
    valueOption({ key: "actorDisplayName", flag: "--actor-display-name" }),
    valueOption({ key: "now", flag: "--now" }),
  ],
  schema: v.object({
    id: v.optional(v.string()),
    eventId: v.optional(v.string()),
    name: v.string(),
    repositoryPath: v.string(),
    goal: v.string(),
    actorKind: v.string(),
    actorId: v.string(),
    actorDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
  }),
});

const initProjectCommand = defineCommandSpec({
  command: "projects init",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    valueOption({ key: "eventId", flag: "--event-id" }),
    valueOption({ key: "name", flag: "--name" }),
    valueOption({ key: "goal", flag: "--goal", required: true }),
    valueOption({ key: "actorKind", flag: "--actor-kind", required: true }),
    valueOption({ key: "actorId", flag: "--actor-id", required: true }),
    valueOption({ key: "actorDisplayName", flag: "--actor-display-name" }),
    valueOption({ key: "now", flag: "--now" }),
  ],
  schema: v.object({
    id: v.optional(v.string()),
    eventId: v.optional(v.string()),
    name: v.optional(v.string()),
    goal: v.string(),
    actorKind: v.string(),
    actorId: v.string(),
    actorDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
  }),
});

const listProjectCommand = defineCommandSpec({
  command: "projects list",
  positionals: noPositionals(),
  options: [valueOption({ key: "status", flag: "--status" })],
  schema: v.object({
    status: v.optional(v.string()),
  }),
});

const currentProjectCommand = defineCommandSpec({
  command: "projects current",
  positionals: noPositionals(),
  options: [valueOption({ key: "status", flag: "--status" })],
  schema: v.object({
    status: v.optional(v.string()),
  }),
});

const getProjectCommand = defineCommandSpec({
  command: "projects get",
  positionals: singlePositional({ key: "id", name: "project-id" }),
  options: [],
  schema: v.object({
    id: v.string(),
  }),
});

const archiveProjectCommand = defineCommandSpec({
  command: "projects archive",
  positionals: singlePositional({ key: "id", name: "project-id" }),
  options: [
    valueOption({ key: "eventId", flag: "--event-id" }),
    valueOption({ key: "actorKind", flag: "--actor-kind", required: true }),
    valueOption({ key: "actorId", flag: "--actor-id", required: true }),
    valueOption({ key: "actorDisplayName", flag: "--actor-display-name" }),
    valueOption({ key: "now", flag: "--now" }),
  ],
  schema: v.object({
    id: v.string(),
    eventId: v.optional(v.string()),
    actorKind: v.string(),
    actorId: v.string(),
    actorDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
  }),
});

function parseProjectCommand(invocation: SituCliInvocation): ParsedProjectCommand {
  const [subcommand, ...args] = invocation.rest;

  if (subcommand === undefined) {
    throwParserError({
      message: "Command projects requires a subcommand.",
      details: { command: "projects" },
      outputMode: invocation.outputMode,
    });
  }

  switch (subcommand) {
    case "create": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: createProjectCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"project"> | undefined,
        eventId: options.eventId as SituId<"event"> | undefined,
        name: options.name,
        repositoryPath: options.repositoryPath,
        goal: options.goal,
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

    case "init": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: initProjectCommand,
      });
      const actor = parseActorRef({
        invocation,
        kindFlag: "--actor-kind",
        kind: options.actorKind,
        id: options.actorId,
        displayName: options.actorDisplayName,
      });
      const repositoryPath = findCurrentRepositoryRoot({ cwd: invocation.cwd });

      return {
        subcommand,
        id: options.id as SituId<"project"> | undefined,
        eventId: options.eventId as SituId<"event"> | undefined,
        name: options.name ?? basename(repositoryPath),
        repositoryPath,
        goal: options.goal,
        actor,
        now: options.now as IsoTimestamp | undefined,
      };
    }

    case "list": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: listProjectCommand,
      });

      return {
        subcommand,
        status:
          options.status === undefined
            ? undefined
            : parseProjectStatus({
                invocation,
                status: options.status,
              }),
      };
    }

    case "current": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: currentProjectCommand,
      });

      return {
        subcommand,
        status:
          options.status === undefined
            ? undefined
            : parseProjectStatus({
                invocation,
                status: options.status,
              }),
        repositoryPath: findCurrentRepositoryRoot({ cwd: invocation.cwd }),
      };
    }

    case "get": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: getProjectCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"project">,
      };
    }

    case "archive": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: archiveProjectCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"project">,
        eventId: options.eventId as SituId<"event"> | undefined,
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
        message: `Unknown projects subcommand: ${subcommand}.`,
        details: { command: "projects", subcommand },
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
