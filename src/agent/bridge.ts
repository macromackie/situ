import { spawn } from "node:child_process";
import { command, request, type Credentials } from "../cli/connection.js";
export async function supervise(c: Credentials, argv: string[]) {
  if (!argv.length) throw new Error("situ agent -- COMMAND ARGS");
  const child = spawn(argv[0], argv.slice(1), {
    stdio: "inherit",
    env: { ...process.env, SITU_SESSION: process.env.SITU_SESSION },
  });
  const completion = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  let alive = true,
    busy = false;
  const pulse = async () => {
    if (!alive || busy) return;
    busy = true;
    try {
      await command("session.heartbeat", {}, c);
      const next = await request("/v1/me/next", c);
      const urgent = next.obligations.filter((i: any) => i.kind === "stop");
      if (urgent.length)
        console.error(
          JSON.stringify({
            situ: { checkpointRequired: true, stopRequests: urgent },
          }),
        );
    } catch (e: any) {
      console.error(`Situ bridge: ${e.message}`);
    } finally {
      busy = false;
    }
  };
  await pulse();
  const timer = setInterval(pulse, 30000);
  const term = () => child.kill("SIGTERM"),
    int = () => child.kill("SIGINT");
  process.on("SIGTERM", term);
  process.on("SIGINT", int);
  try {
    process.exitCode = await completion;
  } finally {
    alive = false;
    clearInterval(timer);
    while (busy) await new Promise((r) => setTimeout(r, 10));
    process.off("SIGTERM", term);
    process.off("SIGINT", int);
    await command("session.leave", {}, c).catch((e) =>
      console.error(`Could not record leave: ${e.message}`),
    );
  }
}
