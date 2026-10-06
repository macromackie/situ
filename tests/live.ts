import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile, cp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { randomUUID, createHash } from "node:crypto";
const home = await mkdtemp(join(tmpdir(), "situ-live-"));
const sock = createServer();
await new Promise<void>((r) => sock.listen(0, "127.0.0.1", r));
const port = (sock.address() as any).port;
await new Promise<void>((r) => sock.close(() => r()));
const base = `http://127.0.0.1:${port}`;
let processHandle: ReturnType<typeof spawn> | undefined;
let output = "";
async function start() {
  processHandle = spawn(
    process.execPath,
    ["dist/situ.mjs", "serve", "--port", String(port)],
    {
      cwd: resolve("."),
      env: { ...process.env, SITU_HOME: home, SITU_URL: base },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  processHandle.stdout!.on("data", (x) => (output += x));
  processHandle.stderr!.on("data", (x) => (output += x));
  for (let n = 0; n < 150; n++) {
    if (processHandle.exitCode !== null) throw new Error(output);
    try {
      await readFile(join(home, "runtime", "admin.json"));
      const r = await fetch(base + "/v1/status");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Startup timed out\n" + output);
}
async function cli(args: string[]) {
  const child = spawn(process.execPath, ["dist/situ.mjs", ...args], {
    env: { ...process.env, SITU_HOME: home, SITU_URL: base },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "",
    err = "";
  child.stdout!.on("data", (x) => (out += x));
  child.stderr!.on("data", (x) => (err += x));
  const code = await new Promise((r) => child.once("exit", r));
  assert.equal(code, 0, err);
  return JSON.parse(out);
}
async function stop() {
  if (!processHandle || processHandle.exitCode !== null) return;
  const exited = new Promise((r) => processHandle!.once("exit", r));
  processHandle.kill("SIGTERM");
  await exited;
}
let admin: any, status: any;
async function api(path: string, token?: string, body?: any) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const v = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(JSON.stringify(v)), { status: r.status });
  return v;
}
async function command(
  type: string,
  input: any,
  token = admin.token,
  id = randomUUID(),
) {
  return (
    await api("/v1/commands", token, {
      id,
      workspaceId: status.workspaceId,
      type,
      input,
    })
  ).result;
}
try {
  await start();
  admin = JSON.parse(
    await readFile(join(home, "runtime", "admin.json"), "utf8"),
  );
  status = await api("/v1/status");
  await command("project.create", {
    id: "live",
    title: "Live proof",
    goal: "Verify persistence and concurrency",
    focus: "One small experiment",
  });
  const sessions = await Promise.all(
    Array.from({ length: 30 }, async (_, i) => {
      const token = randomUUID() + randomUUID();
      return {
        ...(await command("session.join", {
          projectId: "live",
          name: "worker-" + i,
          token,
        })),
        token,
      };
    }),
  );
  const topic = await command(
    "topic.create",
    {
      projectId: "live",
      title: "Restart proof",
      brief: "Are exact retries durable?",
    },
    sessions[0].token,
  );
  const commandId = randomUUID(),
    body = { topicId: topic.id, body: "Before restart" };
  const post = await command("post.create", body, sessions[0].token, commandId);
  const data = {
    schema: "situ.dataset.v1",
    metric: "success",
    unit: "fraction",
    direction: "higher",
    cohortId: "live-v1",
    evaluatorVersion: "eval1",
    environmentVersion: "env1",
    series: [
      {
        id: "baseline",
        label: "Baseline",
        seed: "1",
        values: [
          { scenario: "corridor", value: 0.5, n: 20, lower: 0.3, upper: 0.7 },
        ],
      },
    ],
  };
  const file = join(home, "observations.json");
  await writeFile(file, JSON.stringify(data));
  const asset = await cli([
    "asset",
    "upload",
    file,
    "--project",
    "live",
    "--admin",
  ]);
  const repeatedAsset = await cli([
    "asset",
    "upload",
    file,
    "--project",
    "live",
    "--admin",
  ]);
  assert.equal(repeatedAsset.id, asset.id);
  assert.deepEqual(await api("/v1/assets/" + asset.id), data);
  const bytes = await readFile(file);
  const range = await fetch(base + "/v1/assets/" + asset.id, {
    headers: { Range: "bytes=0-9" },
  });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), bytes.subarray(0, 10).toString());
  assert.equal(
    (
      await fetch(base + "/v1/assets/" + asset.id, {
        headers: { Range: "bytes=999999-" },
      })
    ).status,
    416,
  );
  const badUpload = await fetch(base + "/v1/assets", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + admin.token,
      "X-Situ-Asset": encodeURIComponent(
        JSON.stringify({
          projectId: "live",
          title: "Wrong hash",
          mediaType: "application/json",
          sha256: createHash("sha256").update("different").digest("hex"),
        }),
      ),
    },
    body: bytes,
  });
  assert.equal(badUpload.status, 400);
  const captured = await cli(["publication", "capture", "live", "--admin"]);
  const source = {
    snapshotId: captured.id,
    recordId: asset.id,
    relationship: "supports",
  };
  const publication = {
    schemaVersion: 1,
    pages: [
      {
        id: "now",
        template: "overview",
        title: "Live proof account",
        summary: {
          text: "Synthetic observations demonstrate durable publication.",
          sources: [source],
        },
        sections: [
          {
            id: "evidence",
            blocks: [{ id: "chart", kind: "figure", figureId: "comparison" }],
          },
        ],
      },
    ],
    updates: [],
    figures: [
      {
        id: "comparison",
        kind: "comparison",
        title: "Synthetic comparison",
        caption: "Test fixture only.",
        sources: [source],
        assetIds: [asset.id],
        baseline: "baseline",
      },
    ],
  };
  const draftFile = join(home, "draft.json");
  await writeFile(
    draftFile,
    JSON.stringify({
      projectId: "live",
      snapshotId: captured.id,
      expectedRevision: captured.draftRevision,
      baseRelease: 0,
      document: publication,
    }),
  );
  const saved = await cli([
    "publication",
    "save",
    "--file",
    draftFile,
    "--admin",
  ]);
  assert.deepEqual(
    (await cli(["publication", "validate", "live", "--admin"])).issues,
    [],
  );
  await cli([
    "publication",
    "publish",
    "live",
    "--expected-revision",
    String(saved.revision),
    "--expected-release",
    "0",
    "--admin",
  ]);
  assert.equal((await cli(["brief", "live", "--admin"])).release, 1);
  await stop();
  await cli(["backup", home + "-snapshot"]);
  await cli(["restore", home + "-snapshot", "--cwd", home + "-restored"]);
  await cp(join(home + "-restored", "runtime"), join(home, "backup"), {
    recursive: true,
  });
  await start();
  assert.equal((await api("/v1/status")).workspaceId, status.workspaceId);
  assert.equal(
    (await api("/v1/publication/projects/live")).release.revision,
    1,
  );
  assert.deepEqual(await api("/v1/assets/" + asset.id), data);
  assert.equal(
    (await command("post.create", body, sessions[0].token, commandId)).id,
    post.id,
  );
  const inbox = await api("/v1/me/next", sessions[0].token);
  assert.equal(inbox.capabilities.autonomousWake, false);
  if (process.env.SITU_LAB) {
    const plan = {
      question: "Does the frozen probe run?",
      prediction: "The probe prints 4",
      test: "Execute the captured local source through Lab",
      falsifier: "Nonzero exit or a different output",
      next: "Read the receipt",
      source: "local probe",
      budget: "One CPU, 30 seconds",
    };
    let w = await command(
      "work.propose",
      { topicId: topic.id, title: "Lab execution proof", plan },
      sessions[0].token,
    );
    w = await command("work.admit", {
      workId: w.id,
      expectedRevision: w.revision,
      reason: "A bounded acceptance probe",
    });
    w = await command(
      "work.start",
      { workId: w.id, expectedRevision: w.revision },
      sessions[0].token,
    );
    const source = join(home, "probe");
    await mkdir(source);
    await writeFile(join(source, "probe.cjs"), "console.log(2+2);\n");
    const sessionFile = join(home, "probe-session.json");
    await writeFile(
      sessionFile,
      JSON.stringify({
        endpoint: base,
        workspaceId: status.workspaceId,
        token: sessions[0].token,
        sessionId: sessions[0].id,
        projectId: "live",
      }),
    );
    const runner = spawn(
      process.execPath,
      [
        "dist/situ.mjs",
        "run",
        w.id,
        "--lab",
        process.env.SITU_LAB,
        "--cwd",
        source,
        "--timeout",
        "30",
        "--",
        process.execPath,
        "probe.cjs",
      ],
      {
        env: {
          ...process.env,
          SITU_HOME: home,
          SITU_SESSION: sessionFile,
          SITU_URL: base,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let runOutput = "",
      errors = "";
    runner.stdout!.on("data", (x) => (runOutput += x));
    runner.stderr!.on("data", (x) => (errors += x));
    const exitCode = await new Promise((r) => runner.once("exit", r));
    assert.equal(exitCode, 0, errors);
    const receipt = JSON.parse(runOutput);
    assert.equal(receipt.receipt.state, "succeeded");
    assert.equal(
      (
        await readFile(join(receipt.directory, "lab", "command.log"), "utf8")
      ).trim(),
      "4",
    );
    const finishedJob = await api("/v1/jobs/" + receipt.receipt.jobId);
    assert.equal(finishedJob.status, "succeeded");
    assert(finishedJob.evidence.length >= 4);
    const cancelRunner = spawn(
      process.execPath,
      [
        "dist/situ.mjs",
        "run",
        w.id,
        "--lab",
        process.env.SITU_LAB,
        "--cwd",
        source,
        "--timeout",
        "45",
        "--",
        process.execPath,
        "-e",
        "setInterval(()=>{},1000)",
      ],
      {
        env: {
          ...process.env,
          SITU_HOME: home,
          SITU_SESSION: sessionFile,
          SITU_URL: base,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let cancelOutput = "",
      cancelError = "";
    cancelRunner.stdout!.on("data", (x) => (cancelOutput += x));
    cancelRunner.stderr!.on("data", (x) => (cancelError += x));
    const cancelledExit = new Promise((r) => cancelRunner.once("exit", r));
    let cancellationJob: any;
    for (let n = 0; n < 100; n++) {
      const state = await api("/v1/work/" + w.id);
      cancellationJob = state.jobs.find((j: any) => j.status === "running");
      if (cancellationJob) {
        await command("work.cancel", {
          workId: w.id,
          expectedRevision: state.work.revision,
          reason: "Verify cancellation reaches the actual Lab process",
        });
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    assert(cancellationJob, "The cancellation probe did not register");
    await cancelledExit;
    assert(cancelOutput, cancelError);
    const cancelled = JSON.parse(cancelOutput);
    assert.equal(cancelled.receipt.state, "cancelled", cancelError);
    const labReceipt = JSON.parse(
      await readFile(join(cancelled.directory, "lab", "receipt.json"), "utf8"),
    );
    assert.equal(labReceipt.outcome, "interrupted");
    if (labReceipt.command_pid) {
      let alive = true;
      try {
        process.kill(labReceipt.command_pid, 0);
      } catch {
        alive = false;
      }
      assert.equal(alive, false, "Cancelled process must exit");
    }
    console.log(
      "Live cancellation: coordinator stop reached Lab and its command process exited.",
    );
    const bridge = spawn(
      process.execPath,
      [
        "dist/situ.mjs",
        "agent",
        "--",
        process.execPath,
        "-e",
        "process.exit(0)",
      ],
      {
        env: {
          ...process.env,
          SITU_HOME: home,
          SITU_SESSION: sessionFile,
          SITU_URL: base,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let bridgeErrors = "";
    bridge.stderr!.on("data", (x) => (bridgeErrors += x));
    assert.equal(
      await new Promise((r) => bridge.once("exit", r)),
      0,
      bridgeErrors,
    );
    const sessionsAfter = await api("/v1/projects/live/sessions");
    assert.equal(
      sessionsAfter.items.find((s: any) => s.id === sessions[0].id).left,
      true,
    );
    console.log(
      "Live Lab: captured source, shared admission, durable receipt, hashed evidence, and supervised session exit passed.",
    );
  }
  const page = await fetch(base + "/");
  assert.equal(page.status, 200);
  assert((await page.text()).includes("/app.js"));
  const denied = await fetch(base + "/v1/projects", {
    headers: { Origin: "https://unrelated.example" },
  });
  assert.equal(denied.status, 403);
  await stop();
  await rm(join(home, "runtime"), { recursive: true });
  await cp(join(home, "backup"), join(home, "runtime"), { recursive: true });
  await start();
  assert.equal(
    (await api("/v1/publication/projects/live")).release.revision,
    1,
  );
  assert.deepEqual(await api("/v1/assets/" + asset.id), data);
  assert.equal(
    (await api("/v1/topics/" + topic.id + "/posts")).items[0].id,
    post.id,
  );
  console.log(
    "Live celld 0.6.1: 30 sessions, publication CLI, hashed R2 assets, range reads, restart, exact retry, origin check, and snapshot restore passed.",
  );
} finally {
  await stop();
  await rm(home, { recursive: true, force: true });
  await rm(home + "-snapshot", { recursive: true, force: true });
  await rm(home + "-restored", { recursive: true, force: true });
}
