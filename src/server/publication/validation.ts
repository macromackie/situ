import type { Database } from "../database.js";
import type { Draft } from "../../protocol/publication/index.js";
import { canonical } from "../../protocol/models.js";
import type { Asset } from "../../protocol/artifacts.js";
import type {
  PublicationDocument,
  SourceRef,
  SourceSnapshot,
  ValidationIssue,
} from "../../protocol/publication/index.js";

export function references(document: PublicationDocument): SourceRef[] {
  const refs: SourceRef[] = [];
  for (const page of document.pages) {
    refs.push(...page.summary.sources);
    for (const section of page.sections)
      for (const block of section.blocks) {
        if ("sources" in block) refs.push(...block.sources);
        if (block.kind === "statement" && block.acceptedReview)
          refs.push(block.acceptedReview);
      }
  }
  for (const figure of document.figures) {
    refs.push(...figure.sources);
    if (figure.kind === "timeline")
      refs.push(...figure.items.map((item) => item.source));
    if (figure.kind === "evidence")
      refs.push(...figure.nodes.map((node) => node.source));
  }
  for (const update of document.updates) refs.push(...update.sources);
  return refs;
}
export function resolveSource(
  sources: Record<string, SourceSnapshot>,
  ref: SourceRef,
) {
  return sources[ref.snapshotId]?.records[ref.recordId];
}
export function validateDocument(
  document: PublicationDocument,
  sources: Record<string, SourceSnapshot>,
  previous?: PublicationDocument,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fail = (path: string, message: string) =>
    issues.push({ path, message });
  const unique = (ids: string[], path: string) => {
    if (new Set(ids).size !== ids.length) fail(path, "IDs must be unique");
  };
  unique(
    document.pages.map((x) => x.id),
    "pages",
  );
  unique(
    document.figures.map((x) => x.id),
    "figures",
  );
  unique(
    document.updates.map((x) => x.id),
    "updates",
  );
  if (
    document.pages.filter((p) => p.template === "overview" && !p.archived)
      .length !== 1
  )
    fail("pages", "Include exactly one active overview");
  const pageIds = new Set(document.pages.map((p) => p.id));
  const figureIds = new Set(document.figures.map((f) => f.id));
  for (const old of previous?.pages ?? [])
    if (!pageIds.has(old.id))
      fail(
        "pages",
        `Keep page ${old.id} and archive it so its link remains valid`,
      );
  const ref = (r: SourceRef, path: string) => {
    const value = resolveSource(sources, r);
    if (!value)
      fail(path, `Source ${r.recordId} is absent from ${r.snapshotId}`);
    return value;
  };
  references(document).forEach((r, i) => ref(r, `sources.${i}`));
  for (const page of document.pages) {
    unique(
      page.sections.flatMap((s) => s.blocks.map((b) => b.id)),
      `pages.${page.id}.blocks`,
    );
    unique(
      page.sections.map((s) => s.id),
      `pages.${page.id}.sections`,
    );
    for (const section of page.sections)
      for (const block of section.blocks) {
        const path = `pages.${page.id}.${block.id}`;
        if (block.kind === "figure" && !figureIds.has(block.figureId))
          fail(path, "Figure does not exist");
        if (block.kind === "related")
          for (const id of block.pageIds)
            if (!pageIds.has(id)) fail(path, `Page ${id} does not exist`);
        if (block.kind === "statement") {
          if (block.stance !== "proposal" && !block.sources.length)
            fail(path, "Observations and interpretations need sources");
          if (block.acceptedReview) {
            const review = ref(block.acceptedReview, path);
            if (review?.kind !== "review" || review.state !== "accepted")
              fail(path, "Acceptance requires an accepted research review");
            if (block.stance === "proposal")
              fail(path, "A proposal cannot assert acceptance");
          }
        }
      }
  }
  for (const update of document.updates) {
    for (const id of update.pageIds)
      if (!pageIds.has(id))
        fail(`updates.${update.id}`, `Page ${id} does not exist`);
    if (
      update.corrects &&
      (update.kind !== "correction" ||
        update.corrects === update.id ||
        !previous?.updates.some((u) => u.id === update.corrects))
    )
      fail(
        `updates.${update.id}`,
        "A correction must identify an already published update",
      );
    if (update.kind === "correction" && !update.corrects)
      fail(`updates.${update.id}`, "Identify the update being corrected");
    const old = previous?.updates.find((u) => u.id === update.id);
    if (old && canonical(old) !== canonical(update))
      fail(
        `updates.${update.id}`,
        "Published updates are immutable; add a correction",
      );
  }
  for (const old of previous?.updates ?? [])
    if (!document.updates.some((u) => u.id === old.id))
      fail("updates", `Keep published update ${old.id}; add a correction`);
  for (const f of document.figures) {
    const path = `figures.${f.id}`;
    const asset = (id: string): Asset | undefined => {
      const r = f.sources.find((r) => r.recordId === id);
      const a = r && resolveSource(sources, r);
      if (!a || a.kind !== "asset") {
        fail(path, `Asset ${id} needs a pinned source reference`);
        return;
      }
      return a as unknown as Asset;
    };
    if (f.kind === "comparison" || f.kind === "curve" || f.kind === "matrix") {
      const data = f.assetIds.map((id) => asset(id)?.dataset);
      if (data.some((d) => !d))
        fail(path, "Every plot asset must be a Situ dataset");
      const first = data[0];
      for (const d of data)
        if (
          first &&
          d &&
          [
            "metric",
            "unit",
            "direction",
            "cohortId",
            "evaluatorVersion",
            "environmentVersion",
          ].some(
            (k) => d[k as keyof typeof d] !== first[k as keyof typeof first],
          )
        )
          fail(
            path,
            "Datasets must use the same metric, units, cohort, environment and evaluator",
          );
      const series = data.flatMap((d) => d?.series ?? []);
      if (
        f.scenario &&
        !series.some((s) => s.values.some((v) => v.scenario === f.scenario))
      )
        fail(path, "Selected scenario is absent from the datasets");
      unique(
        series.map((s) => s.id),
        path,
      );
      if (f.baseline && !series.some((s) => s.id === f.baseline))
        fail(path, "Baseline series is absent");
      if (f.kind === "comparison" && !f.baseline)
        fail(path, "Choose a baseline for a comparison");
      if (
        f.kind === "curve" &&
        series.some((s) => s.values.some((v) => v.step === undefined))
      )
        fail(path, "Learning curves require steps on every observation");
    }
    if (f.kind === "example") {
      const a = asset(f.assetId);
      if (a && !a.mediaType.startsWith("image/"))
        fail(path, "Annotated examples require an image");
    }
    if (f.kind === "replay") {
      const a = asset(f.left.assetId),
        b = asset(f.right.assetId);
      for (const [clip, item] of [
        [f.left, a],
        [f.right, b],
      ] as const) {
        if (!item?.mediaType.startsWith("video/") || !item.replay)
          fail(path, "Replay clips need video with replay metadata");
        if (
          clip.end <= clip.start ||
          (item?.replay && clip.end > item.replay.duration)
        )
          fail(
            path,
            "Clip interval exceeds the replay duration or is reversed",
          );
      }
      if (
        f.alignment === "matched" &&
        a?.replay &&
        b?.replay &&
        ["seed", "scenario", "environmentVersion"].some(
          (k) =>
            a.replay![k as keyof typeof a.replay] !==
            b.replay![k as keyof typeof b.replay],
        )
      )
        fail(
          path,
          "Matched replay requires the same seed, scenario and environment",
        );
      if (f.alignment === "illustrative" && !f.caption.trim())
        fail(path, "Explain why this comparison is illustrative");
    }
    if (f.kind === "timeline") {
      unique(
        f.lanes.map((l) => l.id),
        path,
      );
      unique(
        f.items.map((i) => i.id),
        path,
      );
      for (const lane of f.lanes)
        if (lane.pageId && !pageIds.has(lane.pageId))
          fail(path, "Timeline lane references a missing page");
      for (const item of f.items) {
        const record = ref(item.source, path);
        if (!f.lanes.some((l) => l.id === item.laneId))
          fail(path, "Timeline item has no lane");
        if (
          typeof record?.[item.startField] !== "number" ||
          (item.endField &&
            (typeof record?.[item.endField] !== "number" ||
              record[item.endField] < record[item.startField]))
        )
          fail(
            path,
            "Timeline timestamps must come from ordered source timestamps",
          );
      }
    }
    if (f.kind === "evidence") {
      unique(
        f.nodes.map((n) => n.id),
        path,
      );
      for (const edge of f.edges)
        if (
          !f.nodes.some((n) => n.id === edge.from) ||
          !f.nodes.some((n) => n.id === edge.to)
        )
          fail(path, "Evidence edge references a missing node");
    }
  }
  return issues;
}

