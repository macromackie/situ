/**
 * Stable prefixes for Situ product record identifiers.
 */
export type IdPrefix =
  | "project"
  | "task"
  | "comment"
  | "event"
  | "notification"
  | "baseline"
  | "experiment"
  | "measurement"
  | "artifact"
  | "review"
  | "report"
  | "briefing"
  | "live_signal"
  | "live_node"
  | "live_edge"
  | "live_focus"
  | "live_detail";

/**
 * Prefixed Situ identifier used at package boundaries.
 */
export type SituId<TPrefix extends IdPrefix = IdPrefix> = `${TPrefix}_${string}` & {
  readonly __situIdPrefix?: TPrefix;
};

/**
 * Object argument accepted by id creation helpers.
 */
export type CreateIdInput<TPrefix extends IdPrefix = IdPrefix> = {
  readonly prefix: TPrefix;
  readonly randomUUID?: () => string;
};

/**
 * Creates a new prefixed Situ id.
 */
export function createId<TPrefix extends IdPrefix>(input: CreateIdInput<TPrefix>): SituId<TPrefix> {
  const randomUUID = (() => {
    if (input.randomUUID !== undefined) {
      return input.randomUUID();
    }

    return crypto.randomUUID();
  })();

  const suffix = randomUUID.replaceAll("-", "");

  return `${input.prefix}_${suffix}` as SituId<TPrefix>;
}
