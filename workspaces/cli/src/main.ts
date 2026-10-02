import { readFile } from "node:fs/promises";
import { commandSchema } from "../../core/src/index";
import { get, send } from "./client";

const [command = "help", ...args] = process.argv.slice(2);
try {
  let result: unknown;
  if (command === "command") {
    const text = await readFile(
      args[0] === "-" || !args[0] ? "/dev/stdin" : args[0],
      "utf8",
    );
    result = await send(JSON.parse(text));
  } else if (command === "snapshot" || command === "health")
    result = await get(`/api/${command}`);
  else if (command === "record")
    result = await get(`/api/records/${encodeURIComponent(args[0] ?? "")}`);
  else if (command === "context")
    result = await get(
      `/api/context?${new URLSearchParams({ project: args[0] ?? "", q: args.slice(1).join(" ") })}`,
    );
  else if (command === "changes")
    result = await get(
      `/api/changes?${new URLSearchParams({ after: args[0] ?? "0", ...(args[1] ? { record: args[1] } : {}) })}`,
    );
  else if (command === "schema") {
    const { z } = await import("zod");
    result = z.toJSONSchema(commandSchema);
  } else {
    console.log(
      "situ command <file.json|->   Submit a typed command (explicit requestId and actor)\nsitu snapshot                Read projects, records, and recent measurements\nsitu record <id>             Read a full record\nsitu context <project> [q]   Retrieve findings, related evidence, and active work\nsitu changes [cursor] [id]   Read durable changes, optionally for one record\nsitu schema                  Print the command JSON schema\nsitu health                  Inspect local service status\n\nSITU_URL defaults to http://127.0.0.1:4317. Use pnpm start to run the local service.",
    );
    process.exit(command === "help" ? 0 : 1);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
