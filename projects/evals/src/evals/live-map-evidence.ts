type ParsedLiveRecords = {
  readonly signals: readonly ParsedLiveSignal[];
  readonly mapNodes: readonly ParsedLiveMapNode[];
  readonly mapEdges: readonly unknown[];
  readonly focuses: readonly unknown[];
  readonly nodeDetails: readonly ParsedLiveNodeDetail[];
};

type ParsedLiveSignal = {
  readonly id?: string;
};

type ParsedLiveMapNode = {
  readonly id?: string;
  readonly nodeKey?: string;
  readonly refs?: readonly unknown[];
};

type ParsedLiveNodeDetail = {
  readonly id?: string;
  readonly nodeKey?: string;
  readonly facts?: readonly unknown[];
  readonly refs?: readonly unknown[];
};

type LiveMapEvidence = {
  readonly parseable: boolean;
  readonly liveNodeCount: number;
  readonly liveDetailCount: number;
  readonly livePlottableDetailCount: number;
  readonly liveSignalCount: number;
  readonly liveFocusCount: number;
  readonly startedExperimentRefCount: number;
  readonly startedExperimentRefs: readonly string[];
  readonly measuredExperimentRefCount: number;
  readonly measuredExperimentRefs: readonly string[];
};

type ParsedTargetRef = {
  readonly targetKind?: string;
  readonly targetId?: string;
};

type ParsedLiveNodeFact = {
  readonly value?: unknown;
  readonly numericValue?: unknown;
};

export function collectLiveMapEvidence(input: {
  readonly liveRecordsJson: string;
  readonly startedExperimentIds?: readonly string[];
  readonly measuredExperimentIds: readonly string[];
}): LiveMapEvidence {
  const parsed = parseLiveRecordsOutput(input.liveRecordsJson);
  const startedExperimentIds = new Set(input.startedExperimentIds ?? input.measuredExperimentIds);
  const measuredExperimentIds = new Set(input.measuredExperimentIds);
  const nodeExperimentRefs = uniqueStrings(
    parsed.records.mapNodes.flatMap((record) => experimentRefIds(record.refs)),
  );
  const plottableDetailExperimentRefs = uniqueStrings(
    parsed.records.nodeDetails
      .filter((detail) => (detail.facts ?? []).some(isPlottableFact))
      .flatMap((detail) => experimentRefIds(detail.refs)),
  );
  const startedExperimentRefs = nodeExperimentRefs.filter((experimentId) =>
    startedExperimentIds.has(experimentId),
  );
  const measuredExperimentRefs = plottableDetailExperimentRefs.filter((experimentId) =>
    measuredExperimentIds.has(experimentId),
  );

  return {
    parseable: parsed.parseable,
    liveNodeCount: parsed.records.mapNodes.length,
    liveDetailCount: parsed.records.nodeDetails.length,
    livePlottableDetailCount: parsed.records.nodeDetails.filter((detail) =>
      (detail.facts ?? []).some(isPlottableFact),
    ).length,
    liveSignalCount: parsed.records.signals.length,
    liveFocusCount: parsed.records.focuses.length,
    startedExperimentRefCount: startedExperimentRefs.length,
    startedExperimentRefs,
    measuredExperimentRefCount: measuredExperimentRefs.length,
    measuredExperimentRefs,
  };
}

function parseLiveRecordsOutput(value: string): {
  readonly parseable: boolean;
  readonly records: ParsedLiveRecords;
} {
  try {
    const parsed = JSON.parse(value) as {
      readonly signals?: unknown;
      readonly mapNodes?: unknown;
      readonly mapEdges?: unknown;
      readonly focuses?: unknown;
      readonly nodeDetails?: unknown;
    };

    return {
      parseable: true,
      records: {
        signals: parseObjectArray<ParsedLiveSignal>(parsed.signals),
        mapNodes: parseObjectArray<ParsedLiveMapNode>(parsed.mapNodes),
        mapEdges: parseObjectArray<unknown>(parsed.mapEdges),
        focuses: parseObjectArray<unknown>(parsed.focuses),
        nodeDetails: parseObjectArray<ParsedLiveNodeDetail>(parsed.nodeDetails),
      },
    };
  } catch {
    return {
      parseable: false,
      records: emptyLiveRecords(),
    };
  }
}

function emptyLiveRecords(): ParsedLiveRecords {
  return {
    signals: [],
    mapNodes: [],
    mapEdges: [],
    focuses: [],
    nodeDetails: [],
  };
}

function parseObjectArray<TValue>(value: unknown): readonly TValue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => item as TValue)
    .filter((item) => typeof item === "object" && item !== null);
}

function refsFromUnknown(value: unknown): readonly ParsedTargetRef[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((ref) => ref as ParsedTargetRef)
    .filter((ref) => typeof ref === "object" && ref !== null);
}

function experimentRefIds(value: unknown): readonly string[] {
  return refsFromUnknown(value)
    .filter((ref) => ref.targetKind === "experiment" && ref.targetId !== undefined)
    .map((ref) => ref.targetId as string);
}

function isPlottableFact(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const fact = value as ParsedLiveNodeFact;

  if (typeof fact.numericValue === "number" && Number.isFinite(fact.numericValue)) {
    return true;
  }

  if (typeof fact.value !== "string") {
    return false;
  }

  const parsed = parseFloat(fact.value);
  return Number.isFinite(parsed);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}
