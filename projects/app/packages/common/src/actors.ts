/**
 * Visible product attribution kind for a human, local agent, or system actor.
 */
export type ActorKind = "human" | "local_agent" | "system";

/**
 * Visible product attribution.
 */
export type ActorRef = {
  readonly actorKind: ActorKind;
  readonly actorId: string;
  readonly displayName?: string;
};
