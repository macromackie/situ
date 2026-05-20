import type { IdPrefix, SituId } from "./ids.js";

/**
 * Product record kinds that may be referenced by ordinary product activity.
 */
export type TargetKind = IdPrefix;

/**
 * Reference to an ordinary Situ product record.
 */
export type TargetRef<TKind extends TargetKind = TargetKind> = {
  readonly targetKind: TKind;
  readonly targetId: SituId<TKind>;
};
