import {
  cp,
  access,
  mkdir,
  readFile,
  readdir,
  stat,
  lstat,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, join, relative, basename } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { home, runtime, json, save } from "./connection.js";
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
export function signature(pid: number) {
  try {
    return execFileSync(
      "ps",
      ["-p", String(pid), "-o", "lstart=", "-o", "command="],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return "";
  }
}
export async function stop() {
  const p = await json(join(runtime, "process.json"));
  if (!alive(p.launcher))
    throw new Error(
      "Launcher is gone. Inspect the recorded celld PID and runtime lock before backup or restart.",
    );
  if (!p.launcherSignature || signature(p.launcher) !== p.launcherSignature)
    throw new Error(
      "Launcher identity does not match. No process was signalled.",
    );
  process.kill(p.launcher, "SIGTERM");
  for (let n = 0; n < 100; n++) {
    if (!alive(p.launcher) && !alive(p.celld))
      return { stopped: true, port: p.port };
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    "Service has not stopped after 10 seconds. Inspect process.json; no stronger signal was sent.",
  );
}
async function stopped() {
  try {
    await access(join(runtime, "serve.lock"));
    throw new Error(
      "Stop Situ before snapshotting. The runtime lock is still present.",
    );
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
  try {
    const p = await json(join(runtime, "process.json"));
    if (
      alive(p.celld) &&
      (!p.celldSignature || signature(p.celld) === p.celldSignature)
    )
      throw new Error(
        "celld is still running; stop it before copying database files.",
      );
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
}
async function inventory(root: string) {
  const files: { path: string; sha256: string; bytes: number }[] = [];
  async function walk(dir: string) {
    for (const item of await readdir(join(root, dir), {
      withFileTypes: true,
    })) {
      const path = join(dir, item.name);
      if (path === "snapshot.json") continue;
      if (item.isDirectory()) await walk(path);
      else if (item.isFile()) {
        const bytes = await readFile(join(root, path));
        files.push({
          path,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          bytes: bytes.length,
        });
      } else
        throw new Error(`Cannot snapshot a special file or symlink: ${path}`);
    }
  }
  await walk("");
  return files;
}
export async function backup(target: string) {
  await stopped();
  target = resolve(target);
  const source = resolve(home);
  if (target === source || target.startsWith(source + "/"))
    throw new Error("Keep backups outside SITU_HOME");
  await mkdir(target, { mode: 0o700 });
  for (const entry of await readdir(home))
    await cp(join(home, entry), join(target, entry), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  const files = await inventory(target);
  await save(join(target, "snapshot.json"), {
    version: 1,
    createdAt: Date.now(),
    source,
    files,
  });
  return { directory: target, files: files.length };
}
export async function restore(source: string, target: string) {
  source = resolve(source);
  target = resolve(target);
  if (target === source || target.startsWith(source + "/"))
    throw new Error("Restore into a separate empty directory");
  const manifest = await json(join(source, "snapshot.json"));
  if (manifest.version !== 1) throw new Error("Unsupported snapshot format");
  const actual = await inventory(source);
  if (
    JSON.stringify(actual.sort((a, b) => a.path.localeCompare(b.path))) !==
    JSON.stringify(
      manifest.files.sort((a: any, b: any) => a.path.localeCompare(b.path)),
    )
  )
    throw new Error("Snapshot contents do not match the manifest");
  await mkdir(target, { mode: 0o700 });
  for (const entry of await readdir(source))
    await cp(join(source, entry), join(target, entry), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  return {
    directory: target,
    instruction: `Set SITU_HOME=${target} before situ serve. Existing session files stay bound to their endpoint and workspace.`,
  };
}
export async function artifact(path: string, title?: string) {
  path = resolve(path);
  const info = await stat(path);
  if (!info.isFile()) throw new Error("Evidence must be a file");
  const bytes = await readFile(path);
  const ext = path.split(".").at(-1)!;
  const mediaType =
    (
      {
        json: "application/json",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webm: "video/webm",
        mp4: "video/mp4",
        txt: "text/plain",
        log: "text/plain",
      } as Record<string, string>
    )[ext] ?? "application/octet-stream";
  return {
    uri: pathToFileURL(path).href,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    title: title ?? basename(path),
    mediaType,
  };
}
