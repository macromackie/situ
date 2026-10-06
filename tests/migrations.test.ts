import test from "node:test";
import assert from "node:assert/strict";
import { Database } from "../src/server/database.js";
import { fixture } from "./helpers.js";

test("publication migration preserves workspace identity, research and exact command receipts", async () => {
  const f = fixture();
  try {
    const topic = await f.init();
    const workspace = f.service.workspaceId;
    const post = await f.call(
      "post.create",
      { topicId: topic.id, body: "Preserve this observation" },
      undefined,
      "before-migration",
    );
    for (const table of [
      "publication_drafts",
      "publication_releases",
      "publication_sources",
      "assets",
    ])
      f.db.storage.query(`DROP TABLE ${table}`);
    f.db.storage.query("UPDATE metadata SET value='1' WHERE key='schema'");
    new Database(f.db.storage);
    assert.equal(f.db.meta("schema"), "2");
    assert.equal(f.db.meta("workspace"), workspace);
    assert.equal(f.db.get(post.id).body, "Preserve this observation");
    assert.equal(
      (
        await f.call(
          "post.create",
          { topicId: topic.id, body: "Preserve this observation" },
          undefined,
          "before-migration",
        )
      ).id,
      post.id,
    );
    new Database(f.db.storage);
    assert.equal(f.db.meta("workspace"), workspace);
  } finally {
    f.close();
  }
});
