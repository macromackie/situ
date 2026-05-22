import { expect, test } from "bun:test";

import { collectLiveMapEvidence } from "./live-map-evidence.js";

test("counts plottable live detail facts and measured experiment coverage", () => {
  const evidence = collectLiveMapEvidence({
    measuredExperimentIds: ["experiment_one", "experiment_two"],
    liveRecordsJson: JSON.stringify({
      signals: [{ id: "live_signal_best" }],
      mapNodes: [
        {
          id: "live_node_one",
          nodeKey: "one",
          refs: [{ targetKind: "experiment", targetId: "experiment_one" }],
        },
        {
          id: "live_node_two",
          nodeKey: "two",
          refs: [{ targetKind: "experiment", targetId: "experiment_two" }],
        },
      ],
      mapEdges: [],
      focuses: [{ id: "live_focus_one" }],
      nodeDetails: [
        {
          id: "live_detail_one",
          nodeKey: "one",
          facts: [{ label: "Accuracy", value: "0.81", numericValue: 0.81 }],
        },
        {
          id: "live_detail_two",
          nodeKey: "two",
          refs: [{ targetKind: "experiment", targetId: "experiment_two" }],
          facts: [{ label: "Accuracy", value: "0.79" }],
        },
        {
          id: "live_detail_note",
          nodeKey: "note",
          facts: [{ label: "State", value: "running" }],
        },
      ],
    }),
  });

  expect(evidence).toEqual({
    parseable: true,
    liveNodeCount: 2,
    liveDetailCount: 3,
    livePlottableDetailCount: 2,
    liveSignalCount: 1,
    liveFocusCount: 1,
    measuredExperimentRefCount: 2,
    measuredExperimentRefs: ["experiment_one", "experiment_two"],
  });
});

test("returns empty evidence for unparsable live records", () => {
  expect(
    collectLiveMapEvidence({
      measuredExperimentIds: ["experiment_one"],
      liveRecordsJson: "{bad",
    }),
  ).toEqual({
    parseable: false,
    liveNodeCount: 0,
    liveDetailCount: 0,
    livePlottableDetailCount: 0,
    liveSignalCount: 0,
    liveFocusCount: 0,
    measuredExperimentRefCount: 0,
    measuredExperimentRefs: [],
  });
});
