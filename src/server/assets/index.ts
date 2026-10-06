import { assetInput, dataset, type Asset } from "../../protocol/artifacts.js";
import {
  canonical,
  digest,
  Fault,
  requireThat,
} from "../../protocol/models.js";
import { Context } from "../context.js";
import type { Service } from "../service.js";
import { queueCuration } from "../publication/index.js";

interface ObjectBody {
  body: ReadableStream;
  size: number;
}
export interface AssetBucket {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata: { contentType: string } },
  ): Promise<unknown>;
  get(
    key: string,
    options?: { range: { offset: number; length: number } },
  ): Promise<ObjectBody | null>;
}
const maxBytes = 32 * 1024 * 1024;
function mediaMatches(bytes: Uint8Array, type: string) {
  const text = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  if (type === "image/png") return bytes[0] === 137 && text(1, 4) === "PNG";
  if (type === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/webp")
    return text(0, 4) === "RIFF" && text(8, 12) === "WEBP";
  if (type === "video/mp4") return text(4, 8) === "ftyp";
  if (type === "video/webm")
    return bytes.slice(0, 4).join() === "26,69,223,163";
  return type === "application/json";
}
async function boundedBody(request: Request) {
  const reader = request.body?.getReader();
  requireThat(reader, "missing_body", "Upload a file", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Fault(
        "too_large",
        "Artifacts are limited to 32 MiB; export a shorter clip",
        413,
      );
    }
    chunks.push(part.value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}
export async function assets(
  request: Request,
  service: Service,
  bucket: AssetBucket,
  token: string,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === "/v1/assets") {
    const input = assetInput.parse(
      JSON.parse(decodeURIComponent(request.headers.get("x-situ-asset") ?? "")),
    );
    const actor = await service.actor(token);
    const c = new Context(service.db, actor, service.clock());
    c.project(input.projectId);
    c.role("worker", "reviewer", "curator", "coordinator");
    const bytes = await boundedBody(request);
    requireThat(
      mediaMatches(bytes, input.mediaType),
      "media_mismatch",
      "File signature does not match its media type",
      400,
    );
    const actualHash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    requireThat(
      actualHash === input.sha256,
      "hash_mismatch",
      "Uploaded bytes differ from the expected hash",
      400,
    );
    const id = `asset-${await digest(input.projectId + ":" + actualHash)}`;
    const value: Asset = {
      ...input,
      id,
      size: bytes.length,
      createdAt: c.now,
      author: c.actorId,
    };
    if (input.mediaType === "application/json") {
      requireThat(
        bytes.length <= 1024 * 1024,
        "too_large",
        "Dataset manifests are limited to 1 MiB",
        413,
      );
      value.dataset = dataset.parse(
        JSON.parse(new TextDecoder().decode(bytes)),
      );
    }
    if (input.replay)
      requireThat(
        input.mediaType.startsWith("video/"),
        "invalid_replay",
        "Replay metadata belongs to video",
        400,
      );
    const key = `${input.projectId}/${actualHash}`;
    await bucket.put(key, bytes.buffer, {
      httpMetadata: { contentType: input.mediaType },
    });
    const result = service.db.storage.transaction(() => {
      if (actor !== "admin") {
        c.actor = service.db.get(actor.id, "session");
        requireThat(!c.actor.left, "session_left", "Session has left", 401);
        c.role("worker", "reviewer", "curator", "coordinator");
      }
      const old = service.db.storage.query(
        "SELECT data FROM assets WHERE id=?",
        id,
      )[0];
      if (old) {
        const saved: Asset = JSON.parse(old.data);
        requireThat(
          saved.mediaType === input.mediaType &&
            canonical(saved.replay ?? null) === canonical(input.replay ?? null),
          "asset_conflict",
          "These bytes already have different media metadata",
        );
        return saved;
      }
      service.db.storage.query(
        "INSERT INTO assets VALUES(?,?,?)",
        id,
        input.projectId,
        JSON.stringify(value),
      );
      c.event(input.projectId, "asset.register", id, { title: input.title });
      queueCuration(c, input.projectId);
      return value;
    });
    return Response.json(result);
  }
  requireThat(
    request.method === "GET" || request.method === "HEAD",
    "method_not_allowed",
    "Use GET or POST for artifacts",
    405,
  );
  const id = url.pathname.split("/")[3];
  const row = service.db.storage.query(
    "SELECT data FROM assets WHERE id=?",
    id ?? "",
  )[0];
  requireThat(row, "not_found", "Artifact is not registered", 404);
  const value: Asset = JSON.parse(row.data);
  if (token)
    new Context(service.db, await service.actor(token), service.clock()).scope(
      value.projectId,
    );
  if (url.pathname.endsWith("/metadata")) return Response.json(value);
  const header = request.headers.get("range");
  let range: { offset: number; length: number } | undefined;
  if (header) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(header);
    if (!match || (!match[1] && !match[2]))
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${value.size}` },
      });
    const start = match[1]
      ? Number(match[1])
      : Math.max(0, value.size - Number(match[2]));
    const end =
      match[1] && match[2]
        ? Math.min(Number(match[2]), value.size - 1)
        : value.size - 1;
    if (
      start > end ||
      start >= value.size ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end)
    )
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${value.size}` },
      });
    range = { offset: start, length: end - start + 1 };
  }
  const object = await bucket.get(
    `${value.projectId}/${value.sha256}`,
    range ? { range } : undefined,
  );
  requireThat(
    object,
    "artifact_unavailable",
    "Artifact bytes are unavailable; restore the evidence object",
    404,
  );
  const headers = new Headers({
    "Content-Type": value.mediaType,
    "Content-Length": String(range?.length ?? value.size),
    "Accept-Ranges": "bytes",
    ETag: `"${value.sha256}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  if (range)
    headers.set(
      "Content-Range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${value.size}`,
    );
  return new Response(request.method === "HEAD" ? null : object.body, {
    status: range ? 206 : 200,
    headers,
  });
}
