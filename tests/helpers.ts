import { DatabaseSync } from "node:sqlite";
import { Database } from "../src/server/database.js";
import { Service } from "../src/server/service.js";
import { randomUUID } from "node:crypto";
export const artifact = {
  uri: "file:///tmp/evidence.json",
  sha256: "a".repeat(64),
  title: "evaluation receipt",
};
export const plan = {
  question: "Does balancing examples help?",
  prediction: "Accuracy improves by 5 points",
  test: "Compare on the same held-out seeds",
  falsifier: "Paired accuracy does not improve",
  next: "Run the matched baseline",
  source: "git:abc123",
  budget: "One local CPU test, no remote spend",
};
export function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  const db = new Database({
    query: (sql, ...args) => sqlite.prepare(sql).all(...args) as any,
    transaction: (fn) => {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const result = fn();
        sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  });
  let now = 1000000;
  const service = new Service(
    db,
    { admin: "admin-secret", join: "join-secret" },
    () => now,
  );
  const call = async (
    type: string,
    input: any,
    token = "admin-secret",
    id: string = randomUUID(),
  ) =>
    (
      await service.execute(
        { id, workspaceId: service.workspaceId, type, input },
        token,
      )
    ).result;
  const join = async (name: string, roles = ["worker"], projectId = "p") => {
    const token = randomUUID() + randomUUID();
    const s = await call(
      "session.join",
      { projectId, name, token },
      "join-secret",
    );
    if (roles.join() !== "worker")
      await call("session.grant", { sessionId: s.id, roles });
    return { ...s, token };
  };
  const init = async () => {
    await call("project.create", {
      id: "p",
      title: "Test project",
      goal: "Grounded improvement",
      focus: "Baseline first",
      policy: { leaseSeconds: 60, checkInSeconds: 90, reflectionSeconds: 300 },
    });
    return call("topic.create", {
      projectId: "p",
      title: "Balanced examples",
      brief: "Is sampling the bottleneck?",
    });
  };
  const ready = async (t: any, owner: any) => {
    let w = await call(
      "work.propose",
      { topicId: t.id, title: "A paired test", plan },
      owner.token,
    );
    w = await call("work.admit", {
      workId: w.id,
      expectedRevision: w.revision,
      reason: "Within current focus",
    });
    return call(
      "work.start",
      { workId: w.id, expectedRevision: w.revision },
      owner.token,
    );
  };
  return {
    db,
    service,
    call,
    join,
    init,
    ready,
    advance: (ms: number) => (now += ms),
    close: () => sqlite.close(),
  };
}
