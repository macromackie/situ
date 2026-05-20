import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

import type { ProjectReportSnapshot } from "../types.js";
import { isRegisteredComponent } from "./components.js";

export type ValidationIssue = {
  readonly kind: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly component?: string;
  readonly attribute?: string;
};

export type ValidationResult = {
  readonly ok: boolean;
  readonly errors: readonly ValidationIssue[];
  readonly warnings: readonly ValidationIssue[];
};

export type ValidateMdxReportInput = {
  readonly mdxSource: string;
  readonly snapshot: ProjectReportSnapshot;
};

const forbiddenRawElements = new Set(["script", "iframe", "object", "embed", "link", "style"]);

/**
 * Validates an MDX draft against a snapshot. Errors block submission; warnings
 * surface to the agent during preview.
 */
export function validateMdxReport(input: ValidateMdxReportInput): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const experimentIds = new Set<string>();
  const taskIds = new Set<string>();
  const baselineIds = new Set<string>();
  for (const taskSnapshot of input.snapshot.tasks) {
    taskIds.add(taskSnapshot.task.id);
    for (const experimentSnapshot of taskSnapshot.experiments) {
      experimentIds.add(experimentSnapshot.experiment.id);
    }
  }
  for (const baselineSnapshot of input.snapshot.baselines) {
    baselineIds.add(baselineSnapshot.baseline.id);
  }
  const measurementIndex = buildMeasurementIndex(input.snapshot);
  const branchNames = new Set<string>();
  for (const taskSnapshot of input.snapshot.tasks) {
    for (const experimentSnapshot of taskSnapshot.experiments) {
      if (experimentSnapshot.experiment.branchName !== undefined) {
        branchNames.add(experimentSnapshot.experiment.branchName);
      }
    }
  }

  const seenComponents = new Set<string>();
  const seenEvidenceFor = new Set<string>();
  const seenBaselineFor = new Set<string>();

  const tree = unified().use(remarkParse).use(remarkMdx).parse(input.mdxSource);

  visit(tree, (node) => {
    if (node.type !== "mdxJsxFlowElement" && node.type !== "mdxJsxTextElement") {
      return;
    }
    const jsxNode = node as unknown as { name?: string; attributes?: unknown };
    const name = typeof jsxNode.name === "string" ? jsxNode.name : "";
    if (name === "") {
      return;
    }
    seenComponents.add(name);

    if (forbiddenRawElements.has(name.toLowerCase())) {
      errors.push({
        kind: "error",
        code: "forbidden-element",
        message: `MDX may not use raw <${name}> elements; the report frame owns document-level resources.`,
        component: name,
      });
      return;
    }
    if (!isRegisteredComponent(name) && !/^[a-z]/.test(name)) {
      errors.push({
        kind: "error",
        code: "unknown-component",
        message: `<${name}> is not in @situ/reports-ui. Use one of the registered components.`,
        component: name,
      });
      return;
    }

    const attributes = readAttributes(jsxNode);
    for (const [attrName, attrValue] of attributes.entries()) {
      if (typeof attrValue !== "string") {
        continue;
      }
      if (/^https?:\/\//.test(attrValue)) {
        errors.push({
          kind: "error",
          code: "remote-url",
          message: `Attribute ${attrName}="${attrValue}" contains an external URL; the report must stay offline.`,
          component: name,
          attribute: attrName,
        });
      }
    }

    if (name === "MetricCard") {
      const source = attributes.get("source");
      const metric = attributes.get("metric");
      const valueAttr = attributes.get("value");
      const numericValue = typeof valueAttr === "number" ? valueAttr : Number(valueAttr);
      if (typeof source !== "string" || source === "") {
        errors.push({
          kind: "error",
          code: "missing-source",
          message: `<MetricCard> requires a non-empty source prop naming a baseline or experiment id.`,
          component: name,
          attribute: "source",
        });
      } else if (!baselineIds.has(source) && !experimentIds.has(source)) {
        errors.push({
          kind: "error",
          code: "unknown-source",
          message: `<MetricCard source="${source}"> does not match any baseline or experiment id in the snapshot.`,
          component: name,
          attribute: "source",
        });
      } else if (typeof metric !== "string" || metric === "") {
        errors.push({
          kind: "error",
          code: "missing-metric",
          message: `<MetricCard> requires a metric prop.`,
          component: name,
          attribute: "metric",
        });
      } else if (!Number.isFinite(numericValue)) {
        errors.push({
          kind: "error",
          code: "invalid-value",
          message: `<MetricCard value="${valueAttr}"> is not a finite number.`,
          component: name,
          attribute: "value",
        });
      } else {
        const recorded = measurementIndex.get(`${source}|${metric}`);
        if (recorded === undefined) {
          errors.push({
            kind: "error",
            code: "ungrounded-value",
            message: `<MetricCard value=${numericValue} metric="${metric}" source="${source}"> does not match any recorded measurement.`,
            component: name,
          });
        } else if (!recorded.some((value) => Math.abs(value - numericValue) <= 0.001)) {
          errors.push({
            kind: "error",
            code: "value-mismatch",
            message: `<MetricCard value=${numericValue}> does not match a recorded ${metric} measurement on ${source}. Recorded values: ${recorded.join(", ")}.`,
            component: name,
          });
        }
      }
    }

    if (name === "EvidenceBlock") {
      const experimentId = attributes.get("experimentId");
      if (typeof experimentId !== "string" || experimentId === "") {
        errors.push({
          kind: "error",
          code: "missing-experiment-id",
          message: `<EvidenceBlock> requires an experimentId prop.`,
          component: name,
          attribute: "experimentId",
        });
      } else if (!experimentIds.has(experimentId)) {
        errors.push({
          kind: "error",
          code: "unknown-experiment",
          message: `<EvidenceBlock experimentId="${experimentId}"> does not match any experiment in the snapshot.`,
          component: name,
        });
      } else {
        seenEvidenceFor.add(experimentId);
      }
    }

    if (name === "BaselineCard") {
      const baselineId = attributes.get("baselineId");
      if (typeof baselineId !== "string" || baselineId === "") {
        errors.push({
          kind: "error",
          code: "missing-baseline-id",
          message: `<BaselineCard> requires a baselineId prop.`,
          component: name,
          attribute: "baselineId",
        });
      } else if (!baselineIds.has(baselineId)) {
        errors.push({
          kind: "error",
          code: "unknown-baseline",
          message: `<BaselineCard baselineId="${baselineId}"> does not match any baseline in the snapshot.`,
          component: name,
        });
      } else {
        seenBaselineFor.add(baselineId);
      }
    }

    if (name === "Section") {
      const idValue = attributes.get("id");
      if (typeof idValue !== "string" || idValue === "") {
        warnings.push({
          kind: "warning",
          code: "section-missing-id",
          message: `<Section> should set an id so the table of contents can link to it.`,
          component: name,
          attribute: "id",
        });
      }
    }
  });

  if (input.snapshot.baselines.length > 0 && seenBaselineFor.size === 0) {
    errors.push({
      kind: "error",
      code: "missing-baseline-card",
      message: `The snapshot has ${input.snapshot.baselines.length} baseline(s); the report must include at least one <BaselineCard>.`,
    });
  }

  const requiredEvidenceStatuses = new Set(["accepted", "rejected", "abandoned"]);
  for (const taskSnapshot of input.snapshot.tasks) {
    for (const experimentSnapshot of taskSnapshot.experiments) {
      if (
        requiredEvidenceStatuses.has(experimentSnapshot.experiment.status) &&
        !seenEvidenceFor.has(experimentSnapshot.experiment.id)
      ) {
        errors.push({
          kind: "error",
          code: "missing-evidence-block",
          message: `Experiment ${experimentSnapshot.experiment.id} (${experimentSnapshot.experiment.status}) requires an <EvidenceBlock>.`,
        });
      }
    }
  }

  if (!seenComponents.has("ResearchReport")) {
    errors.push({
      kind: "error",
      code: "missing-research-report",
      message: `MDX must wrap content in <ResearchReport title="...">.`,
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

function readAttributes(node: {
  [key: string]: unknown;
}): Map<string, string | number | boolean | undefined> {
  const attributes = new Map<string, string | number | boolean | undefined>();
  const list = node.attributes;
  if (!Array.isArray(list)) {
    return attributes;
  }
  for (const attribute of list) {
    if (
      attribute === null ||
      typeof attribute !== "object" ||
      (attribute as { type?: string }).type !== "mdxJsxAttribute" ||
      typeof (attribute as { name?: string }).name !== "string"
    ) {
      continue;
    }
    const attr = attribute as {
      name: string;
      value?: string | { type?: string; value?: string } | null;
    };
    const value = attr.value;
    if (value === undefined || value === null) {
      attributes.set(attr.name, true);
      continue;
    }
    if (typeof value === "string") {
      attributes.set(attr.name, value);
      continue;
    }
    if (typeof value === "object" && typeof value.value === "string") {
      const raw = value.value.trim();
      const numeric = Number(raw);
      if (Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(raw)) {
        attributes.set(attr.name, numeric);
        continue;
      }
      const unquoted = raw.replace(/^["'`]/, "").replace(/["'`]$/, "");
      attributes.set(attr.name, unquoted);
      continue;
    }
  }
  return attributes;
}

function buildMeasurementIndex(snapshot: ProjectReportSnapshot): Map<string, number[]> {
  const index = new Map<string, number[]>();
  for (const baselineSnapshot of snapshot.baselines) {
    for (const measurementSnapshot of baselineSnapshot.measurements) {
      pushValue(
        index,
        `${baselineSnapshot.baseline.id}|${measurementSnapshot.measurement.metricName}`,
        measurementSnapshot.measurement.numericValue,
      );
    }
  }
  for (const taskSnapshot of snapshot.tasks) {
    for (const experimentSnapshot of taskSnapshot.experiments) {
      for (const measurementSnapshot of experimentSnapshot.measurements) {
        pushValue(
          index,
          `${experimentSnapshot.experiment.id}|${measurementSnapshot.measurement.metricName}`,
          measurementSnapshot.measurement.numericValue,
        );
      }
    }
  }
  return index;
}

function pushValue(map: Map<string, number[]>, key: string, value: number): void {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}
