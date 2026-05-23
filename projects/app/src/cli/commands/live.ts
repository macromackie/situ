import type { ActorRef, IsoTimestamp, SituId, TargetRef } from "@situ/common";
import {
  type LiveEdgeTone,
  type LiveFocusMode,
  type LiveMapEdgeRelation,
  type LiveMapNodeKind,
  type LiveMetricDirection,
  type LiveNodeFact,
  type LiveProjectRecords,
  type LiveTone,
  type LiveVisibility,
  liveEdgeTones,
  liveFocusModes,
  liveMapEdgeRelations,
  liveMetricDirections,
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
  publishLiveAttemptAction,
  startLiveAttemptAction,
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

        case "attempts-publish": {
          const result = publishLiveAttemptAction({ context, ...parsedCommand });
          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Published live attempt ${result.node.id}`,
          });
        }

        case "attempts-start": {
          const result = startLiveAttemptAction({ context, ...parsedCommand });
          return formatDataResult({
            invocation: input.invocation,
            data: result,
            text: `Started live attempt ${result.node.id}`,
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

type ParsedAttemptEdge = {
  readonly edgeKey?: string;
  readonly fromNodeKey: string;
  readonly relation: LiveMapEdgeRelation;
  readonly tone?: LiveEdgeTone;
  readonly visibility?: LiveVisibility;
};

type ParsedAttemptFocus = {
  readonly mode: LiveFocusMode;
  readonly summary?: string;
  readonly relatedNodeKeys?: readonly string[];
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
  | (SharedSetFields & {
      readonly subcommand: "attempts-start";
      readonly nodeKey: string;
      readonly kind: LiveMapNodeKind;
      readonly title: string;
      readonly summary: string;
      readonly tone: LiveTone;
      readonly occurredAt?: IsoTimestamp;
      readonly visibility?: LiveVisibility;
      readonly bodyMarkdown: string;
      readonly refs: readonly TargetRef[];
      readonly edge?: ParsedAttemptEdge;
      readonly focus?: ParsedAttemptFocus;
    })
  | (SharedSetFields & {
      readonly subcommand: "attempts-publish";
      readonly nodeKey: string;
      readonly kind: LiveMapNodeKind;
      readonly title: string;
      readonly summary: string;
      readonly tone: LiveTone;
      readonly occurredAt?: IsoTimestamp;
      readonly visibility?: LiveVisibility;
      readonly bodyMarkdown: string;
      readonly facts: readonly LiveNodeFact[];
      readonly refs: readonly TargetRef[];
      readonly edge?: ParsedAttemptEdge;
      readonly focus?: ParsedAttemptFocus;
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

const liveAttemptStartCommand = defineCommandSpec({
  command: "live attempts start",
  positionals: noPositionals(),
  options: [
    ...sharedSetOptions,
    valueOption({ key: "nodeKey", flag: "--node-key", required: true }),
    valueOption({ key: "kind", flag: "--kind", required: true }),
    valueOption({ key: "title", flag: "--title", required: true }),
    valueOption({ key: "summary", flag: "--summary", required: true }),
    valueOption({ key: "tone", flag: "--tone", required: true }),
    valueOption({ key: "bodyMarkdown", flag: "--body", required: true }),
    valueOption({ key: "occurredAt", flag: "--occurred-at" }),
    valueOption({ key: "refsJson", flag: "--refs-json" }),
    valueOption({ key: "experimentId", flag: "--experiment-id" }),
    valueOption({ key: "baselineId", flag: "--baseline-id" }),
    valueOption({ key: "measurementId", flag: "--measurement-id" }),
    valueOption({ key: "fromNodeKey", flag: "--from-node-key" }),
    valueOption({ key: "edgeKey", flag: "--edge-key" }),
    valueOption({ key: "edgeRelation", flag: "--edge-relation" }),
    valueOption({ key: "edgeTone", flag: "--edge-tone" }),
    valueOption({ key: "edgeVisibility", flag: "--edge-visibility" }),
    valueOption({ key: "focusMode", flag: "--focus-mode" }),
    valueOption({ key: "focusSummary", flag: "--focus-summary" }),
    valueOption({ key: "relatedNodeKeysJson", flag: "--related-node-keys-json" }),
    valueOption({ key: "visibility", flag: "--visibility" }),
  ],
  schema: v.object({
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
    bodyMarkdown: v.string(),
    occurredAt: v.optional(v.string()),
    refsJson: v.optional(v.string()),
    experimentId: v.optional(v.string()),
    baselineId: v.optional(v.string()),
    measurementId: v.optional(v.string()),
    fromNodeKey: v.optional(v.string()),
    edgeKey: v.optional(v.string()),
    edgeRelation: v.optional(v.string()),
    edgeTone: v.optional(v.string()),
    edgeVisibility: v.optional(v.string()),
    focusMode: v.optional(v.string()),
    focusSummary: v.optional(v.string()),
    relatedNodeKeysJson: v.optional(v.string()),
    visibility: v.optional(v.string()),
  }),
});

const liveAttemptPublishCommand = defineCommandSpec({
  command: "live attempts publish",
  positionals: noPositionals(),
  options: [
    ...sharedSetOptions,
    valueOption({ key: "nodeKey", flag: "--node-key", required: true }),
    valueOption({ key: "kind", flag: "--kind", required: true }),
    valueOption({ key: "title", flag: "--title", required: true }),
    valueOption({ key: "summary", flag: "--summary", required: true }),
    valueOption({ key: "tone", flag: "--tone", required: true }),
    valueOption({ key: "bodyMarkdown", flag: "--body", required: true }),
    valueOption({ key: "metricLabel", flag: "--metric-label", required: true }),
    valueOption({ key: "metricValue", flag: "--metric-value", required: true }),
    valueOption({ key: "metricName", flag: "--metric-name" }),
    valueOption({ key: "metricUnit", flag: "--metric-unit" }),
    valueOption({ key: "metricDirection", flag: "--metric-direction" }),
    valueOption({ key: "occurredAt", flag: "--occurred-at" }),
    valueOption({ key: "refsJson", flag: "--refs-json" }),
    valueOption({ key: "experimentId", flag: "--experiment-id" }),
    valueOption({ key: "baselineId", flag: "--baseline-id" }),
    valueOption({ key: "measurementId", flag: "--measurement-id" }),
    valueOption({ key: "fromNodeKey", flag: "--from-node-key" }),
    valueOption({ key: "edgeKey", flag: "--edge-key" }),
    valueOption({ key: "edgeRelation", flag: "--edge-relation" }),
    valueOption({ key: "edgeTone", flag: "--edge-tone" }),
    valueOption({ key: "edgeVisibility", flag: "--edge-visibility" }),
    valueOption({ key: "focusMode", flag: "--focus-mode" }),
    valueOption({ key: "focusSummary", flag: "--focus-summary" }),
    valueOption({ key: "relatedNodeKeysJson", flag: "--related-node-keys-json" }),
    valueOption({ key: "visibility", flag: "--visibility" }),
  ],
  schema: v.object({
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
    bodyMarkdown: v.string(),
    metricLabel: v.string(),
    metricValue: v.string(),
    metricName: v.optional(v.string()),
    metricUnit: v.optional(v.string()),
    metricDirection: v.optional(v.string()),
    occurredAt: v.optional(v.string()),
    refsJson: v.optional(v.string()),
    experimentId: v.optional(v.string()),
    baselineId: v.optional(v.string()),
    measurementId: v.optional(v.string()),
    fromNodeKey: v.optional(v.string()),
    edgeKey: v.optional(v.string()),
    edgeRelation: v.optional(v.string()),
    edgeTone: v.optional(v.string()),
    edgeVisibility: v.optional(v.string()),
    focusMode: v.optional(v.string()),
    focusSummary: v.optional(v.string()),
    relatedNodeKeysJson: v.optional(v.string()),
    visibility: v.optional(v.string()),
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

  if (section === "attempts" && action === "publish") {
    return parseAttemptPublish({ invocation, args });
  }

  if (section === "attempts" && action === "start") {
    return parseAttemptStart({ invocation, args });
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

function parseAttemptStart(input: {
  readonly invocation: SituCliInvocation;
  readonly args: readonly string[];
}): ParsedLiveCommand {
  const options = parseDefinedCommandSpec({
    invocation: input.invocation,
    args: input.args,
    spec: liveAttemptStartCommand,
  });
  const tone = parseEnum({
    invocation: input.invocation,
    label: "live tone",
    value: options.tone,
    supported: liveTones,
  }) as LiveTone;
  const refs = [
    ...parseJsonArray<TargetRef>({
      invocation: input.invocation,
      flag: "--refs-json",
      value: options.refsJson,
    }),
    ...targetRefFor({ targetKind: "experiment", targetId: options.experimentId }),
    ...targetRefFor({ targetKind: "baseline", targetId: options.baselineId }),
    ...targetRefFor({ targetKind: "measurement", targetId: options.measurementId }),
  ];
  const edge = parseAttemptEdge({ invocation: input.invocation, options });
  const focus = parseAttemptFocus({ invocation: input.invocation, options });

  return {
    subcommand: "attempts-start",
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
    tone,
    occurredAt: options.occurredAt as IsoTimestamp | undefined,
    visibility: parseOptionalVisibility({
      invocation: input.invocation,
      value: options.visibility,
    }),
    bodyMarkdown: options.bodyMarkdown,
    refs,
    ...(edge === undefined ? {} : { edge }),
    ...(focus === undefined ? {} : { focus }),
  };
}

function parseAttemptPublish(input: {
  readonly invocation: SituCliInvocation;
  readonly args: readonly string[];
}): ParsedLiveCommand {
  const options = parseDefinedCommandSpec({
    invocation: input.invocation,
    args: input.args,
    spec: liveAttemptPublishCommand,
  });
  const metricValue = parseFiniteNumber({
    invocation: input.invocation,
    flag: "--metric-value",
    value: options.metricValue,
  });
  const tone = parseEnum({
    invocation: input.invocation,
    label: "live tone",
    value: options.tone,
    supported: liveTones,
  }) as LiveTone;
  const refs = [
    ...parseJsonArray<TargetRef>({
      invocation: input.invocation,
      flag: "--refs-json",
      value: options.refsJson,
    }),
    ...targetRefFor({ targetKind: "experiment", targetId: options.experimentId }),
    ...targetRefFor({ targetKind: "baseline", targetId: options.baselineId }),
    ...targetRefFor({ targetKind: "measurement", targetId: options.measurementId }),
  ];
  const edge = parseAttemptEdge({ invocation: input.invocation, options });
  const focus = parseAttemptFocus({ invocation: input.invocation, options });

  return {
    subcommand: "attempts-publish",
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
    tone,
    occurredAt: options.occurredAt as IsoTimestamp | undefined,
    visibility: parseOptionalVisibility({
      invocation: input.invocation,
      value: options.visibility,
    }),
    bodyMarkdown: options.bodyMarkdown,
    facts: [
      {
        label: options.metricLabel,
        value: options.metricValue,
        tone,
        numericValue: metricValue,
        ...(options.metricName === undefined ? {} : { metricName: options.metricName }),
        ...(options.metricUnit === undefined ? {} : { unit: options.metricUnit }),
        direction:
          options.metricDirection === undefined
            ? "higher_is_better"
            : (parseEnum({
                invocation: input.invocation,
                label: "live metric direction",
                value: options.metricDirection,
                supported: liveMetricDirections,
              }) as LiveMetricDirection),
      },
    ],
    refs,
    ...(edge === undefined ? {} : { edge }),
    ...(focus === undefined ? {} : { focus }),
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

function parseAttemptEdge(input: {
  readonly invocation: SituCliInvocation;
  readonly options: {
    readonly fromNodeKey?: string;
    readonly edgeKey?: string;
    readonly edgeRelation?: string;
    readonly edgeTone?: string;
    readonly edgeVisibility?: string;
  };
}): ParsedAttemptEdge | undefined {
  const hasEdgeFlag =
    input.options.fromNodeKey !== undefined ||
    input.options.edgeKey !== undefined ||
    input.options.edgeRelation !== undefined ||
    input.options.edgeTone !== undefined ||
    input.options.edgeVisibility !== undefined;

  if (!hasEdgeFlag) {
    return undefined;
  }

  if (input.options.fromNodeKey === undefined) {
    throwParserError({
      message: "Missing required flag --from-node-key.",
      details: { flag: "--from-node-key" },
      outputMode: input.invocation.outputMode,
    });
  }

  return {
    fromNodeKey: input.options.fromNodeKey,
    ...(input.options.edgeKey === undefined ? {} : { edgeKey: input.options.edgeKey }),
    relation: (input.options.edgeRelation === undefined
      ? "led_to"
      : parseEnum({
          invocation: input.invocation,
          label: "live edge relation",
          value: input.options.edgeRelation,
          supported: liveMapEdgeRelations,
        })) as LiveMapEdgeRelation,
    ...(input.options.edgeTone === undefined
      ? {}
      : {
          tone: parseEnum({
            invocation: input.invocation,
            label: "live edge tone",
            value: input.options.edgeTone,
            supported: liveEdgeTones,
          }) as LiveEdgeTone,
        }),
    ...(input.options.edgeVisibility === undefined
      ? {}
      : {
          visibility: parseEnum({
            invocation: input.invocation,
            label: "live visibility",
            value: input.options.edgeVisibility,
            supported: liveVisibilities,
          }) as LiveVisibility,
        }),
  };
}

function parseAttemptFocus(input: {
  readonly invocation: SituCliInvocation;
  readonly options: {
    readonly focusMode?: string;
    readonly focusSummary?: string;
    readonly relatedNodeKeysJson?: string;
  };
}): ParsedAttemptFocus | undefined {
  const hasFocusFlag =
    input.options.focusMode !== undefined ||
    input.options.focusSummary !== undefined ||
    input.options.relatedNodeKeysJson !== undefined;

  if (!hasFocusFlag) {
    return undefined;
  }

  if (input.options.focusMode === undefined) {
    throwParserError({
      message: "Missing required flag --focus-mode.",
      details: { flag: "--focus-mode" },
      outputMode: input.invocation.outputMode,
    });
  }

  return {
    mode: parseEnum({
      invocation: input.invocation,
      label: "live focus mode",
      value: input.options.focusMode,
      supported: liveFocusModes,
    }) as LiveFocusMode,
    ...(input.options.focusSummary === undefined ? {} : { summary: input.options.focusSummary }),
    relatedNodeKeys: parseJsonArray<string>({
      invocation: input.invocation,
      flag: "--related-node-keys-json",
      value: input.options.relatedNodeKeysJson,
    }),
  };
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

function parseFiniteNumber(input: {
  readonly invocation: SituCliInvocation;
  readonly flag: string;
  readonly value: string;
}): number {
  const parsed = Number(input.value);

  if (Number.isFinite(parsed)) {
    return parsed;
  }

  throwParserError({
    message: `Expected ${input.flag} to be a finite number.`,
    details: { flag: input.flag, value: input.value },
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

function targetRefFor(input: {
  readonly targetKind: TargetRef["targetKind"];
  readonly targetId?: string;
}): readonly TargetRef[] {
  if (input.targetId === undefined) {
    return [];
  }

  return [
    {
      targetKind: input.targetKind,
      targetId: input.targetId as TargetRef["targetId"],
    },
  ];
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
