import { cp, mkdir, writeFile, stat } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { runtime, save, json, request } from "./connection.js";
import { signature } from "./operations.js";
const here = dirname(fileURLToPath(import.meta.url));
export const root = here.endsWith("/dist")
  ? resolve(here, "..")
  : resolve(here, "../..");
export async function serve(port: number) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Use a port from 1024 through 65535");
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  const lock = join(runtime, "serve.lock");
  try {
    await mkdir(lock);
  } catch {
    let owner;
    try {
      owner = await json(join(lock, "owner.json"));
    } catch {
      throw new Error(
        `Incomplete runtime lock: ${lock}. Inspect before removing it.`,
      );
    }
    let alive = true;
    try {
      process.kill(owner.pid, 0);
    } catch {
      alive = false;
    }
    if (alive) throw new Error(`Runtime is owned by PID ${owner.pid}`);
    throw new Error(
      `Stale runtime lock: ${lock}. Inspect the old celld process and remove this lock explicitly after it exits.`,
    );
  }
  await save(join(lock, "owner.json"), {
    pid: process.pid,
    port,
    startedAt: Date.now(),
  });
  const { rm } = await import("node:fs/promises");
  try {
    let keys;
    try {
      keys = await json(join(runtime, "keys.json"));
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      keys = {
        admin: randomUUID() + randomUUID(),
        join: randomUUID() + randomUUID(),
      };
      await save(join(runtime, "keys.json"), keys);
    }
    const lookup = spawnSync("mise", ["which", "celld"], {
      cwd: root,
      encoding: "utf8",
    });
    const binary =
      process.env.SITU_CELLD ??
      (lookup.status === 0 ? lookup.stdout.trim() : "celld");
    const version = spawnSync(binary, ["--version"], { encoding: "utf8" });
    if (!/^celld 0\.6\.1(?:\s|$)/m.test(version.stdout ?? ""))
      throw new Error(
        "Situ requires celld 0.6.1. Run mise install in the repository.",
      );
    await stat(join(root, "dist", "worker.js"));
    await cp(join(root, "dist", "worker.js"), join(runtime, "worker.js"));
    await cp(join(root, "dist", "public"), join(runtime, "public"), {
      recursive: true,
    });
    await save(join(runtime, "wrangler.json"), {
      name: "situ-v2",
      main: "worker.js",
      no_bundle: true,
      compatibility_date: "2026-09-28",
      durable_objects: {
        bindings: [{ name: "WORKSPACE", class_name: "Workspace" }],
      },
      migrations: [{ tag: "v1", new_sqlite_classes: ["Workspace"] }],
      r2_buckets: [{ binding: "EVIDENCE", bucket_name: "situ-evidence" }],
      assets: {
        directory: "public",
        binding: "ASSETS",
        not_found_handling: "single-page-application",
        run_worker_first: true,
      },
    });
    await writeFile(
      join(runtime, ".dev.vars"),
      `ADMIN_TOKEN=${keys.admin}\nJOIN_TOKEN=${keys.join}\n`,
      { mode: 0o600 },
    );
    const child = spawn(
      binary,
      [
        "dev",
        runtime,
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--no-watch",
        "--logs",
      ],
      { stdio: "inherit" },
    );
    await save(join(runtime, "process.json"), {
      launcher: process.pid,
      celld: child.pid,
      launcherSignature: signature(process.pid),
      celldSignature: child.pid ? signature(child.pid) : "",
      port,
      runtime,
      startedAt: Date.now(),
    });
    const stop = (signal: NodeJS.Signals) => child.kill(signal);
    const onTerm = () => stop("SIGTERM"),
      onInt = () => stop("SIGINT");
    process.on("SIGTERM", onTerm);
    process.on("SIGINT", onInt);
    let exited = false;
    const exit = new Promise<number>((resolve, reject) => {
      child.once("exit", (code) => {
        exited = true;
        resolve(code ?? 1);
      });
      child.once("error", reject);
    });
    for (let n = 0; n < 100 && !exited; n++) {
      try {
        const endpoint = `http://127.0.0.1:${port}`;
        const status = await request("/v1/status", {
          endpoint,
          workspaceId: "",
          token: keys.admin,
        });
        await request("/v1/projects?limit=1", {
          endpoint,
          workspaceId: status.workspaceId,
          token: keys.admin,
        });
        await save(join(runtime, "admin.json"), {
          endpoint,
          workspaceId: status.workspaceId,
          token: keys.admin,
        });
        await save(join(runtime, "join.json"), {
          endpoint,
          workspaceId: status.workspaceId,
          token: keys.join,
        });
        console.error(`Situ ready: ${endpoint}`);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    process.exitCode = await exit;
    process.off("SIGTERM", onTerm);
    process.off("SIGINT", onInt);
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