export function validatePublication(
  db: Database,
  d: Draft,
  sources: Record<string, SourceSnapshot>,
  now: number,
  previous?: PublicationDocument,
): ValidationIssue[] {
  const issues = validateDocument(d.document, sources, previous);
  for (const source of Object.values(sources))
    if (source.through > sources[d.snapshotId].through)
      issues.push({
        path: "snapshotId",
        message:
          "Capture a source snapshot at least as recent as all cited sources",
      });
  for (const page of d.document.pages)
    for (const block of page.sections.flatMap((s) => s.blocks)) {
      if (block.kind === "statement" && block.acceptedReview) {
        const row = db.storage.query(
          "SELECT data FROM entities WHERE id=? AND kind='review'",
          block.acceptedReview.recordId,
        )[0];
        const record = row ? JSON.parse(row.data) : null;
        const saved = resolveSource(sources, block.acceptedReview);
        if (record?.state !== "accepted" || record.revision !== saved?.revision)
          issues.push({
            path: `pages.${page.id}.${block.id}`,
            message:
              "The accepted review has changed; reconcile this statement before publishing",
          });
      }
    }
  for (const update of d.document.updates)
    if (update.occurredAt > now)
      issues.push({
        path: `updates.${update.id}`,
        message: "An update cannot claim an event in the future",
      });
  return issues;
}
