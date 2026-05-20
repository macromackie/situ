import type { IsoTimestamp, SituId } from "@situ/common";
import { NotFoundError } from "@situ/errors";
import * as v from "valibot";

import {
  createAppActionContext,
  dismissNotificationAction,
  getNotificationAction,
  listNotificationsAction,
  markNotificationReadAction,
} from "../../actions/index.js";
import { openAppDatabase } from "../../db/index.js";
import {
  booleanOption,
  defineCommandSpec,
  noPositionals,
  parseDefinedCommandSpec,
  parsePositiveIntegerLimit,
  singlePositional,
  throwParserError,
  valueOption,
} from "../flags.js";
import { formatDataResult, formatNotificationLines } from "../format.js";
import type { SituCliInvocation, SituCliResult } from "../types.js";

export function runNotificationsCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult {
  const parsedCommand = parseNotificationCommand(input.invocation);

  return withActionContext({
    invocation: input.invocation,
    run: (context) => {
      switch (parsedCommand.subcommand) {
        case "list": {
          const notifications = listNotificationsAction({
            context,
            recipientId: parsedCommand.recipientId,
            includeDismissed: parsedCommand.includeDismissed,
            limit: parsedCommand.limit,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { notifications },
            text: formatNotificationLines(notifications),
          });
        }

        case "get": {
          const notification = getNotificationAction({
            context,
            id: parsedCommand.id,
          });

          if (notification === undefined) {
            throw new NotFoundError({
              message: "Notification was not found.",
              details: { id: parsedCommand.id },
            });
          }

          return formatDataResult({
            invocation: input.invocation,
            data: { notification },
            text: formatNotificationLines([notification]),
          });
        }

        case "read": {
          const result = markNotificationReadAction({
            context,
            id: parsedCommand.id,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Marked notification ${result.notification.id} read`,
          });
        }

        case "dismiss": {
          const result = dismissNotificationAction({
            context,
            id: parsedCommand.id,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Dismissed notification ${result.notification.id}`,
          });
        }
      }
    },
  });
}

type ParsedNotificationCommand =
  | {
      readonly subcommand: "list";
      readonly recipientId: string;
      readonly includeDismissed?: true;
      readonly limit?: number;
    }
  | {
      readonly subcommand: "get";
      readonly id: SituId<"notification">;
    }
  | {
      readonly subcommand: "read";
      readonly id: SituId<"notification">;
      readonly now?: IsoTimestamp;
    }
  | {
      readonly subcommand: "dismiss";
      readonly id: SituId<"notification">;
      readonly now?: IsoTimestamp;
    };

const listNotificationCommand = defineCommandSpec({
  command: "notifications list",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "recipientId", flag: "--recipient-id", required: true }),
    valueOption({ key: "limit", flag: "--limit" }),
    booleanOption({ key: "includeDismissed", flag: "--include-dismissed" }),
  ],
  schema: v.object({
    recipientId: v.string(),
    limit: v.optional(v.string()),
    includeDismissed: v.boolean(),
  }),
});

const getNotificationCommand = defineCommandSpec({
  command: "notifications get",
  positionals: singlePositional({ key: "id", name: "notification-id" }),
  options: [],
  schema: v.object({
    id: v.string(),
  }),
});

const readNotificationCommand = defineCommandSpec({
  command: "notifications read",
  positionals: singlePositional({ key: "id", name: "notification-id" }),
  options: [valueOption({ key: "now", flag: "--now" })],
  schema: v.object({
    id: v.string(),
    now: v.optional(v.string()),
  }),
});

const dismissNotificationCommand = defineCommandSpec({
  command: "notifications dismiss",
  positionals: singlePositional({ key: "id", name: "notification-id" }),
  options: [valueOption({ key: "now", flag: "--now" })],
  schema: v.object({
    id: v.string(),
    now: v.optional(v.string()),
  }),
});

function parseNotificationCommand(invocation: SituCliInvocation): ParsedNotificationCommand {
  const [subcommand, ...args] = invocation.rest;

  if (subcommand === undefined) {
    throwParserError({
      message: "Command notifications requires a subcommand.",
      details: { command: "notifications" },
      outputMode: invocation.outputMode,
    });
  }

  switch (subcommand) {
    case "list": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: listNotificationCommand,
      });

      return {
        subcommand,
        recipientId: options.recipientId,
        includeDismissed: options.includeDismissed ? true : undefined,
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
        spec: getNotificationCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"notification">,
      };
    }

    case "read": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: readNotificationCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"notification">,
        now: options.now as IsoTimestamp | undefined,
      };
    }

    case "dismiss": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: dismissNotificationCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"notification">,
        now: options.now as IsoTimestamp | undefined,
      };
    }

    default:
      throwParserError({
        message: `Unknown notifications subcommand: ${subcommand}.`,
        details: { command: "notifications", subcommand },
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
