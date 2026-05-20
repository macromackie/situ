import type { ActorRef, IsoTimestamp, SituId, TargetRef } from "@situ/common";
import { NotFoundError } from "@situ/errors";
import * as v from "valibot";

import {
  createAppActionContext,
  createCommentAction,
  getCommentAction,
  listCommentsAction,
} from "../../actions/index.js";
import { openAppDatabase } from "../../db/index.js";
import {
  defineCommandSpec,
  noPositionals,
  parseActorRef,
  parseDefinedCommandSpec,
  parseTargetKind,
  singlePositional,
  throwParserError,
  valueOption,
} from "../flags.js";
import { formatCommentLines, formatDataResult } from "../format.js";
import type { SituCliInvocation, SituCliResult } from "../types.js";

export function runCommentsCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult {
  const parsedCommand = parseCommentCommand(input.invocation);

  return withActionContext({
    invocation: input.invocation,
    run: (context) => {
      switch (parsedCommand.subcommand) {
        case "create": {
          const result = createCommentAction({
            context,
            id: parsedCommand.id,
            target: parsedCommand.target,
            bodyMarkdown: parsedCommand.bodyMarkdown,
            author: parsedCommand.author,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Created comment ${result.comment.id}`,
          });
        }

        case "list": {
          const comments = listCommentsAction({
            context,
            target: parsedCommand.target,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { comments },
            text: formatCommentLines(comments),
          });
        }

        case "get": {
          const comment = getCommentAction({
            context,
            id: parsedCommand.id,
          });

          if (comment === undefined) {
            throw new NotFoundError({
              message: "Comment was not found.",
              details: { id: parsedCommand.id },
            });
          }

          return formatDataResult({
            invocation: input.invocation,
            data: { comment },
            text: formatCommentLines([comment]),
          });
        }
      }
    },
  });
}

type ParsedCommentCommand =
  | {
      readonly subcommand: "create";
      readonly id?: SituId<"comment">;
      readonly target: TargetRef;
      readonly author: ActorRef;
      readonly bodyMarkdown: string;
      readonly now?: IsoTimestamp;
    }
  | {
      readonly subcommand: "list";
      readonly target: TargetRef;
    }
  | {
      readonly subcommand: "get";
      readonly id: SituId<"comment">;
    };

const createCommentCommand = defineCommandSpec({
  command: "comments create",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    valueOption({ key: "targetKind", flag: "--target-kind", required: true }),
    valueOption({ key: "targetId", flag: "--target-id", required: true }),
    valueOption({ key: "actorKind", flag: "--actor-kind", required: true }),
    valueOption({ key: "actorId", flag: "--actor-id", required: true }),
    valueOption({ key: "actorDisplayName", flag: "--actor-display-name" }),
    valueOption({ key: "bodyMarkdown", flag: "--body", required: true }),
    valueOption({ key: "now", flag: "--now" }),
  ],
  schema: v.object({
    id: v.optional(v.string()),
    targetKind: v.string(),
    targetId: v.string(),
    actorKind: v.string(),
    actorId: v.string(),
    actorDisplayName: v.optional(v.string()),
    bodyMarkdown: v.string(),
    now: v.optional(v.string()),
  }),
});

const listCommentCommand = defineCommandSpec({
  command: "comments list",
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

const getCommentCommand = defineCommandSpec({
  command: "comments get",
  positionals: singlePositional({ key: "id", name: "comment-id" }),
  options: [],
  schema: v.object({
    id: v.string(),
  }),
});

function parseCommentCommand(invocation: SituCliInvocation): ParsedCommentCommand {
  const [subcommand, ...args] = invocation.rest;

  if (subcommand === undefined) {
    throwParserError({
      message: "Command comments requires a subcommand.",
      details: { command: "comments" },
      outputMode: invocation.outputMode,
    });
  }

  switch (subcommand) {
    case "create": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: createCommentCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"comment"> | undefined,
        target: parseTarget({
          invocation,
          targetKindValue: options.targetKind,
          targetId: options.targetId,
        }),
        author: parseActorRef({
          invocation,
          kindFlag: "--actor-kind",
          kind: options.actorKind,
          id: options.actorId,
          displayName: options.actorDisplayName,
        }),
        bodyMarkdown: options.bodyMarkdown,
        now: options.now as IsoTimestamp | undefined,
      };
    }

    case "list": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: listCommentCommand,
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

    case "get": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: getCommentCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"comment">,
      };
    }

    default:
      throwParserError({
        message: `Unknown comments subcommand: ${subcommand}.`,
        details: { command: "comments", subcommand },
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
