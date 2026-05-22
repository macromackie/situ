import { Database } from "bun:sqlite";

import { expect, test } from "bun:test";

import type { SituId, TargetRef } from "@situ/common";
import { ConflictError, ValidationError } from "@situ/errors";

import {
  createLiveFocusRecord,
  createLiveMapEdgeRecord,
  createLiveMapNodeRecord,
  createLiveNodeDetailRecord,
  createLiveSignalRecord,
  createLiveRepository,
  createLiveSignalsTableStatement,
  liveSchemaFragment,
} from "../src/index.js";

const projectId = "project_live" as SituId<"project">;
const otherProjectId = "project_live_other" as SituId<"project">;
const experimentRef: TargetRef<"experiment"> = {
  targetKind: "experiment",
  targetId: "experiment_live_parser" as SituId<"experiment">,
};

function createTestDatabase(): Database {
  const database = new Database(":memory:");

  database.exec("PRAGMA foreign_keys = ON");
  database.exec("CREATE TABLE projects (id TEXT PRIMARY KEY);");
  database.exec(`INSERT INTO projects (id) VALUES ('${projectId}'), ('${otherProjectId}');`);

  for (const statement of liveSchemaFragment.statements) {
    database.exec(statement);
  }

  return database;
}

test("exports live schema statements", () => {
  const expectedPackageName: "live" = liveSchemaFragment.packageName;

  expect(expectedPackageName).toBe("live");
  expect(liveSchemaFragment.statements[0]).toBe(createLiveSignalsTableStatement);
});

test("creates normalized live presentation records", () => {
  const authoredBy = {
    actorKind: "local_agent" as const,
    actorId: "  manager  ",
    displayName: "  Manager  ",
  };

  expect(
    createLiveSignalRecord({
      id: "live_signal_1" as SituId<"live_signal">,
      projectId,
      slot: "  risk  ",
      label: "  Risk  ",
      value: "  verifier pending  ",
      summary: "  one check remains  ",
      tone: "watch",
      refs: [experimentRef],
      authoredBy,
      now: "2026-05-20T08:00:00.000-04:00",
    }),
  ).toMatchObject({
    id: "live_signal_1",
    slot: "risk",
    label: "Risk",
    value: "verifier pending",
    summary: "one check remains",
    tone: "watch",
    refs: [experimentRef],
    visibility: "visible",
    authoredBy: {
      actorKind: "local_agent",
      actorId: "manager",
      displayName: "Manager",
    },
    metadata: {
      createdAt: "2026-05-20T12:00:00.000Z",
      updatedAt: "2026-05-20T12:00:00.000Z",
    },
  });

  expect(
    createLiveMapNodeRecord({
      id: "live_node_1" as SituId<"live_node">,
      projectId,
      nodeKey: "  parser  ",
      kind: "branch",
      title: "  Parser repair  ",
      summary: "  Measured ahead of baseline.  ",
      tone: "good",
      occurredAt: "2026-05-20T08:01:00.000-04:00",
      refs: [experimentRef],
      authoredBy,
      now: "2026-05-20T08:02:00.000-04:00",
    }),
  ).toMatchObject({
    id: "live_node_1",
    nodeKey: "parser",
    kind: "branch",
    occurredAt: "2026-05-20T12:01:00.000Z",
  });

  expect(
    createLiveMapEdgeRecord({
      id: "live_edge_1" as SituId<"live_edge">,
      projectId,
      edgeKey: "baseline_to_parser",
      fromNodeKey: "baseline",
      toNodeKey: "parser",
      relation: "led_to",
      tone: "good",
      authoredBy,
    }),
  ).toMatchObject({ edgeKey: "baseline_to_parser", relation: "led_to" });

  expect(
    createLiveFocusRecord({
      id: "live_focus_1" as SituId<"live_focus">,
      projectId,
      mode: "node",
      primaryNodeKey: "parser",
      relatedNodeKeys: ["baseline"],
      summary: "Review parser branch.",
      authoredBy,
    }),
  ).toMatchObject({ mode: "node", primaryNodeKey: "parser" });

  expect(
    createLiveNodeDetailRecord({
      id: "live_detail_1" as SituId<"live_detail">,
      projectId,
      nodeKey: "parser",
      bodyMarkdown: "Parser branch is ahead.",
      facts: [
        {
          label: "Delta",
          value: "+0.09",
          tone: "good",
          metricName: "dev_accuracy",
          numericValue: 0.09,
          unit: "accuracy",
          direction: "higher_is_better",
        },
      ],
      refs: [experimentRef],
      authoredBy,
    }),
  ).toMatchObject({
    nodeKey: "parser",
    facts: [
      {
        label: "Delta",
        value: "+0.09",
        tone: "good",
        metricName: "dev_accuracy",
        numericValue: 0.09,
        unit: "accuracy",
        direction: "higher_is_better",
      },
    ],
  });
});

