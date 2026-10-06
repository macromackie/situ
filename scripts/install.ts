import { chmod, symlink, rename, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
const target = join(homedir(), ".local/bin/situ");
await mkdir(join(homedir(), ".local/bin"), { recursive: true });
await chmod("dist/situ.mjs", 0o755);
await symlink(resolve("dist/situ.mjs"), target + ".new");
await rename(target + ".new", target);
console.log(`Installed ${target}`);
