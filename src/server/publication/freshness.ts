import type { Context } from "../context.js";
import type { Session } from "../../protocol/models.js";
import { latestSequence } from "./snapshots.js";

export function queueCuration(c: Context, project: string) {
  for (const session of c.db.list<Session>(project, "session")) {
    if (session.left || !session.roles.includes("curator")) continue;
    const row = c.db.storage.query(
      "SELECT id FROM inbox WHERE recipient=? AND project=? AND kind='curation' AND state='open'",
      session.id,
      project,
    )[0];
    const data = JSON.stringify({ through: latestSequence(c.db, project) });
    if (row)
      c.db.storage.query(
        "UPDATE inbox SET data=?,read_at=NULL WHERE id=?",
        data,
        row.id,
      );
    else
      c.notify(
        session.id,
        project,
        "curation",
        project,
        "Review new evidence and update the publication",
        JSON.parse(data),
      );
  }
}
