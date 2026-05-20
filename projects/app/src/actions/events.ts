import type { SituId } from "@situ/common";
import type {
  CreateEventInput,
  EventRecord,
  ListEventsForTargetInput,
  ListRecentEventsInput,
} from "@situ/events";

import type { AppActionContext } from "./context.js";

export type CreateEventActionInput = CreateEventInput & {
  readonly context: AppActionContext;
};

export type CreateEventActionResult = {
  readonly event: EventRecord;
};

export function createEventAction(input: CreateEventActionInput): CreateEventActionResult {
  const event = input.context.repositories.events.create({
    id: input.id,
    target: input.target,
    actor: input.actor,
    summaryMarkdown: input.summaryMarkdown,
    bodyMarkdown: input.bodyMarkdown,
    now: input.now,
  });

  return { event };
}

export type GetEventActionInput = {
  readonly context: AppActionContext;
  readonly id: SituId<"event">;
};

export function getEventAction(input: GetEventActionInput): EventRecord | undefined {
  return input.context.repositories.events.getById({
    id: input.id,
  });
}

export type ListEventsActionInput = ListEventsForTargetInput & {
  readonly context: AppActionContext;
};

export function listEventsAction(input: ListEventsActionInput): readonly EventRecord[] {
  return input.context.repositories.events.listForTarget({
    target: input.target,
  });
}

export type ListRecentEventsActionInput = ListRecentEventsInput & {
  readonly context: AppActionContext;
};

export function listRecentEventsAction(input: ListRecentEventsActionInput): readonly EventRecord[] {
  return input.context.repositories.events.listRecent({
    limit: input.limit,
  });
}
