import type { ActorRef, IsoTimestamp, SituId, TargetRef } from "@situ/common";
import {
  type LiveEdgeTone,
  type LiveFocusMode,
  type LiveMapEdgeRelation,
  type LiveMapNodeKind,
  type LiveNodeFact,
  type LiveProjectRecords,
  type LiveTone,
  type LiveVisibility,
  liveEdgeTones,
  liveFocusModes,
  liveMapEdgeRelations,
  liveMapNodeKinds,
  liveTones,
  liveVisibilities,
} from "@situ/live";
import * as v from "valibot";

import {
  createAppActionContext,
  createLiveFocusAction,
  createLiveMapEdgeAction,
  createLiveMapNodeAction,
  createLiveNodeDetailAction,
  createLiveSignalAction,
  listLiveRecordsForProjectAction,
} from "../../actions/index.js";
import { openAppDatabase } from "../../db/index.js";
import {
  defineCommandSpec,
  noPositionals,
  parseActorRef,
  parseDefinedCommandSpec,
  throwParserError,
  valueOption,
} from "../flags.js";
import { formatDataResult } from "../format.js";
import type { SituCliInvocation, SituCliResult } from "../types.js";

export function runLiveCommand(input: { readonly invocation: SituCliInvocation }): SituCliResult {
  const parsedCommand = parseLiveCommand(input.invocation);

  return withActionContext({
    invocation: input.invocation,
    run: (context) => {
      switch (parsedCommand.subcommand) {
        case "signals-set": {
          const result = createLiveSignalAction({ context, ...parsedCommand });
          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Created live signal ${result.signal.id}`,
          });
        }

        case "nodes-set": {
          const result = createLiveMapNodeAction({ context, ...parsedCommand });
          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Created live node ${result.node.id}`,
          });
        }

        case "edges-set": {
          const result = createLiveMapEdgeAction({ context, ...parsedCommand });
          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Created live edge ${result.edge.id}`,
          });
        }

        case "focus-set": {
          const result = createLiveFocusAction({ context, ...parsedCommand });
          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Created live focus ${result.focus.id}`,
          });
        }

        case "details-set": {
          const result = createLiveNodeDetailAction({ context, ...parsedCommand });
          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Created live detail ${result.detail.id}`,
          });
        }

        case "list": {
          const records = listLiveRecordsForProjectAction({
            context,
            projectId: parsedCommand.projectId,
          });
          return formatDataResult({
            invocation: input.invocation,
            data: records,
            text: formatLiveRecordsSummary(records),
          });
        }
      }
    },
  });
}

type SharedSetFields = {
  readonly projectId: SituId<"project">;
  readonly authoredBy: ActorRef;
  readonly now?: IsoTimestamp;
};

type ParsedLiveCommand =
  | (SharedSetFields & {
      readonly subcommand: "signals-set";
      readonly id?: SituId<"live_signal">;
      readonly slot: string;
      readonly label: string;
      readonly value: string;
      readonly summary?: string;
      readonly tone: LiveTone;
      readonly refs: readonly TargetRef[];
      readonly visibility?: LiveVisibility;
    })
  | (SharedSetFields & {
      readonly subcommand: "nodes-set";
      readonly id?: SituId<"live_node">;
      readonly nodeKey: string;
      readonly kind: LiveMapNodeKind;
      readonly title: string;
      readonly summary: string;
      readonly tone: LiveTone;
      readonly occurredAt?: IsoTimestamp;
      readonly refs: readonly TargetRef[];
      readonly visibility?: LiveVisibility;
    })
  | (SharedSetFields & {
      readonly subcommand: "edges-set";
      readonly id?: SituId<"live_edge">;
      readonly edgeKey: string;
      readonly fromNodeKey: string;
      readonly toNodeKey: string;
      readonly relation: LiveMapEdgeRelation;
      readonly tone: LiveEdgeTone;
      readonly visibility?: LiveVisibility;
    })
  | (SharedSetFields & {
      readonly subcommand: "focus-set";
      readonly id?: SituId<"live_focus">;
      readonly mode: LiveFocusMode;
      readonly primaryNodeKey?: string;
      readonly relatedNodeKeys: readonly string[];
      readonly summary?: string;
    })
  | (SharedSetFields & {
      readonly subcommand: "details-set";
      readonly id?: SituId<"live_detail">;
      readonly nodeKey: string;
      readonly bodyMarkdown: string;
      readonly facts: readonly LiveNodeFact[];
      readonly refs: readonly TargetRef[];
    })
  | {
      readonly subcommand: "list";
      readonly projectId: SituId<"project">;
    };

const sharedSetOptions = [
  valueOption({ key: "projectId", flag: "--project-id", required: true }),
  valueOption({ key: "authoredByKind", flag: "--authored-by-kind", required: true }),
  valueOption({ key: "authoredById", flag: "--authored-by-id", required: true }),
  valueOption({ key: "authoredByDisplayName", flag: "--authored-by-display-name" }),
  valueOption({ key: "now", flag: "--now" }),
] as const;

const liveSignalSetCommand = defineCommandSpec({
  command: "live signals set",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    ...sharedSetOptions,
    valueOption({ key: "slot", flag: "--slot", required: true }),
    valueOption({ key: "label", flag: "--label", required: true }),
    valueOption({ key: "value", flag: "--value", required: true }),
    valueOption({ key: "summary", flag: "--summary" }),
    valueOption({ key: "tone", flag: "--tone", required: true }),
    valueOption({ key: "refsJson", flag: "--refs-json" }),
    valueOption({ key: "visibility", flag: "--visibility" }),
  ],
  schema: v.object({
    id: v.optional(v.string()),
    projectId: v.string(),
    authoredByKind: v.string(),
    authoredById: v.string(),
    authoredByDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
    slot: v.string(),
    label: v.string(),
    value: v.string(),
    summary: v.optional(v.string()),
    tone: v.string(),
    refsJson: v.optional(v.string()),
    visibility: v.optional(v.string()),
  }),
});

const liveNodeSetCommand = defineCommandSpec({
  command: "live nodes set",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    ...sharedSetOptions,
    valueOption({ key: "nodeKey", flag: "--node-key", required: true }),
    valueOption({ key: "kind", flag: "--kind", required: true }),
    valueOption({ key: "title", flag: "--title", required: true }),
    valueOption({ key: "summary", flag: "--summary", required: true }),
    valueOption({ key: "tone", flag: "--tone", required: true }),
    valueOption({ key: "occurredAt", flag: "--occurred-at" }),
    valueOption({ key: "refsJson", flag: "--refs-json" }),
    valueOption({ key: "visibility", flag: "--visibility" }),
  ],
  schema: v.object({
    id: v.optional(v.string()),
    projectId: v.string(),
    authoredByKind: v.string(),
    authoredById: v.string(),
    authoredByDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
    nodeKey: v.string(),
    kind: v.string(),
    title: v.string(),
    summary: v.string(),
    tone: v.string(),
    occurredAt: v.optional(v.string()),
    refsJson: v.optional(v.string()),
    visibility: v.optional(v.string()),
  }),
});

const liveEdgeSetCommand = defineCommandSpec({
  command: "live edges set",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    ...sharedSetOptions,
    valueOption({ key: "edgeKey", flag: "--edge-key", required: true }),
    valueOption({ key: "fromNodeKey", flag: "--from-node-key", required: true }),
    valueOption({ key: "toNodeKey", flag: "--to-node-key", required: true }),
    valueOption({ key: "relation", flag: "--relation", required: true }),
    valueOption({ key: "tone", flag: "--tone", required: true }),
    valueOption({ key: "visibility", flag: "--visibility" }),
  ],
  schema: v.object({
    id: v.optional(v.string()),
    projectId: v.string(),
    authoredByKind: v.string(),
    authoredById: v.string(),
    authoredByDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
    edgeKey: v.string(),
    fromNodeKey: v.string(),
    toNodeKey: v.string(),
    relation: v.string(),
    tone: v.string(),
    visibility: v.optional(v.string()),
  }),
});

const liveFocusSetCommand = defineCommandSpec({
  command: "live focus set",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    ...sharedSetOptions,
    valueOption({ key: "mode", flag: "--mode", required: true }),
    valueOption({ key: "primaryNodeKey", flag: "--primary-node-key" }),
    valueOption({ key: "relatedNodeKeysJson", flag: "--related-node-keys-json" }),
    valueOption({ key: "summary", flag: "--summary" }),
  ],
  schema: v.object({
    id: v.optional(v.string()),
    projectId: v.string(),
    authoredByKind: v.string(),
    authoredById: v.string(),
    authoredByDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
    mode: v.string(),
    primaryNodeKey: v.optional(v.string()),
    relatedNodeKeysJson: v.optional(v.string()),
    summary: v.optional(v.string()),
  }),
});

const liveDetailSetCommand = defineCommandSpec({
  command: "live details set",
  positionals: noPositionals(),
  options: [
    valueOption({ key: "id", flag: "--id" }),
    ...sharedSetOptions,
    valueOption({ key: "nodeKey", flag: "--node-key", required: true }),
    valueOption({ key: "bodyMarkdown", flag: "--body", required: true }),
    valueOption({ key: "factsJson", flag: "--facts-json" }),
    valueOption({ key: "refsJson", flag: "--refs-json" }),
  ],
  schema: v.object({
    id: v.optional(v.string()),
    projectId: v.string(),
    authoredByKind: v.string(),
    authoredById: v.string(),
    authoredByDisplayName: v.optional(v.string()),
    now: v.optional(v.string()),
    nodeKey: v.string(),
    bodyMarkdown: v.string(),
    factsJson: v.optional(v.string()),
    refsJson: v.optional(v.string()),
  }),
});

const liveListCommand = defineCommandSpec({
  command: "live list",
  positionals: noPositionals(),
  options: [valueOption({ key: "projectId", flag: "--project-id", required: true })],
  schema: v.object({
    projectId: v.string(),
  }),
});

function parseLiveCommand(invocation: SituCliInvocation): ParsedLiveCommand {
  const [section, action, ...args] = invocation.rest;

  if (section === undefined) {
    throwParserError({
      message: "Command live requires a subcommand.",
      details: { command: "live" },
      outputMode: invocation.outputMode,
    });
  }

  if (section === "list") {
    const options = parseDefinedCommandSpec({
      invocation,
      args: invocation.rest.slice(1),
      spec: liveListCommand,
    });
    return {
      subcommand: "list",
      projectId: options.projectId as SituId<"project">,
    };
  }

  if (action !== "set") {
    throwParserError({
      message: `Unknown live subcommand: ${[section, action].filter(Boolean).join(" ")}.`,
      details: { command: "live", subcommand: section, action },
      outputMode: invocation.outputMode,
    });
  }

  switch (section) {
    case "signals":
      return parseSignalSet({ invocation, args });
    case "nodes":
      return parseNodeSet({ invocation, args });
    case "edges":
      return parseEdgeSet({ invocation, args });
    case "focus":
      return parseFocusSet({ invocation, args });
    case "details":
      return parseDetailSet({ invocation, args });
    default:
      throwParserError({
        message: `Unknown live subcommand: ${section}.`,
        details: { command: "live", subcommand: section },
        outputMode: invocation.outputMode,
      });
  }
}

function parseSignalSet(input: {
  readonly invocation: SituCliInvocation;
  readonly args: readonly string[];
}): ParsedLiveCommand {
  const options = parseDefinedCommandSpec({
    invocation: input.invocation,
    args: input.args,
    spec: liveSignalSetCommand,
  });
  return {
    subcommand: "signals-set",
    id: options.id as SituId<"live_signal"> | undefined,
    ...parseSharedSetFields({ invocation: input.invocation, options }),
    slot: options.slot,
    label: options.label,
    value: options.value,
    summary: options.summary,
    tone: parseEnum({
      invocation: input.invocation,
      label: "live tone",
      value: options.tone,
      supported: liveTones,
    }) as LiveTone,
    refs: parseJsonArray<TargetRef>({
      invocation: input.invocation,
      flag: "--refs-json",
      value: options.refsJson,
    }),
    visibility: parseOptionalVisibility({
      invocation: input.invocation,
      value: options.visibility,
    }),
  };
}

function parseNodeSet(input: {
  readonly invocation: SituCliInvocation;
  readonly args: readonly string[];
}): ParsedLiveCommand {
  const options = parseDefinedCommandSpec({
    invocation: input.invocation,
    args: input.args,
    spec: liveNodeSetCommand,
  });
  return {
    subcommand: "nodes-set",
    id: options.id as SituId<"live_node"> | undefined,
    ...parseSharedSetFields({ invocation: input.invocation, options }),
    nodeKey: options.nodeKey,
    kind: parseEnum({
      invocation: input.invocation,
      label: "live node kind",
      value: options.kind,
      supported: liveMapNodeKinds,
    }) as LiveMapNodeKind,
    title: options.title,
    summary: options.summary,
    tone: parseEnum({
      invocation: input.invocation,
      label: "live tone",
      value: options.tone,
      supported: liveTones,
    }) as LiveTone,
    occurredAt: options.occurredAt as IsoTimestamp | undefined,
    refs: parseJsonArray<TargetRef>({
      invocation: input.invocation,
      flag: "--refs-json",
      value: options.refsJson,
    }),
    visibility: parseOptionalVisibility({
      invocation: input.invocation,
      value: options.visibility,
    }),
  };
}

function parseEdgeSet(input: {
  readonly invocation: SituCliInvocation;
  readonly args: readonly string[];
}): ParsedLiveCommand {
  const options = parseDefinedCommandSpec({
    invocation: input.invocation,
    args: input.args,
    spec: liveEdgeSetCommand,
  });
  return {
    subcommand: "edges-set",
    id: options.id as SituId<"live_edge"> | undefined,
    ...parseSharedSetFields({ invocation: input.invocation, options }),
    edgeKey: options.edgeKey,
    fromNodeKey: options.fromNodeKey,
    toNodeKey: options.toNodeKey,
    relation: parseEnum({
      invocation: input.invocation,
      label: "live edge relation",
      value: options.relation,
      supported: liveMapEdgeRelations,
    }) as LiveMapEdgeRelation,
    tone: parseEnum({
      invocation: input.invocation,
      label: "live edge tone",
      value: options.tone,
      supported: liveEdgeTones,
    }) as LiveEdgeTone,
    visibility: parseOptionalVisibility({
      invocation: input.invocation,
      value: options.visibility,
    }),
  };
}

function parseFocusSet(input: {
  readonly invocation: SituCliInvocation;
  readonly args: readonly string[];
}): ParsedLiveCommand {
  const options = parseDefinedCommandSpec({
    invocation: input.invocation,
    args: input.args,
    spec: liveFocusSetCommand,
  });
  return {
    subcommand: "focus-set",
    id: options.id as SituId<"live_focus"> | undefined,
    ...parseSharedSetFields({ invocation: input.invocation, options }),
    mode: parseEnum({
      invocation: input.invocation,
      label: "live focus mode",
      value: options.mode,
      supported: liveFocusModes,
    }) as LiveFocusMode,
    primaryNodeKey: options.primaryNodeKey,
    relatedNodeKeys: parseJsonArray<string>({
      invocation: input.invocation,
      flag: "--related-node-keys-json",
      value: options.relatedNodeKeysJson,
    }),
    summary: options.summary,
  };
}

function parseDetailSet(input: {
  readonly invocation: SituCliInvocation;
  readonly args: readonly string[];
}): ParsedLiveCommand {
  const options = parseDefinedCommandSpec({
    invocation: input.invocation,
    args: input.args,
    spec: liveDetailSetCommand,
  });
  return {
    subcommand: "details-set",
    id: options.id as SituId<"live_detail"> | undefined,
    ...parseSharedSetFields({ invocation: input.invocation, options }),
    nodeKey: options.nodeKey,
    bodyMarkdown: options.bodyMarkdown,
    facts: parseJsonArray<LiveNodeFact>({
      invocation: input.invocation,
      flag: "--facts-json",
      value: options.factsJson,
    }),
    refs: parseJsonArray<TargetRef>({
      invocation: input.invocation,
      flag: "--refs-json",
      value: options.refsJson,
    }),
  };
}

function parseSharedSetFields(input: {
  readonly invocation: SituCliInvocation;
  readonly options: {
    readonly projectId: string;
    readonly authoredByKind: string;
    readonly authoredById: string;
    readonly authoredByDisplayName?: string;
    readonly now?: string;
  };
}): SharedSetFields {
  return {
    projectId: input.options.projectId as SituId<"project">,
    authoredBy: parseActorRef({
      invocation: input.invocation,
      kindFlag: "--authored-by-kind",
      kind: input.options.authoredByKind,
      id: input.options.authoredById,
      displayName: input.options.authoredByDisplayName,
    }),
    now: input.options.now as IsoTimestamp | undefined,
  };
}

function parseOptionalVisibility(input: {
  readonly invocation: SituCliInvocation;
  readonly value?: string;
}): LiveVisibility | undefined {
  if (input.value === undefined) {
    return undefined;
  }
  return parseEnum({
    invocation: input.invocation,
    label: "live visibility",
    value: input.value,
    supported: liveVisibilities,
  }) as LiveVisibility;
}

function parseEnum(input: {
  readonly invocation: SituCliInvocation;
  readonly label: string;
  readonly value: string;
  readonly supported: readonly string[];
}): string {
  if (input.supported.includes(input.value)) {
    return input.value;
  }

  throwParserError({
    message: `Invalid ${input.label}: ${input.value}.`,
    details: { value: input.value, allowedValues: input.supported },
    outputMode: input.invocation.outputMode,
  });
}

function parseJsonArray<TValue>(input: {
  readonly invocation: SituCliInvocation;
  readonly flag: string;
  readonly value?: string;
}): readonly TValue[] {
  if (input.value === undefined) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.value);
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

  if (Array.isArray(parsed)) {
    return parsed as readonly TValue[];
  }

  throwParserError({
    message: `Expected ${input.flag} to be a JSON array.`,
    details: { flag: input.flag },
    outputMode: input.invocation.outputMode,
  });
}

function formatLiveRecordsSummary(records: LiveProjectRecords): string {
  return (
    [
      `signals\t${records.signals.length}`,
      `nodes\t${records.mapNodes.length}`,
      `edges\t${records.mapEdges.length}`,
      `focuses\t${records.focuses.length}`,
      `details\t${records.nodeDetails.length}`,
    ].join("\n") + "\n"
  );
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
