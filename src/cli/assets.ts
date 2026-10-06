import { readFile, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { assetInput } from "../protocol/artifacts.js";
import { home, json, save, type Credentials } from "./connection.js";
async function readUpload(file: string) {
  if ((await stat(file)).size > 32 * 1024 * 1024)
    throw new Error("Artifacts are limited to 32 MiB; export a shorter clip");
  return readFile(file);
}
export async function assetCli(
  sub: string,
  file: string,
  options: Record<string, any>,
  c: Credentials,
) {
  let intent: any;
  if (sub === "retry") {
    if (!/^[a-f0-9]{64}$/.test(file))
      throw new Error("Specify the saved upload ID");
    intent = await json(
      join(home, "client", c.workspaceId, "uploads", file + ".json"),
    );
    if (
      intent.endpoint !== c.endpoint ||
      intent.sessionId !== (c.sessionId ?? "admin")
    )
      throw new Error("Upload belongs to another endpoint or session");
  } else if (sub === "upload") {
    const bytes = await readUpload(resolve(file));
    const mediaTypes: Record<string, string> = {
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
    };
    const input = assetInput.parse({
      projectId: options.project ?? c.projectId,
      title: options.name ?? basename(file),
      mediaType: mediaTypes[extname(file).toLowerCase()],
      ...(options.file ? await json(options.file) : {}),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    const id = createHash("sha256")
      .update(JSON.stringify([input, c.sessionId ?? "admin"]))
      .digest("hex");
    intent = {
      id,
      file: resolve(file),
      input,
      endpoint: c.endpoint,
      sessionId: c.sessionId ?? "admin",
    };
  } else throw new Error("Use asset upload FILE or asset retry ID");
  const path = join(
    home,
    "client",
    c.workspaceId,
    "uploads",
    intent.id + ".json",
  );
  await save(path, intent);
  const bytes = await readUpload(intent.file);
  if (createHash("sha256").update(bytes).digest("hex") !== intent.input.sha256)
    throw new Error(
      "File changed since this upload was saved; restore the original bytes before retrying",
    );
  try {
    const response = await fetch(c.endpoint + "/v1/assets", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + c.token,
        "X-Situ-Asset": encodeURIComponent(JSON.stringify(intent.input)),
      },
      body: bytes,
      signal: AbortSignal.timeout(120000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.error?.message ?? `Upload failed: ${response.status}`,
      );
    await save(path, { ...intent, delivered: true, result });
    console.log(JSON.stringify(result, null, 2));
  } catch (e: any) {
    e.message += `\nRetry the saved upload: situ asset retry ${intent.id}`;
    throw e;
  }
}
