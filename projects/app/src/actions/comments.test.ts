import { expect, test } from "bun:test";

import type { SituId } from "@situ/common";

import { memoryDatabasePath, openAppDatabase } from "../db/index.js";
import {
  createAppActionContext,
  createCommentAction,
  getCommentAction,
  listCommentsAction,
} from "./index.js";

type CountRow = {
  readonly count: number;
};

function countEvents(input: { readonly database: ReturnType<typeof openAppDatabase> }): number {
  return (
    input.database.query<CountRow, []>("SELECT COUNT(*) AS count FROM events").get()?.count ?? 0
  );
}

test("creates a comment through the app action without emitting events", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const result = createCommentAction({
      context,
      id: "comment_action_create" as SituId<"comment">,
      target: {
        targetKind: "task",
        targetId: "task_comment_target" as SituId<"task">,
      },
      bodyMarkdown: "Please inspect this task.",
      author: {
        actorKind: "human",
        actorId: "scott",
        displayName: "Scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(result.comment).toMatchObject({
      id: "comment_action_create",
      target: {
        targetKind: "task",
        targetId: "task_comment_target",
      },
      bodyMarkdown: "Please inspect this task.",
      author: {
        actorKind: "human",
        actorId: "scott",
        displayName: "Scott",
      },
      metadata: {
        createdAt: "2026-05-13T12:00:00.000Z",
        updatedAt: "2026-05-13T12:00:00.000Z",
      },
    });
    expect(context.repositories.comments.getById({ id: result.comment.id })).toEqual(
      result.comment,
    );
    expect(countEvents({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("gets an existing and missing comment without emitting events", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const comment = context.repositories.comments.create({
      id: "comment_action_get" as SituId<"comment">,
      target: {
        targetKind: "project",
        targetId: "project_comment_target" as SituId<"project">,
      },
      bodyMarkdown: "Project note",
      author: {
        actorKind: "local_agent",
        actorId: "agent-1",
      },
      now: "2026-05-13T12:00:00.000Z",
    });

    expect(getCommentAction({ context, id: comment.id })).toEqual(comment);
    expect(
      getCommentAction({
        context,
        id: "comment_missing" as SituId<"comment">,
      }),
    ).toBeUndefined();
    expect(countEvents({ database })).toBe(0);
  } finally {
    database.close();
  }
});

test("lists comments for a target", () => {
  const database = openAppDatabase({ databasePath: memoryDatabasePath });

  try {
    const context = createAppActionContext({ database });
    const target = {
      targetKind: "task",
      targetId: "task_comment_list" as SituId<"task">,
    } as const;
    const first = context.repositories.comments.create({
      id: "comment_action_list_first" as SituId<"comment">,
      target,
      bodyMarkdown: "First",
      author: {
        actorKind: "human",
        actorId: "scott",
      },
      now: "2026-05-13T12:00:00.000Z",
    });
    const second = context.repositories.comments.create({
      id: "comment_action_list_second" as SituId<"comment">,
      target,
      bodyMarkdown: "Second",
      author: {
        actorKind: "local_agent",
        actorId: "agent-1",
      },
      now: "2026-05-13T12:01:00.000Z",
    });
    context.repositories.comments.create({
      id: "comment_action_list_other" as SituId<"comment">,
      target: {
        targetKind: "experiment",
        targetId: "experiment_comment_list" as SituId<"experiment">,
      },
      bodyMarkdown: "Other",
      author: {
        actorKind: "system",
        actorId: "situ",
      },
      now: "2026-05-13T12:02:00.000Z",
    });

    expect(
      listCommentsAction({
        context,
        target,
      }),
    ).toEqual([first, second]);
    expect(countEvents({ database })).toBe(0);
  } finally {
    database.close();
  }
});
