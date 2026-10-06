import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { readFile, mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  command,
  request,
  save,
  json,
  home,
  type Credentials,
} from "../cli/connection.js";
import { capture } from "./capture.js";
export async function inspectRun(directory: string) {
  const receipt = await json(join(directory, "receipt.json"));
  let lab;
  try {
    lab = JSON.parse(
      execFileSync(
        "uv",
        [
          "run",
          "--locked",
          "--project",
          receipt.lab,
          "lab",
          "external-status",
          join(directory, "lab"),
        ],
        {
          encoding: "utf8",
          maxBuffer: 4 * 1024 * 1024,
          env: { ...process.env, PYTHONPATH: "" },
        },
      ),
    );
  } catch (e: any) {
    lab = {
      error:
        "Lab status unavailable; inspect receipt and locks before recovery",
    };
  }
  return { receipt, lab };
}
async function evidence(directory: string, names: string[]) {
  const artifacts = [];
  for (const name of names) {
    const path = join(directory, name);
    let bytes;
    try {
      bytes = await readFile(path);
    } catch (e: any) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    artifacts.push({
      uri: pathToFileURL(path).href,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      title: name,
      mediaType: name.endsWith(".json") ? "application/json" : "text/plain",
    });
  }
  return artifacts;
}
async function deliver(
  directory: string,
  receipt: any,
  c: Credentials,
  runnerToken: string,
) {
  const artifacts = await evidence(directory, [
    "receipt.json",
    "source.json",
    "stdout.log",
    "stderr.log",
    "lab/receipt.json",
    "lab/command.log",
  ]);
  await command(
    "job.progress",
    {
      jobId: receipt.jobId,
      runnerToken,
      status: receipt.state,
      evidence: artifacts,
      note: `Lab execution: ${receipt.state}; exit ${receipt.exitCode ?? "unknown"}`,
    },
    c,
  );
  return artifacts;
}
export async function recoverRun(directory: string) {
  const receipt = await json(join(directory, "receipt.json")),
    reporter = await json(join(directory, "reporter.json"));
  if (receipt.state === "prepared")
    throw new Error(
      "Launch outcome was not recorded. Inspect the saved job.register command and Lab directory before recovery.",
    );
  const result = JSON.parse(
    execFileSync(
      "uv",
      [
        "run",
        "--locked",
        "--project",
        receipt.lab,
        "lab",
        "external-recover",
        join(directory, "lab"),
      ],
      {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, PYTHONPATH: "" },
      },
    ),
  );
  const state =
    result.receipt.outcome === "completed"
      ? "succeeded"
      : result.receipt.outcome === "interrupted"
        ? "cancelled"
        : "failed";
  const next = ["succeeded", "failed", "cancelled"].includes(receipt.state)
    ? receipt
    : {
        ...receipt,
        state,
        exitCode: result.receipt.exit_code ?? 1,
        recoveredAt: Date.now(),
      };
  if (next !== receipt) await save(join(directory, "receipt.json"), next);
  const job = await request(`/v1/jobs/${receipt.jobId}`, reporter);
  if (["running", "unknown"].includes(job.status))
    await deliver(directory, next, reporter, reporter.runnerToken);
  return { directory, receipt: next, lab: result };
}
export async function run(
  c: Credentials,
  workId: string,
  argv: string[],
  cwd: string,
  lab: string | undefined,
  timeout: number,
) {
  if (!argv.length || !lab || !Number.isFinite(timeout) || timeout <= 0)
    throw new Error(
      "situ run WORK --lab LAB_CHECKOUT --cwd SOURCE --timeout SECONDS -- COMMAND ARGS. The execution budget is explicit; it is not a research deadline.",
    );
  lab = resolve(lab);
  await stat(join(lab, "pyproject.toml"));
  const { work } = await request(`/v1/work/${workId}`, c);
  const jobId = "j-" + randomUUID(),
    directory = join(home, "runs", jobId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const source = join(directory, "source");
  await capture(cwd, source);
  const receiptPath = join(directory, "receipt.json");
  let receipt: any = {
    jobId,
    workId,
    generation: work.generation,
    planRevision: work.planRevision,
    command: argv,
    cwd: source,
    originalSource: cwd,
    lab,
    timeout,
    state: "prepared",
    startedAt: Date.now(),
  };
  await save(receiptPath, receipt);
  const job = await command(
    "job.register",
    {
      workId,
      generation: work.generation,
      jobId,
      command: argv,
      cwd: source,
      receiptPath,
    },
    c,
  );
  await save(join(directory, "reporter.json"), {
    ...c,
    runnerToken: job.runnerToken,
  });
  const child = spawn(
    "uv",
    [
      "run",
      "--locked",
      "--project",
      lab,
      "lab",
      "exec",
      "--attempt",
      join(directory, "lab"),
      "--owner",
      jobId,
      "--timeout",
      String(timeout),
      "--cwd",
      source,
      "--",
      ...argv,
    ],
    {
      cwd: lab,
      env: { ...process.env, PYTHONPATH: "" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let failure: string | undefined;
  const completion = new Promise<number>((resolve) => {
    child.once("error", (e) => {
      failure = e.message;
      resolve(127);
    });
    child.once("exit", (code) => resolve(code ?? 1));
  });
  const stdout = createWriteStream(join(directory, "stdout.log")),
    stderr = createWriteStream(join(directory, "stderr.log"));
  child.stdout?.pipe(stdout);
  child.stderr?.pipe(stderr);
  receipt = { ...receipt, state: "running", pid: child.pid };
  await save(receiptPath, receipt);
  let stopping = false,
    done = false,
    busy = false;
  const kill = () => {
    stopping = true;
    child.kill("SIGTERM");
  };
  const pulse = async () => {
    if (busy || done) return;
    busy = true;
    try {
      const result = await command(
        "job.progress",
        {
          jobId,
          runnerToken: job.runnerToken,
          status: "running",
          note: "Lab supervisor remains active",
        },
        c,
      );
      if (result.stop) kill();
    } catch (e: any) {
      console.error(`Runner reporting pending: ${e.message}`);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(pulse, 30000);
  process.on("SIGTERM", kill);
  process.on("SIGINT", kill);
  const exitCode = await completion;
  done = true;
  clearInterval(timer);
  process.off("SIGTERM", kill);
  process.off("SIGINT", kill);
  while (busy) await new Promise((r) => setTimeout(r, 10));
  await Promise.all([
    new Promise<void>((r) => stdout.end(r)),
    new Promise<void>((r) => stderr.end(r)),
  ]);
  let labReceipt;
  try {
    labReceipt = await json(join(directory, "lab", "receipt.json"));
  } catch {}
  const terminal =
    labReceipt &&
    ["completed", "failed", "timeout", "interrupted"].includes(
      labReceipt.outcome,
    ) &&
    !labReceipt.cleanup_error;
  receipt = {
    ...receipt,
    state: terminal
      ? stopping
        ? "cancelled"
        : labReceipt.outcome === "completed"
          ? "succeeded"
          : "failed"
      : "unknown",
    exitCode,
    failure,
    finishedAt: Date.now(),
  };
  await save(receiptPath, receipt);
  let artifacts;
  try {
    artifacts = await deliver(directory, receipt, c, job.runnerToken);
  } catch (e: any) {
    console.error(e.message);
  }
  console.log(
    JSON.stringify({ directory, receipt, evidence: artifacts }, null, 2),
  );
  process.exitCode = exitCode;
}
