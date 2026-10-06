import { z } from "zod";

export const artifactId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/);
export const hash = z.string().regex(/^[a-f0-9]{64}$/);
function orderedObservations(values: { scenario: string; step?: number }[]) {
  const last = new Map<string, number | undefined>();
  for (const value of values) {
    if (last.has(value.scenario)) {
      const previous = last.get(value.scenario);
      if (
        previous === undefined ||
        value.step === undefined ||
        value.step <= previous
      )
        return false;
    }
    last.set(value.scenario, value.step);
  }
  return true;
}
export const dataset = z
  .object({
    schema: z.literal("situ.dataset.v1"),
    metric: z.string().min(1).max(100),
    unit: z.string().min(1).max(80),
    direction: z.enum(["higher", "lower"]),
    cohortId: artifactId,
    evaluatorVersion: z.string().min(1).max(120),
    environmentVersion: z.string().min(1).max(120),
    series: z
      .array(
        z
          .object({
            id: artifactId,
            label: z.string().min(1).max(160),
            seed: z.string().max(100),
            values: z
              .array(
                z
                  .object({
                    step: z.number().finite().optional(),
                    scenario: z.string().min(1).max(160),
                    value: z.number().finite().nullable(),
                    n: z.number().int().nonnegative(),
                    lower: z.number().finite().optional(),
                    upper: z.number().finite().optional(),
                  })
                  .strict()
                  .refine(
                    (v) => (v.lower === undefined) === (v.upper === undefined),
                    "Supply both interval bounds",
                  )
                  .refine(
                    (v) => v.lower === undefined || v.upper! >= v.lower,
                    "Interval bounds are reversed",
                  )
                  .refine(
                    (v) => v.value === null || v.n > 0,
                    "A measured value needs a sample count",
                  )
                  .refine(
                    (v) =>
                      v.value === null ||
                      v.lower === undefined ||
                      (v.lower <= v.value && v.value <= v.upper!),
                    "Value is outside its interval",
                  ),
              )
              .min(1)
              .max(10000),
          })
          .strict()
          .refine(
            (s) =>
              new Set(
                s.values.map((v) =>
                  JSON.stringify([v.scenario, v.step ?? null]),
                ),
              ).size === s.values.length,
            "Each scenario and step must identify one observation",
          )
          .refine(
            (s) => orderedObservations(s.values),
            "Use increasing steps within each scenario; a scenario without steps has one observation",
          ),
      )
      .min(1)
      .max(64),
  })
  .strict()
  .refine(
    (d) => new Set(d.series.map((s) => s.id)).size === d.series.length,
    "Series IDs must be unique",
  );
export const replay = z
  .object({
    policy: z.string().min(1).max(160),
    scenario: z.string().min(1).max(160),
    seed: z.string().min(1).max(100),
    environmentVersion: z.string().min(1).max(120),
    duration: z.number().positive().max(3600),
  })
  .strict();
export const assetInput = z
  .object({
    projectId: artifactId,
    sha256: hash,
    title: z.string().trim().min(1).max(240),
    mediaType: z.enum([
      "application/json",
      "image/png",
      "image/jpeg",
      "image/webp",
      "video/mp4",
      "video/webm",
    ]),
    replay: replay.optional(),
  })
  .strict();
export type Dataset = z.infer<typeof dataset>;
export type AssetInput = z.infer<typeof assetInput>;
export type Asset = AssetInput & {
  id: string;
  size: number;
  createdAt: number;
  author: string;
  dataset?: Dataset;
};
