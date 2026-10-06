import { execFileSync } from "node:child_process";
import {
  readdir,
  lstat,
  readFile,
  copyFile,
  mkdir,
  realpath,
} from "node:fs/promises";
import { join, dirname, resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { save } from "../cli/connection.js";
export async function capture(source: string, target: string) {
  source = await realpath(source);
  if (resolve(target).startsWith(source + "/"))
    throw new Error("Run storage must be outside the source being captured");
  let files: string[];
  try {
    files = execFileSync(
      "git",
      [
        "-C",
        source,
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
      ],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    )
      .split("\0")
      .filter(Boolean);
  } catch {
    files = [];
    async function walk(dir: string) {
      for (const item of await readdir(join(source, dir), {
        withFileTypes: true,
      })) {
        if (
          [
            ".git",
            ".venv",
            "node_modules",
            "__pycache__",
            ".celld",
            "dist",
          ].includes(item.name)
        )
          continue;
        const path = join(dir, item.name);
        if (item.isDirectory()) await walk(path);
        else files.push(path);
        if (files.length > 50000)
          throw new Error(
            "Capture exceeds 50,000 files; choose a smaller source directory",
          );
      }
    }
    await walk("");
  }
  const manifest: { path: string; sha256: string; bytes: number }[] = [];
  let total = 0;
  for (const file of [...new Set(files)].sort()) {
    if (file.startsWith("../") || file.startsWith("/"))
      throw new Error("Source path escapes capture");
    const path = join(source, file);
    let info;
    try {
      info = await lstat(path);
    } catch (e: any) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    if (info.isSymbolicLink())
      throw new Error(
        `Capture refuses a symlink: ${file}. Use a source tree with explicit files.`,
      );
    if (!info.isFile()) continue;
    total += info.size;
    if (total > 256 * 1024 * 1024)
      throw new Error(
        "Source exceeds 256 MiB; keep datasets and checkpoints as separate evidence inputs",
      );
    const bytes = await readFile(path);
    const dest = join(target, file);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(path, dest);
    const copied = await readFile(dest);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== createHash("sha256").update(copied).digest("hex"))
      throw new Error(`Source changed during capture: ${file}`);
    manifest.push({ path: file, sha256, bytes: bytes.length });
  }
  await mkdir(target, { recursive: true });
  await save(join(dirname(target), "source.json"), {
    source,
    files: manifest,
    sha256: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
  });
  return manifest;
}
