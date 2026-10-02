import { spawn } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { root, stateDirectory } from "./paths";
import { assertPortAvailable, claimDirectory } from "./lifecycle";

const port = Number(process.env.SITU_PORT ?? 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("SITU_PORT must be a port from 1024 to 65535");
await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
await assertPortAvailable(port);
claimDirectory(stateDirectory);
await cp(resolve(root, "dist/worker.js"), resolve(stateDirectory, "worker.js"));
await rm(resolve(stateDirectory, "public"), { recursive: true, force: true });
await cp(resolve(root, "dist/web"), resolve(stateDirectory, "public"), {
  recursive: true,
});
await writeFile(
  resolve(stateDirectory, "wrangler.json"),
  JSON.stringify(
    {
      name: "situ",
      main: "worker.js",
      no_bundle: true,
      compatibility_date: "2026-09-28",
      durable_objects: {
        bindings: [{ name: "RESEARCH", class_name: "Research" }],
      },
      migrations: [{ tag: "v1", new_sqlite_classes: ["Research"] }],
      assets: {
        directory: "public",
        binding: "ASSETS",
        not_found_handling: "single-page-application",
        run_worker_first: true,
      },
    },
    null,
    2,
  ),
);
console.log(
  `Situ: http://127.0.0.1:${port}\nData: ${stateDirectory}\nStop with Ctrl-C. Data is preserved.`,
);
const child = spawn(
  "celld",
  [
    "dev",
    stateDirectory,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--no-watch",
    "--logs",
  ],
  { stdio: "inherit", detached: process.platform !== "win32" },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    if (!child.pid) return;
    if (process.platform === "win32") child.kill(signal);
    else {
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
  });
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