test("rejects invalid live presentation records", () => {
  const baseInput = {
    projectId,
    slot: "risk",
    label: "Risk",
    value: "None",
    tone: "neutral" as const,
    authoredBy: {
      actorKind: "human" as const,
      actorId: "scott",
    },
  };

  expect(() => createLiveSignalRecord({ ...baseInput, slot: "" })).toThrow(ValidationError);
  expect(() => createLiveSignalRecord({ ...baseInput, tone: "bad" as never })).toThrow(
    ValidationError,
  );
  expect(() =>
    createLiveMapNodeRecord({
      projectId,
      nodeKey: "node",
      kind: "bogus" as never,
      title: "Node",
      summary: "Summary",
      tone: "good",
      authoredBy: baseInput.authoredBy,
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createLiveNodeDetailRecord({
      projectId,
      nodeKey: "node",
      bodyMarkdown: "Body",
      facts: [{ label: "", value: "x" }],
      authoredBy: baseInput.authoredBy,
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createLiveNodeDetailRecord({
      projectId,
      nodeKey: "node",
      bodyMarkdown: "Body",
      facts: [{ label: "Metric", value: "0.1", direction: "sideways" as never }],
      authoredBy: baseInput.authoredBy,
    }),
  ).toThrow(ValidationError);
  expect(() =>
    createLiveNodeDetailRecord({
      projectId,
      nodeKey: "node",
      bodyMarkdown: "Body",
      facts: [{ label: "Metric", value: "0.1", numericValue: Number.NaN }],
      authoredBy: baseInput.authoredBy,
    }),
  ).toThrow(ValidationError);
});

test("persists and lists live records by project and recency", () => {
  const database = createTestDatabase();
  const repository = createLiveRepository({ database });

  const authoredBy = { actorKind: "local_agent" as const, actorId: "manager" };
  repository.createSignal({
    id: "live_signal_old" as SituId<"live_signal">,
    projectId,
    slot: "risk",
    label: "Risk",
    value: "Old",
    tone: "watch",
    authoredBy,
    now: "2026-05-20T12:00:00.000Z",
  });
  repository.createSignal({
    id: "live_signal_other" as SituId<"live_signal">,
    projectId: otherProjectId,
    slot: "risk",
    label: "Risk",
    value: "Other",
    tone: "neutral",
    authoredBy,
    now: "2026-05-20T12:00:30.000Z",
  });
  repository.createSignal({
    id: "live_signal_new" as SituId<"live_signal">,
    projectId,
    slot: "risk",
    label: "Risk",
    value: "New",
    tone: "good",
    authoredBy,
    now: "2026-05-20T12:01:00.000Z",
  });
  repository.createMapNode({
    id: "live_node_parser" as SituId<"live_node">,
    projectId,
    nodeKey: "parser",
    kind: "branch",
    title: "Parser",
    summary: "Parser branch.",
    tone: "good",
    authoredBy,
  });
  repository.createMapEdge({
    id: "live_edge_parser" as SituId<"live_edge">,
    projectId,
    edgeKey: "baseline_to_parser",
    fromNodeKey: "baseline",
    toNodeKey: "parser",
    relation: "led_to",
    tone: "good",
    authoredBy,
  });
  repository.createFocus({
    id: "live_focus_parser" as SituId<"live_focus">,
    projectId,
    mode: "node",
    primaryNodeKey: "parser",
    authoredBy,
  });
  repository.createNodeDetail({
    id: "live_detail_parser" as SituId<"live_detail">,
    projectId,
    nodeKey: "parser",
    bodyMarkdown: "Parser branch details.",
    authoredBy,
  });

  expect(repository.listAllSignals().map((signal) => signal.id)).toEqual([
    "live_signal_old",
    "live_signal_other",
    "live_signal_new",
  ]);
  expect(repository.listForProject({ projectId })).toMatchObject({
    signals: [{ value: "Old" }, { value: "New" }],
    mapNodes: [{ nodeKey: "parser" }],
    mapEdges: [{ edgeKey: "baseline_to_parser" }],
    focuses: [{ primaryNodeKey: "parser" }],
    nodeDetails: [{ nodeKey: "parser" }],
  });

  database.close();
});

test("rejects duplicate ids and missing parent projects", () => {
  const database = createTestDatabase();
  const repository = createLiveRepository({ database });
  const input = {
    id: "live_signal_duplicate" as SituId<"live_signal">,
    projectId,
    slot: "risk",
    label: "Risk",
    value: "None",
    tone: "neutral" as const,
    authoredBy: {
      actorKind: "human" as const,
      actorId: "scott",
    },
  };

  repository.createSignal(input);
  expect(() => repository.createSignal(input)).toThrow(ConflictError);
  expect(() =>
    repository.createSignal({
      ...input,
      id: "live_signal_missing_project" as SituId<"live_signal">,
      projectId: "project_missing" as SituId<"project">,
    }),
  ).toThrow(ConflictError);

  database.close();
});
