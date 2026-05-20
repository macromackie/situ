import type { ActorRef, IsoTimestamp, SituId } from "@situ/common";
import { NotFoundError } from "@situ/errors";
import type { ReviewDecision } from "@situ/reviews";
import * as v from "valibot";

import {
  createAppActionContext,
  createReviewAction,
  getReviewAction,
  listRecentReviewsAction,
  listReviewsAction,
} from "../../actions/index.js";
import { openAppDatabase } from "../../db/index.js";
import {
  defineCommandSpec,
  noPositionals,
  parseActorRef,
  parseDefinedCommandSpec,
  parsePositiveIntegerLimit,
  parsePositiveIntegerRevisionNumber,
  singlePositional,
  throwParserError,
  valueOption,
} from "../flags.js";
import { formatDataResult, formatReviewLines } from "../format.js";
import type { SituCliInvocation, SituCliResult } from "../types.js";

const reviewDecisions = ["approved", "changes_requested", "rejected", "commented"] as const;
const ReviewDecisionSchema = v.picklist(reviewDecisions);

export function runReviewsCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult {
  const parsedCommand = parseReviewCommand(input.invocation);

  return withActionContext({
    invocation: input.invocation,
    run: (context) => {
      switch (parsedCommand.subcommand) {
        case "create": {
          const result = createReviewAction({
            context,
            id: parsedCommand.id,
            experimentId: parsedCommand.experimentId,
            revisionNumber: parsedCommand.revisionNumber,
            decision: parsedCommand.decision,
            bodyMarkdown: parsedCommand.bodyMarkdown,
            reviewer: parsedCommand.reviewer,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Created review ${result.review.id}`,
          });
        }

        case "list": {
          const reviews = listReviewsAction({
            context,
            experimentId: parsedCommand.experimentId,
            revisionNumber: parsedCommand.revisionNumber,
            decision: parsedCommand.decision,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { reviews },
            text: formatReviewLines(reviews),
          });
        }

        case "recent": {
          const reviews = listRecentReviewsAction({
            context,
            limit: parsedCommand.limit,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { reviews },
            text: formatReviewLines(reviews),
          });
        }

        case "get": {
          const review = getReviewAction({
            context,
            id: parsedCommand.id,
          });

          if (review === undefined) {
            throw new NotFoundError({
              message: "Review was not found.",
              details: { id: parsedCommand.id },
            });
          }

          return formatDataResult({
            invocation: input.invocation,
            data: { review },
            text: formatReviewLines([review]),
          });
        }
      }
    },
  });
}

type ParsedReviewCommand =
  | {
      readonly subcommand: "create";
      readonly id?: SituId<"review">;
      readonly experimentId: SituId<"experiment">;
      readonly revisionNumber: number;
      readonly decision: ReviewDecision;
      readonly bodyMarkdown: string;
      readonly reviewer: ActorRef;
      readonly now?: IsoTimestamp;
    }
  | {
      readonly subcommand: "list";
      readonly experimentId: SituId<"experiment">;
      readonly revisionNumber?: number;
      readonly decision?: ReviewDecision;
    }
  | {
      readonly subcommand: "recent";
      readonly limit?: number;
    }
  | {
      readonly subcommand: "get";
      readonly id: SituId<"review">;
    };

const createReviewCommand = defineCommandSpec({
  command: "reviews create",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    valueOption({ key: "experimentId", flag: "--experiment-id", required: true }),
    valueOption({ key: "revisionNumber", flag: "--revision-number", required: true }),
    valueOption({ key: "decision", flag: "--decision", required: true }),
    valueOption({ key: "bodyMarkdown", flag: "--body", required: true }),
    valueOption({ key: "reviewerKind", flag: "--reviewer-kind", required: true }),
    valueOption({ key: "reviewerId", flag: "--reviewer-id", required: true }),
    valueOption({ key: "reviewerDisplayName", flag: "--reviewer-display-name" }),
    valueOption({ key: "now", flag: "--now" }),
  ],
  schema: v.object({
    id: v.optional(v.string()),
    experimentId: v.string(),
    revisionNumber: v.string(),
    decision: v.string(),
    bodyMarkdown: v.string(),
    reviewerKind: v.string(),
    reviewerId: v.string(),
    reviewerDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
  }),
});

const listReviewCommand = defineCommandSpec({
  command: "reviews list",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "experimentId", flag: "--experiment-id", required: true }),
    valueOption({ key: "revisionNumber", flag: "--revision-number" }),
    valueOption({ key: "decision", flag: "--decision" }),
  ],
  schema: v.object({
    experimentId: v.string(),
    revisionNumber: v.optional(v.string()),
    decision: v.optional(v.string()),
  }),
});

const recentReviewCommand = defineCommandSpec({
  command: "reviews recent",
  positionals: noPositionals(),
  options: [valueOption({ key: "limit", flag: "--limit" })],
  schema: v.object({
    limit: v.optional(v.string()),
  }),
});

const getReviewCommand = defineCommandSpec({
  command: "reviews get",
  positionals: singlePositional({ key: "id", name: "review-id" }),
  options: [],
  schema: v.object({
    id: v.string(),
  }),
});

function parseReviewCommand(invocation: SituCliInvocation): ParsedReviewCommand {
  const [subcommand, ...args] = invocation.rest;

  if (subcommand === undefined) {
    throwParserError({
      message: "Command reviews requires a subcommand.",
      details: { command: "reviews" },
      outputMode: invocation.outputMode,
    });
  }

  switch (subcommand) {
    case "create": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: createReviewCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"review"> | undefined,
        experimentId: options.experimentId as SituId<"experiment">,
        revisionNumber: parsePositiveIntegerRevisionNumber({
          invocation,
          value: options.revisionNumber,
        }),
        decision: parseReviewDecision({
          invocation,
          value: options.decision,
        }),
        bodyMarkdown: options.bodyMarkdown,
        reviewer: parseActorRef({
          invocation,
          kindFlag: "--reviewer-kind",
          kind: options.reviewerKind,
          id: options.reviewerId,
          displayName: options.reviewerDisplayName,
        }),
        now: options.now as IsoTimestamp | undefined,
      };
    }

    case "list": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: listReviewCommand,
      });

      return {
        subcommand,
        experimentId: options.experimentId as SituId<"experiment">,
        revisionNumber:
          options.revisionNumber === undefined
            ? undefined
            : parsePositiveIntegerRevisionNumber({
                invocation,
                value: options.revisionNumber,
              }),
        decision:
          options.decision === undefined
            ? undefined
            : parseReviewDecision({
                invocation,
                value: options.decision,
              }),
      };
    }

    case "recent": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: recentReviewCommand,
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
        spec: getReviewCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"review">,
      };
    }

    default:
      throwParserError({
        message: `Unknown reviews subcommand: ${subcommand}.`,
        details: { command: "reviews", subcommand },
        outputMode: invocation.outputMode,
      });
  }
}

function parseReviewDecision(input: {
  readonly invocation: SituCliInvocation;
  readonly value: string;
}): ReviewDecision {
  const parsed = v.safeParse(ReviewDecisionSchema, input.value);

  if (parsed.success) {
    return parsed.output;
  }

  throwParserError({
    message: `Invalid review decision: ${input.value}.`,
    details: {
      value: input.value,
      allowedValues: reviewDecisions,
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
