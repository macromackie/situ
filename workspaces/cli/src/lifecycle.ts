import { createServer } from "node:net";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export async function assertPortAvailable(port: number) {
  await new Promise<void>((accept, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(
        new Error(
          `Port ${port} is in use. Stop the existing service or choose SITU_PORT.`,
        ),
      ),
    );
    probe.listen(port, "127.0.0.1", () =>
      probe.close((error) => (error ? reject(error) : accept())),
    );
  });
}

export function claimDirectory(directory: string) {
  const path = resolve(directory, "launcher.pid");
  try {
    const previous = Number(readFileSync(path, "utf8"));
    if (!Number.isInteger(previous) || previous < 1)
      throw new Error(
        `Invalid launcher PID at ${path}; inspect it before starting.`,
      );
    try {
      process.kill(previous, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      unlinkSync(path);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    writeFileSync(path, String(process.pid), { flag: "wx", mode: 0o600 });
  } catch {
    throw new Error(
      `Situ already owns ${directory}. Stop that launcher before starting another.`,
    );
  }
  process.on("exit", () => {
    if (readFileSync(path, "utf8") === String(process.pid)) unlinkSync(path);
  });
}
