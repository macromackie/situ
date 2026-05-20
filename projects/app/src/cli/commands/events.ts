import type { ActorRef, IsoTimestamp, SituId, TargetRef } from "@situ/common";
import { NotFoundError } from "@situ/errors";
import * as v from "valibot";

import {
  createAppActionContext,
  createEventAction,
  getEventAction,
  listEventsAction,
  listRecentEventsAction,
} from "../../actions/index.js";
import { openAppDatabase } from "../../db/index.js";
import {
  defineCommandSpec,
  noPositionals,
  parseActorRef,
  parseDefinedCommandSpec,
  parsePositiveIntegerLimit,
  parseTargetKind,
  singlePositional,
  throwParserError,
  valueOption,
} from "../flags.js";
import { formatDataResult, formatEventLines } from "../format.js";
import type { SituCliInvocation, SituCliResult } from "../types.js";

export function runEventsCommand(input: { readonly invocation: SituCliInvocation }): SituCliResult {
  const parsedCommand = parseEventCommand(input.invocation);

  return withActionContext({
    invocation: input.invocation,
    run: (context) => {
      switch (parsedCommand.subcommand) {
        case "create": {
          const result = createEventAction({
            context,
            id: parsedCommand.id,
            target: parsedCommand.target,
            actor: parsedCommand.actor,
            summaryMarkdown: parsedCommand.summaryMarkdown,
            bodyMarkdown: parsedCommand.bodyMarkdown,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Created event ${result.event.id}`,
          });
        }

        case "list": {
          const events = listEventsAction({
            context,
            target: parsedCommand.target,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { events },
            text: formatEventLines(events),
          });
        }

        case "recent": {
          const events = listRecentEventsAction({
            context,
            limit: parsedCommand.limit,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { events },
            text: formatEventLines(events),
          });
        }

        case "get": {
          const event = getEventAction({
            context,
            id: parsedCommand.id,
          });

          if (event === undefined) {
            throw new NotFoundError({
              message: "Event was not found.",
              details: { id: parsedCommand.id },
            });
          }

          return formatDataResult({
            invocation: input.invocation,
            data: { event },
            text: formatEventLines([event]),
          });
        }
      }
    },
  });
}

type ParsedEventCommand =
  | {
      readonly subcommand: "create";
      readonly id?: SituId<"event">;
      readonly target: TargetRef;
      readonly actor: ActorRef;
      readonly summaryMarkdown: string;
      readonly bodyMarkdown?: string;
      readonly now?: IsoTimestamp;
    }
  | {
      readonly subcommand: "list";
      readonly target: TargetRef;
    }
  | {
      readonly subcommand: "recent";
      readonly limit?: number;
    }
  | {
      readonly subcommand: "get";
      readonly id: SituId<"event">;
    };

const createEventCommand = defineCommandSpec({
  command: "events create",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    valueOption({ key: "targetKind", flag: "--target-kind", required: true }),
    valueOption({ key: "targetId", flag: "--target-id", required: true }),
    valueOption({ key: "actorKind", flag: "--actor-kind", required: true }),
    valueOption({ key: "actorId", flag: "--actor-id", required: true }),
    valueOption({ key: "actorDisplayName", flag: "--actor-display-name" }),
    valueOption({ key: "summaryMarkdown", flag: "--summary", required: true }),
    valueOption({ key: "bodyMarkdown", flag: "--body" }),
    valueOption({ key: "now", flag: "--now" }),
  ],
  schema: v.object({
    id: v.optional(v.string()),
    targetKind: v.string(),
    targetId: v.string(),
    actorKind: v.string(),
    actorId: v.string(),
    actorDisplayName: v.optional(v.string()),
    summaryMarkdown: v.string(),
    bodyMarkdown: v.optional(v.string()),
    now: v.optional(v.string()),
  }),
});

const listEventCommand = defineCommandSpec({
  command: "events list",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "targetKind", flag: "--target-kind", required: true }),
    valueOption({ key: "targetId", flag: "--target-id", required: true }),
  ],
  schema: v.object({
    targetKind: v.string(),
    targetId: v.string(),
  }),
});

const recentEventCommand = defineCommandSpec({
  command: "events recent",
  positionals: noPositionals(),
  options: [valueOption({ key: "limit", flag: "--limit" })],
  schema: v.object({
    limit: v.optional(v.string()),
  }),
});

const getEventCommand = defineCommandSpec({
  command: "events get",
  positionals: singlePositional({ key: "id", name: "event-id" }),
  options: [],
  schema: v.object({
    id: v.string(),
  }),
});

function parseEventCommand(invocation: SituCliInvocation): ParsedEventCommand {
  const [subcommand, ...args] = invocation.rest;

  if (subcommand === undefined) {
    throwParserError({
      message: "Command events requires a subcommand.",
      details: { command: "events" },
      outputMode: invocation.outputMode,
    });
  }

  switch (subcommand) {
    case "create": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: createEventCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"event"> | undefined,
        target: parseTarget({
          invocation,
          targetKindValue: options.targetKind,
          targetId: options.targetId,
        }),
        actor: parseActorRef({
          invocation,
          kindFlag: "--actor-kind",
          kind: options.actorKind,
          id: options.actorId,
          displayName: options.actorDisplayName,
        }),
        summaryMarkdown: options.summaryMarkdown,
        bodyMarkdown: options.bodyMarkdown,
        now: options.now as IsoTimestamp | undefined,
      };
    }

    case "list": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: listEventCommand,
      });

      return {
        subcommand,
        target: parseTarget({
          invocation,
          targetKindValue: options.targetKind,
          targetId: options.targetId,
        }),
      };
    }

    case "recent": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: recentEventCommand,
      });

      return {
        subcommand,
        limit:
          options.limit === undefined
            ? undefined
            : parsePositiveIntegerLimit({
                invocation,
                value: options.limit,
              }),
      };
    }

    case "get": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: getEventCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"event">,
      };
    }

    default:
      throwParserError({
        message: `Unknown events subcommand: ${subcommand}.`,
        details: { command: "events", subcommand },
        outputMode: invocation.outputMode,
      });
  }
}

function parseTarget(input: {
  readonly invocation: SituCliInvocation;
  readonly targetKindValue: string;
  readonly targetId: string;
}): TargetRef {
  const targetKind = parseTargetKind({
    invocation: input.invocation,
    value: input.targetKindValue,
  });

  return {
    targetKind,
    targetId: input.targetId,
  } as TargetRef;
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
