#!/usr/bin/env node
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { commandSchemas } from "../protocol/commands.js";
import {
  home,
  runtime,
  json,
  save,
  credentials,
  request,
  command,
  retry,
} from "./connection.js";
import { serve } from "./serve.js";
import { supervise } from "../agent/bridge.js";
import { run, inspectRun, recoverRun } from "../integrations/lab.js";
import { stop, backup, restore, artifact } from "./operations.js";
const help = `Situ — durable research coordination\n
  situ serve [--port 4317]           Local celld 0.6.1 service
  situ stop                         Stop the verified local service process
  situ backup DIRECTORY             Snapshot a stopped service and client state
  situ restore BACKUP --cwd NEW_HOME Restore to a new directory, preserving identity
  situ artifact FILE [--name TITLE]  Hash a local evidence file
  situ status                       Workspace and service identity
  situ schema [COMMAND]             Exact JSON input schemas
  situ project create --file X --admin
  situ join-resume SESSION_FILE     Recover an interrupted join without a new identity
  situ join PROJECT --name NAME      Create a worker session; export SITU_SESSION
  situ next [--wait]                 Due requests, owned work, ready work
  situ inbox [--cursor CURSOR]       Unresolved requests, including deferred
  situ show ID                      Work, topic, project, post, review, or job
  situ list projects|topics|work|sessions|reviews|jobs [--project ID]
  situ events [--after SEQ]          Durable changes; poll at a checkpoint
  situ post TOPIC --file TEXT        Post an observation (no automatic wake)
  situ ask SESSION --topic ID --file TEXT
  situ subscribe TOPIC [--off]
  situ work propose --file PLAN
  situ work start ID                 Claim admitted work or take over an expired claim
  situ work checkpoint ID --file X   Record evidence and the next step
  situ work finish ID --file X       Save a result; independent review is separate
  situ work handoff ID --file X
  situ work admit ID --file X        Coordinator admission
  situ review submit --file X
  situ review decide ID --file X
  situ inbox read|resolve|defer ID --file X
  situ command TYPE --file JSON [--admin]  All writes use one validated API
  situ retry COMMAND_ID             Retry the exact saved intent
  situ heartbeat | leave            Explicit session lifecycle
  situ agent -- COMMAND ARGS        Supervise a real process; checkpoint-pull inbox
  situ run WORK --lab LAB --cwd DIR --timeout SECONDS -- COMMAND ARGS
                                      Captured execution through Lab admission
  situ run-recover DIRECTORY        Reconcile Lab locks; never relaunch
  situ run-status DIRECTORY         Inspect runner receipt and evidence

Run situ schema COMMAND before unfamiliar writes. Each worker has its own SITU_SESSION.
--admin uses the local bootstrap credential; grant coordinator/reviewer roles explicitly.
No command launches a model, spends on a provider, or submits to a leaderboard.\n`;
function print(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}
async function main() {
  const split = process.argv.indexOf("--");
  const passthrough = split < 0 ? [] : process.argv.slice(split + 1);
  const args = parseArgs({
    args: process.argv.slice(2, split < 0 ? undefined : split),
    allowPositionals: true,
    options: {
      admin: { type: "boolean" },
      file: { type: "string" },
      name: { type: "string" },
      project: { type: "string" },
      topic: { type: "string" },
      port: { type: "string" },
      wait: { type: "boolean" },
      off: { type: "boolean" },
      after: { type: "string" },
      cursor: { type: "string" },
      cwd: { type: "string" },
      lab: { type: "string" },
      timeout: { type: "string" },
      help: { type: "boolean" },
    },
  });
  const [verb, sub, id] = args.positionals,
    o = args.values;
  if (!verb || o.help || verb === "help") {
    console.log(help);
    return;
  }
  if (verb === "stop") {
    print(await stop());
    return;
  }
  if (verb === "backup") {
    if (!sub) throw new Error("Specify a destination");
    print(await backup(sub));
    return;
  }
  if (verb === "restore") {
    if (!sub || !o.cwd) throw new Error("situ restore BACKUP --cwd NEW_HOME");
    print(await restore(sub, o.cwd));
    return;
  }
  if (verb === "artifact") {
    print(await artifact(sub, o.name));
    return;
  }
  if (verb === "serve") {
    await serve(Number(o.port ?? 4317));
    return;
  }
  if (verb === "schema") {
    const schemas = commandSchemas();
    print(sub ? schemas[sub] : schemas);
    return;
  }
  if (verb === "status") {
    print(await request("/v1/status"));
    return;
  }
  if (verb === "join-resume") {
    const pending = await json(resolve(sub));
    const bootstrap = await json(join(runtime, "join.json"));
    const session = await retry(pending.joinCommand, bootstrap);
    await save(resolve(sub), { ...pending, sessionId: session.id });
    print({ session, sessionFile: resolve(sub) });
    return;
  }
  if (verb === "join") {
    if (!sub || !o.name) throw new Error("situ join PROJECT --name NAME");
    const c = await json(join(runtime, "join.json"));
    const token = randomUUID() + randomUUID();
    const intentId = randomUUID();
    const path = join(
      home,
      "client",
      c.workspaceId,
      "sessions",
      intentId + ".json",
    );
    const pending = { ...c, token, projectId: sub, joinCommand: intentId };
    await save(path, pending);
    let session;
    try {
      session = await command(
        "session.join",
        { projectId: sub, name: o.name, token },
        c,
        intentId,
      );
    } catch (e: any) {
      e.message += `\nRecover this join with: situ join-resume '${path}'`;
      throw e;
    }
    await save(path, { ...pending, sessionId: session.id });
    print({
      session,
      sessionFile: path,
      instruction: `export SITU_SESSION='${path}'`,
    });
    return;
  }
  if (verb === "run-recover") {
    print(await recoverRun(resolve(sub)));
    return;
  }
  if (verb === "run-status") {
    print(await inspectRun(resolve(sub)));
    return;
  }
  const c = await credentials(!!o.admin);
  const data = async () => (o.file ? json(resolve(o.file)) : {});
  if (verb === "agent") {
    await supervise(c, passthrough);
    return;
  }
  if (verb === "run") {
    await run(
      c,
      sub,
      passthrough,
      resolve(o.cwd ?? process.cwd()),
      o.lab ?? process.env.SITU_LAB,
      Number(o.timeout),
    );
    return;
  }
  if (verb === "heartbeat" || verb === "leave") {
    print(await command("session." + verb, {}, c));
    return;
  }
  if (verb === "retry") {
    print(await retry(sub, c));
    return;
  }
  if (verb === "command") {
    print(await command(sub, await data(), c));
    return;
  }
  if (verb === "next") {
    do {
      const result = await request("/v1/me/next", c);
      if (
        !o.wait ||
        result.obligations.length ||
        result.ready.length ||
        result.reviews.length ||
        result.proposals.length
      ) {
        print(result);
        return;
      }
      await command("session.heartbeat", {}, c);
      await new Promise((r) => setTimeout(r, 3000));
    } while (true);
  }
  if (verb === "events") {
    print(
      await request(
        `/v1/events?project=${encodeURIComponent(o.project ?? c.projectId ?? "")}&after=${o.after ?? 0}`,
        c,
      ),
    );
    return;
  }
  if (verb === "list") {
    const project = o.project ?? c.projectId;
    if (sub !== "projects" && !project) throw new Error("Specify --project");
    print(
      await request(
        (sub === "projects"
          ? "/v1/projects"
          : `/v1/projects/${project}/${sub}`) +
          `?cursor=${encodeURIComponent(o.cursor ?? "")}`,
        c,
      ),
    );
    return;
  }
  if (verb === "show") {
    const kind =
      (
        {
          w: "work",
          t: "topics",
          p: "posts",
          r: "reviews",
          j: "jobs",
        } as Record<string, string>
      )[sub?.split("-")[0]] ?? "projects";
    print(await request(`/v1/${kind}/${sub}`, c));
    return;
  }
  if (verb === "inbox" && !sub) {
    print(
      await request(
        "/v1/me/inbox?cursor=" + encodeURIComponent(o.cursor ?? ""),
        c,
      ),
    );
    return;
  }
  if (verb === "subscribe") {
    print(await command("subscribe", { topicId: sub, enabled: !o.off }, c));
    return;
  }
  if (verb === "post" || verb === "ask") {
    if (!o.file) throw new Error("--file TEXT is required");
    const body = await readFile(resolve(o.file), "utf8");
    print(
      await command(
        verb === "post" ? "post.create" : "request.create",
        verb === "post"
          ? { topicId: sub, body }
          : { topicId: o.topic, recipient: sub, body },
        c,
      ),
    );
    return;
  }
  if (
    ["project", "topic", "work", "review", "inbox", "session", "job"].includes(
      verb,
    )
  ) {
    let input = await data();
    if (id) {
      const field = verb === "inbox" ? "id" : `${verb}Id`;
      input = { ...input, [field]: id };
      if (verb === "work") {
        const { work } = await request(`/v1/work/${id}`, c);
        if (["start", "admit", "cancel", "revise"].includes(sub))
          input.expectedRevision ??= work.revision;
        if (["checkpoint", "finish", "handoff", "revise"].includes(sub))
          input.generation ??= work.generation;
        if (sub === "checkpoint") input.planRevision ??= work.planRevision;
      }
      if (verb === "review" && sub === "decide")
        input.expectedRevision ??= (
          await request(`/v1/reviews/${id}`, c)
        ).revision;
      if (verb === "inbox" && sub === "read") input = { ids: [id] };
    }
    print(await command(`${verb}.${sub}`, input, c));
    return;
  }
  throw new Error(`Unknown command: ${verb}. Run situ help.`);
}
main().catch((e) => {
  console.error(
    JSON.stringify(
      {
        error: {
          code: e.code ?? "client_error",
          message: e.message,
          details: e.details,
        },
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
