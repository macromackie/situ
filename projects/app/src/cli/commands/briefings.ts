import type { ActorRef, IsoTimestamp, SituId, TargetRef } from "@situ/common";
import {
  type BriefingAssessment,
  type BriefingBlock,
  type BriefingStage,
  briefingAssessments,
  briefingStages,
} from "@situ/briefings";
import { NotFoundError } from "@situ/errors";
import * as v from "valibot";

import {
  createAppActionContext,
  createBriefingAction,
  getBriefingAction,
  listBriefingsForProjectAction,
  listRecentBriefingsAction,
} from "../../actions/index.js";
import { openAppDatabase } from "../../db/index.js";
import {
  defineCommandSpec,
  noPositionals,
  parseActorRef,
  parseDefinedCommandSpec,
  parsePositiveIntegerLimit,
  singlePositional,
  throwParserError,
  valueOption,
} from "../flags.js";
import { formatBriefingLines, formatDataResult } from "../format.js";
import type { SituCliInvocation, SituCliResult } from "../types.js";

export function runBriefingsCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult {
  const parsedCommand = parseBriefingCommand(input.invocation);

  return withActionContext({
    invocation: input.invocation,
    run: (context) => {
      switch (parsedCommand.subcommand) {
        case "create": {
          const result = createBriefingAction({
            context,
            id: parsedCommand.id,
            projectId: parsedCommand.projectId,
            title: parsedCommand.title,
            stage: parsedCommand.stage,
            assessment: parsedCommand.assessment,
            headlineMarkdown: parsedCommand.headlineMarkdown,
            blocks: parsedCommand.blocks,
            evidenceRefs: parsedCommand.evidenceRefs,
            authoredBy: parsedCommand.authoredBy,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Created briefing ${result.briefing.id}`,
          });
        }

        case "list": {
          const briefings = listBriefingsForProjectAction({
            context,
            projectId: parsedCommand.projectId,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { briefings },
            text: formatBriefingLines(briefings),
          });
        }

        case "recent": {
          const briefings = listRecentBriefingsAction({
            context,
            limit: parsedCommand.limit,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { briefings },
            text: formatBriefingLines(briefings),
          });
        }

        case "get": {
          const briefing = getBriefingAction({
            context,
            id: parsedCommand.id,
          });

          if (briefing === undefined) {
            throw new NotFoundError({
              message: "Briefing was not found.",
              details: { id: parsedCommand.id },
            });
          }

          return formatDataResult({
            invocation: input.invocation,
            data: { briefing },
            text: formatBriefingLines([briefing]),
          });
        }
      }
    },
  });
}

type ParsedBriefingCommand =
  | {
      readonly subcommand: "create";
      readonly id?: SituId<"briefing">;
      readonly projectId: SituId<"project">;
      readonly title: string;
      readonly stage: BriefingStage;
      readonly assessment: BriefingAssessment;
      readonly headlineMarkdown: string;
      readonly blocks: readonly BriefingBlock[];
      readonly evidenceRefs: readonly TargetRef[];
      readonly authoredBy: ActorRef;
      readonly now?: IsoTimestamp;
    }
  | {
      readonly subcommand: "list";
      readonly projectId: SituId<"project">;
    }
  | {
      readonly subcommand: "recent";
      readonly limit?: number;
    }
  | {
      readonly subcommand: "get";
      readonly id: SituId<"briefing">;
    };

const createBriefingCommand = defineCommandSpec({
  command: "briefings create",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    valueOption({ key: "projectId", flag: "--project-id", required: true }),
    valueOption({ key: "title", flag: "--title", required: true }),
    valueOption({ key: "stage", flag: "--stage", required: true }),
    valueOption({ key: "assessment", flag: "--assessment", required: true }),
    valueOption({ key: "headlineMarkdown", flag: "--headline", required: true }),
    valueOption({ key: "blockJson", flag: "--block-json" }),
    valueOption({ key: "blocksJson", flag: "--blocks-json" }),
    valueOption({ key: "evidenceRefsJson", flag: "--evidence-refs-json" }),
    valueOption({ key: "authoredByKind", flag: "--authored-by-kind", required: true }),
    valueOption({ key: "authoredById", flag: "--authored-by-id", required: true }),
    valueOption({ key: "authoredByDisplayName", flag: "--authored-by-display-name" }),
    valueOption({ key: "now", flag: "--now" }),
  ],
  schema: v.object({
    id: v.optional(v.string()),
    projectId: v.string(),
    title: v.string(),
    stage: v.string(),
    assessment: v.string(),
    headlineMarkdown: v.string(),
    blockJson: v.optional(v.string()),
    blocksJson: v.optional(v.string()),
    evidenceRefsJson: v.optional(v.string()),
    authoredByKind: v.string(),
    authoredById: v.string(),
    authoredByDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
  }),
});

const listBriefingCommand = defineCommandSpec({
  command: "briefings list",
  positionals: noPositionals(),
  options: [valueOption({ key: "projectId", flag: "--project-id", required: true })],
  schema: v.object({
    projectId: v.string(),
  }),
});

const recentBriefingCommand = defineCommandSpec({
  command: "briefings recent",
  positionals: noPositionals(),
  options: [valueOption({ key: "limit", flag: "--limit" })],
  schema: v.object({
    limit: v.optional(v.string()),
  }),
});

const getBriefingCommand = defineCommandSpec({
  command: "briefings get",
  positionals: singlePositional({ key: "id", name: "briefing-id" }),
  options: [],
  schema: v.object({
    id: v.string(),
  }),
});

function parseBriefingCommand(invocation: SituCliInvocation): ParsedBriefingCommand {
  const [subcommand, ...args] = invocation.rest;

  if (subcommand === undefined) {
    throwParserError({
      message: "Command briefings requires a subcommand.",
      details: { command: "briefings" },
      outputMode: invocation.outputMode,
    });
  }

  switch (subcommand) {
    case "create": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: createBriefingCommand,
      });
      const blockJsonValues = collectRepeatedValueOption({
        invocation,
        command: "briefings create",
        args,
        flag: "--block-json",
      });

      return {
        subcommand,
        id: options.id as SituId<"briefing"> | undefined,
        projectId: options.projectId as SituId<"project">,
        title: options.title,
        stage: parseBriefingStage({
          invocation,
          value: options.stage,
        }),
        assessment: parseBriefingAssessment({
          invocation,
          value: options.assessment,
        }),
        headlineMarkdown: options.headlineMarkdown,
        blocks: parseBriefingBlocks({
          invocation,
          blocksJson: options.blocksJson,
          blockJsonValues,
        }),
        evidenceRefs: parseEvidenceRefs({
          invocation,
          value: options.evidenceRefsJson,
        }),
        authoredBy: parseActorRef({
          invocation,
          kindFlag: "--authored-by-kind",
          kind: options.authoredByKind,
          id: options.authoredById,
          displayName: options.authoredByDisplayName,
        }),
        now: options.now as IsoTimestamp | undefined,
      };
    }

    case "list": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: listBriefingCommand,
      });

      return {
        subcommand,
        projectId: options.projectId as SituId<"project">,
      };
    }

    case "recent": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: recentBriefingCommand,
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
        spec: getBriefingCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"briefing">,
      };
    }

    default:
      throwParserError({
        message: `Unknown briefings subcommand: ${subcommand}.`,
        details: { command: "briefings", subcommand },
        outputMode: invocation.outputMode,
      });
  }
}

function parseBriefingStage(input: {
  readonly invocation: SituCliInvocation;
  readonly value: string;
}): BriefingStage {
  if ((briefingStages as readonly string[]).includes(input.value)) {
    return input.value as BriefingStage;
  }

  throwParserError({
    message: `Invalid briefing stage: ${input.value}.`,
    details: { value: input.value, allowedValues: briefingStages },
    outputMode: input.invocation.outputMode,
  });
}

function parseBriefingAssessment(input: {
  readonly invocation: SituCliInvocation;
  readonly value: string;
}): BriefingAssessment {
  if ((briefingAssessments as readonly string[]).includes(input.value)) {
    return input.value as BriefingAssessment;
  }

  throwParserError({
    message: `Invalid briefing assessment: ${input.value}.`,
    details: { value: input.value, allowedValues: briefingAssessments },
    outputMode: input.invocation.outputMode,
  });
}

function parseBriefingBlocks(input: {
  readonly invocation: SituCliInvocation;
  readonly blocksJson?: string;
  readonly blockJsonValues: readonly string[];
}): readonly BriefingBlock[] {
  if (input.blocksJson !== undefined && input.blockJsonValues.length > 0) {
    throwParserError({
      message: "Command briefings create cannot combine --blocks-json with --block-json.",
      details: { command: "briefings create", flags: ["--blocks-json", "--block-json"] },
      outputMode: input.invocation.outputMode,
    });
  }

  if (input.blocksJson !== undefined) {
    const blocks = parseJson({
      invocation: input.invocation,
      flag: "--blocks-json",
      value: input.blocksJson,
    });

    if (Array.isArray(blocks)) {
      return blocks as readonly BriefingBlock[];
    }

    throwParserError({
      message: "Expected --blocks-json to be a JSON array.",
      details: { flag: "--blocks-json" },
      outputMode: input.invocation.outputMode,
    });
  }

  return input.blockJsonValues.map((value) => {
    const block = parseJson({
      invocation: input.invocation,
      flag: "--block-json",
      value,
    });

    if (typeof block === "object" && block !== null && !Array.isArray(block)) {
      return block as BriefingBlock;
    }

    throwParserError({
      message: "Expected --block-json to be a JSON object.",
      details: { flag: "--block-json" },
      outputMode: input.invocation.outputMode,
    });
  });
}

function parseEvidenceRefs(input: {
  readonly invocation: SituCliInvocation;
  readonly value?: string;
}): readonly TargetRef[] {
  if (input.value === undefined) {
    return [];
  }

  const refs = parseJson({
    invocation: input.invocation,
    flag: "--evidence-refs-json",
    value: input.value,
  });

  if (Array.isArray(refs)) {
    return refs as readonly TargetRef[];
  }

  throwParserError({
    message: "Expected --evidence-refs-json to be a JSON array.",
    details: { flag: "--evidence-refs-json" },
    outputMode: input.invocation.outputMode,
  });
}

function parseJson(input: {
  readonly invocation: SituCliInvocation;
  readonly flag: string;
  readonly value: string;
}): unknown {
  try {
    return JSON.parse(input.value);
  } catch (error) {
    throwParserError({
      message: `Invalid JSON for ${input.flag}.`,
      details: {
        flag: input.flag,
        cause: error instanceof Error ? error.message : String(error),
      },
      outputMode: input.invocation.outputMode,
    });
  }
}

function collectRepeatedValueOption(input: {
  readonly invocation: SituCliInvocation;
  readonly command: string;
  readonly args: readonly string[];
  readonly flag: string;
}): readonly string[] {
  const values: string[] = [];

  for (let index = 0; index < input.args.length; index += 1) {
    const arg = input.args[index];

    if (arg === input.flag) {
      const value = input.args[index + 1];

      if (value === undefined || value.startsWith("--")) {
        throwParserError({
          message: `Missing value for ${input.flag}.`,
          details: { command: input.command, flag: input.flag },
          outputMode: input.invocation.outputMode,
        });
      }

      values.push(value);
      index += 1;
      continue;
    }

    const equalsPrefix = `${input.flag}=`;

    if (arg.startsWith(equalsPrefix)) {
      values.push(arg.slice(equalsPrefix.length));
    }
  }

  return values;
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
