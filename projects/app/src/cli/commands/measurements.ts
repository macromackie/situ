import type { ActorRef, IsoTimestamp, SituId } from "@situ/common";
import { NotFoundError } from "@situ/errors";
import type { MeasurementRecord } from "@situ/measurements";
import * as v from "valibot";

import {
  createAppActionContext,
  createMeasurementAction,
  getMeasurementAction,
  listBaselineMeasurementsAction,
  listMeasurementsAction,
  listRecentMeasurementsAction,
} from "../../actions/index.js";
import { openAppDatabase } from "../../db/index.js";
import {
  defineCommandSpec,
  noPositionals,
  parseActorRef,
  parseDefinedCommandSpec,
  parseFiniteNumericValue,
  parsePositiveIntegerLimit,
  parsePositiveIntegerRevisionNumber,
  requireValueOption,
  singlePositional,
  throwParserError,
  valueOption,
} from "../flags.js";
import { formatDataResult, formatMeasurementLines } from "../format.js";
import type { SituCliInvocation, SituCliResult } from "../types.js";

export function runMeasurementsCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult {
  const parsedCommand = parseMeasurementCommand(input.invocation);

  return withActionContext({
    invocation: input.invocation,
    run: (context) => {
      switch (parsedCommand.subcommand) {
        case "create": {
          const result = createMeasurementAction({
            context,
            id: parsedCommand.id,
            baselineId: parsedCommand.baselineId,
            experimentId: parsedCommand.experimentId,
            revisionNumber: parsedCommand.revisionNumber,
            metricName: parsedCommand.metricName,
            numericValue: parsedCommand.numericValue,
            unit: parsedCommand.unit,
            summaryMarkdown: parsedCommand.summaryMarkdown,
            detailsMarkdown: parsedCommand.detailsMarkdown,
            measuredBy: parsedCommand.actor,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Created measurement ${result.measurement.id}`,
          });
        }

        case "list": {
          const measurements = listMeasurementsForParsedTarget({
            context,
            command: parsedCommand,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { measurements },
            text: formatMeasurementLines(measurements),
          });
        }

        case "recent": {
          const measurements = listRecentMeasurementsAction({
            context,
            limit: parsedCommand.limit,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { measurements },
            text: formatMeasurementLines(measurements),
          });
        }

        case "get": {
          const measurement = getMeasurementAction({
            context,
            id: parsedCommand.id,
          });

          if (measurement === undefined) {
            throw new NotFoundError({
              message: "Measurement was not found.",
              details: { id: parsedCommand.id },
            });
          }

          return formatDataResult({
            invocation: input.invocation,
            data: { measurement },
            text: formatMeasurementLines([measurement]),
          });
        }
      }
    },
  });
}

type ParsedMeasurementCommand =
  | {
      readonly subcommand: "create";
      readonly id?: SituId<"measurement">;
      readonly baselineId?: SituId<"baseline">;
      readonly experimentId?: SituId<"experiment">;
      readonly revisionNumber?: number;
      readonly metricName: string;
      readonly numericValue: number;
      readonly unit?: string;
      readonly summaryMarkdown: string;
      readonly detailsMarkdown?: string;
      readonly actor: ActorRef;
      readonly now?: IsoTimestamp;
    }
  | {
      readonly subcommand: "list";
      readonly baselineId?: SituId<"baseline">;
      readonly experimentId?: SituId<"experiment">;
      readonly revisionNumber?: number;
      readonly metricName?: string;
    }
  | {
      readonly subcommand: "recent";
      readonly limit?: number;
    }
  | {
      readonly subcommand: "get";
      readonly id: SituId<"measurement">;
    };

const createMeasurementCommand = defineCommandSpec({
  command: "measurements create",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    valueOption({ key: "baselineId", flag: "--baseline-id" }),
    valueOption({ key: "experimentId", flag: "--experiment-id" }),
    valueOption({ key: "revisionNumber", flag: "--revision-number" }),
    valueOption({ key: "metricName", flag: "--metric-name" }),
    valueOption({ key: "numericValue", flag: "--value" }),
    valueOption({ key: "unit", flag: "--unit" }),
    valueOption({ key: "summaryMarkdown", flag: "--summary" }),
    valueOption({ key: "detailsMarkdown", flag: "--details" }),
    valueOption({ key: "actorKind", flag: "--actor-kind" }),
    valueOption({ key: "actorId", flag: "--actor-id" }),
    valueOption({ key: "actorDisplayName", flag: "--actor-display-name" }),
    valueOption({ key: "now", flag: "--now" }),
  ],
  schema: v.object({
    id: v.optional(v.string()),
    baselineId: v.optional(v.string()),
    experimentId: v.optional(v.string()),
    revisionNumber: v.optional(v.string()),
    metricName: v.optional(v.string()),
    numericValue: v.optional(v.string()),
    unit: v.optional(v.string()),
    summaryMarkdown: v.optional(v.string()),
    detailsMarkdown: v.optional(v.string()),
    actorKind: v.optional(v.string()),
    actorId: v.optional(v.string()),
    actorDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
  }),
});

const listMeasurementCommand = defineCommandSpec({
  command: "measurements list",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "baselineId", flag: "--baseline-id" }),
    valueOption({ key: "experimentId", flag: "--experiment-id" }),
    valueOption({ key: "revisionNumber", flag: "--revision-number" }),
    valueOption({ key: "metricName", flag: "--metric-name" }),
  ],
  schema: v.object({
    baselineId: v.optional(v.string()),
    experimentId: v.optional(v.string()),
    revisionNumber: v.optional(v.string()),
    metricName: v.optional(v.string()),
  }),
});

const recentMeasurementCommand = defineCommandSpec({
  command: "measurements recent",
  positionals: noPositionals(),
  options: [valueOption({ key: "limit", flag: "--limit" })],
  schema: v.object({
    limit: v.optional(v.string()),
  }),
});

const getMeasurementCommand = defineCommandSpec({
  command: "measurements get",
  positionals: singlePositional({ key: "id", name: "measurement-id" }),
  options: [],
  schema: v.object({
    id: v.string(),
  }),
});

function parseMeasurementCommand(invocation: SituCliInvocation): ParsedMeasurementCommand {
  const [subcommand, ...args] = invocation.rest;

  if (subcommand === undefined) {
    throwParserError({
      message: "Command measurements requires a subcommand.",
      details: { command: "measurements" },
      outputMode: invocation.outputMode,
    });
  }

  switch (subcommand) {
    case "create": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: createMeasurementCommand,
      });
      const target = parseMeasurementTarget({
        invocation,
        command: "measurements create",
        baselineId: options.baselineId,
        experimentId: options.experimentId,
        revisionNumberValue: options.revisionNumber,
        revisionNumberRequired: true,
      });
      const metricName = requireValueOption({
        invocation,
        flag: "--metric-name",
        value: options.metricName,
      });
      const numericValue = requireValueOption({
        invocation,
        flag: "--value",
        value: options.numericValue,
      });
      const summaryMarkdown = requireValueOption({
        invocation,
        flag: "--summary",
        value: options.summaryMarkdown,
      });
      const actorKind = requireValueOption({
        invocation,
        flag: "--actor-kind",
        value: options.actorKind,
      });
      const actorId = requireValueOption({
        invocation,
        flag: "--actor-id",
        value: options.actorId,
      });

      return {
        subcommand,
        id: options.id as SituId<"measurement"> | undefined,
        baselineId: target.baselineId,
        experimentId: target.experimentId,
        revisionNumber: target.revisionNumber,
        metricName,
        numericValue: parseFiniteNumericValue({
          invocation,
          value: numericValue,
        }),
        unit: options.unit,
        summaryMarkdown,
        detailsMarkdown: options.detailsMarkdown,
        actor: parseActorRef({
          invocation,
          kindFlag: "--actor-kind",
          kind: actorKind,
          id: actorId,
          displayName: options.actorDisplayName,
        }),
        now: options.now as IsoTimestamp | undefined,
      };
    }

    case "list": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: listMeasurementCommand,
      });
      const target = parseMeasurementTarget({
        invocation,
        command: "measurements list",
        baselineId: options.baselineId,
        experimentId: options.experimentId,
        revisionNumberValue: options.revisionNumber,
        revisionNumberRequired: false,
      });

      return {
        subcommand,
        baselineId: target.baselineId,
        experimentId: target.experimentId,
        revisionNumber: target.revisionNumber,
        metricName: options.metricName,
      };
    }

    case "recent": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: recentMeasurementCommand,
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
        spec: getMeasurementCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"measurement">,
      };
    }

    default:
      throwParserError({
        message: `Unknown measurements subcommand: ${subcommand}.`,
        details: { command: "measurements", subcommand },
        outputMode: invocation.outputMode,
      });
  }
}

type ParsedMeasurementTarget = {
  readonly baselineId?: SituId<"baseline">;
  readonly experimentId?: SituId<"experiment">;
  readonly revisionNumber?: number;
};

function parseMeasurementTarget(input: {
  readonly invocation: SituCliInvocation;
  readonly command: string;
  readonly baselineId?: string;
  readonly experimentId?: string;
  readonly revisionNumberValue?: string;
  readonly revisionNumberRequired: boolean;
}): ParsedMeasurementTarget {
  if (input.baselineId !== undefined) {
    if (input.experimentId !== undefined || input.revisionNumberValue !== undefined) {
      throwParserError({
        message: `Command ${input.command} accepts a baseline target or an experiment target, not both.`,
        details: {
          command: input.command,
          flags: ["--baseline-id", "--experiment-id", "--revision-number"],
        },
        outputMode: input.invocation.outputMode,
      });
    }

    return {
      baselineId: input.baselineId as SituId<"baseline">,
    };
  }

  if (input.experimentId === undefined) {
    throwParserError({
      message: `Command ${input.command} requires --baseline-id or --experiment-id.`,
      details: {
        command: input.command,
        flags: ["--baseline-id", "--experiment-id"],
      },
      outputMode: input.invocation.outputMode,
    });
  }

  if (input.revisionNumberValue === undefined) {
    if (input.revisionNumberRequired) {
      throwParserError({
        message: `Command ${input.command} requires --revision-number for experiment measurements.`,
        details: {
          command: input.command,
          flag: "--revision-number",
        },
        outputMode: input.invocation.outputMode,
      });
    }

    return {
      experimentId: input.experimentId as SituId<"experiment">,
    };
  }

  return {
    experimentId: input.experimentId as SituId<"experiment">,
    revisionNumber: parsePositiveIntegerRevisionNumber({
      invocation: input.invocation,
      value: input.revisionNumberValue,
    }),
  };
}

function listMeasurementsForParsedTarget(input: {
  readonly context: ReturnType<typeof createAppActionContext>;
  readonly command: Extract<ParsedMeasurementCommand, { readonly subcommand: "list" }>;
}): readonly MeasurementRecord[] {
  if (input.command.baselineId !== undefined) {
    return listBaselineMeasurementsAction({
      context: input.context,
      baselineId: input.command.baselineId,
      metricName: input.command.metricName,
    });
  }

  if (input.command.experimentId !== undefined) {
    return listMeasurementsAction({
      context: input.context,
      experimentId: input.command.experimentId,
      revisionNumber: input.command.revisionNumber,
      metricName: input.command.metricName,
    });
  }

  throwParserError({
    message: "Command measurements list requires --baseline-id or --experiment-id.",
    details: { command: "measurements list" },
    outputMode: "text",
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
