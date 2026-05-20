import { isAbsolute } from "node:path";

import type { ActorRef, IsoTimestamp, SituId, TargetRef } from "@situ/common";
import { NotFoundError } from "@situ/errors";
import * as v from "valibot";

import {
  captureArtifactFileAction,
  createAppActionContext,
  createArtifactAction,
  getArtifactAction,
  listArtifactsAction,
  listRecentArtifactsAction,
} from "../../actions/index.js";
import { openAppDatabase, resolveStateHome } from "../../db/index.js";
import {
  defineCommandSpec,
  noPositionals,
  parseActorRef,
  parseDefinedCommandSpec,
  parseNonNegativeSafeIntegerByteSize,
  parsePositiveIntegerLimit,
  parseTargetKind,
  singlePositional,
  throwParserError,
  valueOption,
} from "../flags.js";
import { formatArtifactLines, formatDataResult } from "../format.js";
import type { SituCliInvocation, SituCliResult } from "../types.js";

export function runArtifactsCommand(input: {
  readonly invocation: SituCliInvocation;
}): SituCliResult {
  const parsedCommand = parseArtifactCommand(input.invocation);

  if (parsedCommand.subcommand === "capture") {
    const stateHomePath = resolveStateHome({
      environment: input.invocation.environment,
    });

    return withActionContext({
      invocation: input.invocation,
      run: (context) => {
        const result = captureArtifactFileAction({
          context,
          stateHomePath,
          projectId: parsedCommand.projectId,
          id: parsedCommand.id,
          target: parsedCommand.target,
          title: parsedCommand.title,
          summaryMarkdown: parsedCommand.summaryMarkdown,
          sourcePath: parsedCommand.sourcePath,
          mediaType: parsedCommand.mediaType,
          createdBy: parsedCommand.actor,
          now: parsedCommand.now,
        });

        return formatDataResult({
          invocation: input.invocation,
          data: result,
          text: `Captured artifact ${result.artifact.id}`,
        });
      },
    });
  }

  return withActionContext({
    invocation: input.invocation,
    run: (context) => {
      switch (parsedCommand.subcommand) {
        case "create": {
          const result = createArtifactAction({
            context,
            id: parsedCommand.id,
            target: parsedCommand.target,
            title: parsedCommand.title,
            summaryMarkdown: parsedCommand.summaryMarkdown,
            uri: parsedCommand.uri,
            mediaType: parsedCommand.mediaType,
            byteSize: parsedCommand.byteSize,
            sha256: parsedCommand.sha256,
            createdBy: parsedCommand.actor,
            now: parsedCommand.now,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Created artifact ${result.artifact.id}`,
          });
        }

        case "list": {
          const artifacts = listArtifactsAction({
            context,
            target: parsedCommand.target,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { artifacts },
            text: formatArtifactLines(artifacts),
          });
        }

        case "recent": {
          const artifacts = listRecentArtifactsAction({
            context,
            limit: parsedCommand.limit,
          });

          return formatDataResult({
            invocation: input.invocation,
            data: { artifacts },
            text: formatArtifactLines(artifacts),
          });
        }

        case "get": {
          const artifact = getArtifactAction({
            context,
            id: parsedCommand.id,
          });

          if (artifact === undefined) {
            throw new NotFoundError({
              message: "Artifact was not found.",
              details: { id: parsedCommand.id },
            });
          }

          return formatDataResult({
            invocation: input.invocation,
            data: { artifact },
            text: formatArtifactLines([artifact]),
          });
        }
      }
    },
  });
}

type ParsedArtifactCommand =
  | {
      readonly subcommand: "create";
      readonly id?: SituId<"artifact">;
      readonly target: TargetRef;
      readonly title: string;
      readonly summaryMarkdown: string;
      readonly uri: string;
      readonly mediaType?: string;
      readonly byteSize?: number;
      readonly sha256?: string;
      readonly actor: ActorRef;
      readonly now?: IsoTimestamp;
    }
  | {
      readonly subcommand: "capture";
      readonly projectId: SituId<"project">;
      readonly id?: SituId<"artifact">;
      readonly target: TargetRef;
      readonly sourcePath: string;
      readonly title: string;
      readonly summaryMarkdown: string;
      readonly mediaType?: string;
      readonly actor: ActorRef;
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
      readonly id: SituId<"artifact">;
    };

const createArtifactCommand = defineCommandSpec({
  command: "artifacts create",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    valueOption({ key: "targetKind", flag: "--target-kind", required: true }),
    valueOption({ key: "targetId", flag: "--target-id", required: true }),
    valueOption({ key: "title", flag: "--title", required: true }),
    valueOption({ key: "summaryMarkdown", flag: "--summary", required: true }),
    valueOption({ key: "uri", flag: "--uri", required: true }),
    valueOption({ key: "mediaType", flag: "--media-type" }),
    valueOption({ key: "byteSize", flag: "--byte-size" }),
    valueOption({ key: "sha256", flag: "--sha256" }),
    valueOption({ key: "actorKind", flag: "--actor-kind", required: true }),
    valueOption({ key: "actorId", flag: "--actor-id", required: true }),
    valueOption({ key: "actorDisplayName", flag: "--actor-display-name" }),
    valueOption({ key: "now", flag: "--now" }),
  ],
  schema: v.object({
    id: v.optional(v.string()),
    targetKind: v.string(),
    targetId: v.string(),
    title: v.string(),
    summaryMarkdown: v.string(),
    uri: v.string(),
    mediaType: v.optional(v.string()),
    byteSize: v.optional(v.string()),
    sha256: v.optional(v.string()),
    actorKind: v.string(),
    actorId: v.string(),
    actorDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
  }),
});

const captureArtifactCommand = defineCommandSpec({
  command: "artifacts capture",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "projectId", flag: "--project-id", required: true }),
    valueOption({ key: "id", flag: "--id" }),
    valueOption({ key: "targetKind", flag: "--target-kind", required: true }),
    valueOption({ key: "targetId", flag: "--target-id", required: true }),
    valueOption({ key: "sourcePath", flag: "--source-path", required: true }),
    valueOption({ key: "title", flag: "--title", required: true }),
    valueOption({ key: "summaryMarkdown", flag: "--summary", required: true }),
    valueOption({ key: "mediaType", flag: "--media-type" }),
    valueOption({ key: "actorKind", flag: "--actor-kind", required: true }),
    valueOption({ key: "actorId", flag: "--actor-id", required: true }),
    valueOption({ key: "actorDisplayName", flag: "--actor-display-name" }),
    valueOption({ key: "now", flag: "--now" }),
  ],
  schema: v.object({
    projectId: v.string(),
    id: v.optional(v.string()),
    targetKind: v.string(),
    targetId: v.string(),
    sourcePath: v.string(),
    title: v.string(),
    summaryMarkdown: v.string(),
    mediaType: v.optional(v.string()),
    actorKind: v.string(),
    actorId: v.string(),
    actorDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
  }),
});

const listArtifactCommand = defineCommandSpec({
  command: "artifacts list",
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

const recentArtifactCommand = defineCommandSpec({
  command: "artifacts recent",
  positionals: noPositionals(),
  options: [valueOption({ key: "limit", flag: "--limit" })],
  schema: v.object({
    limit: v.optional(v.string()),
  }),
});

const getArtifactCommand = defineCommandSpec({
  command: "artifacts get",
  positionals: singlePositional({ key: "id", name: "artifact-id" }),
  options: [],
  schema: v.object({
    id: v.string(),
  }),
});

function parseArtifactCommand(invocation: SituCliInvocation): ParsedArtifactCommand {
  const [subcommand, ...args] = invocation.rest;

  if (subcommand === undefined) {
    throwParserError({
      message: "Command artifacts requires a subcommand.",
      details: { command: "artifacts" },
      outputMode: invocation.outputMode,
    });
  }

  switch (subcommand) {
    case "create": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: createArtifactCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"artifact"> | undefined,
        target: parseTarget({
          invocation,
          targetKindValue: options.targetKind,
          targetId: options.targetId,
        }),
        title: options.title,
        summaryMarkdown: options.summaryMarkdown,
        uri: options.uri,
        mediaType: options.mediaType,
        byteSize:
          options.byteSize === undefined
            ? undefined
            : parseNonNegativeSafeIntegerByteSize({
                invocation,
                value: options.byteSize,
              }),
        sha256: options.sha256,
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

    case "capture": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: captureArtifactCommand,
      });
      const absoluteSourcePath = parseAbsoluteSourcePath({
        invocation,
        sourcePath: options.sourcePath,
      });
      const target = parseTarget({
        invocation,
        targetKindValue: options.targetKind,
        targetId: options.targetId,
      });

      return {
        subcommand,
        projectId: options.projectId as SituId<"project">,
        id: options.id as SituId<"artifact"> | undefined,
        target,
        sourcePath: absoluteSourcePath,
        title: options.title,
        summaryMarkdown: options.summaryMarkdown,
        mediaType: options.mediaType,
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

    case "list": {
      const options = parseDefinedCommandSpec({
        invocation,
        args,
        spec: listArtifactCommand,
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
        spec: recentArtifactCommand,
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
        spec: getArtifactCommand,
      });

      return {
        subcommand,
        id: options.id as SituId<"artifact">,
      };
    }

    default:
      throwParserError({
        message: `Unknown artifacts subcommand: ${subcommand}.`,
        details: { command: "artifacts", subcommand },
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

function parseAbsoluteSourcePath(input: {
  readonly invocation: SituCliInvocation;
  readonly sourcePath: string;
}): string {
  if (isAbsolute(input.sourcePath)) {
    return input.sourcePath;
  }

  throwParserError({
    message: "Expected an absolute source path.",
    details: { field: "sourcePath" },
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
