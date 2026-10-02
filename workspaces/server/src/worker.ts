import { ZodError } from "zod";
import { commandSchema, contextBrief, DomainError } from "../../core/src/index";
import { ResearchStore } from "./store";

interface Env {
  RESEARCH: DurableObjectNamespace;
  ASSETS: Fetcher;
}
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
function cursorParam(url: URL) {
  const cursor = Number(url.searchParams.get("after") ?? "0");
  if (!Number.isSafeInteger(cursor) || cursor < 0)
    throw new DomainError(400, "Invalid cursor");
  return cursor;
}

export class Research {
  private store: ResearchStore;
  constructor(private ctx: DurableObjectState) {
    this.store = new ResearchStore(
      (sql, ...bindings) => ctx.storage.sql.exec(sql, ...bindings).toArray(),
      (work) => ctx.storage.transactionSync(work),
    );
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const started = Date.now();
    let status = 200;
    try {
      if (request.method === "GET" && url.pathname === "/api/live") {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
          throw new DomainError(426, "WebSocket required");
        const pair = new WebSocketPair();
        this.ctx.acceptWebSocket(pair[1]);
        pair[1].send(JSON.stringify({ cursor: this.store.cursor() }));
        status = 101;
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      if (request.method === "GET" && url.pathname === "/api/snapshot")
        return json(this.store.snapshot());
      if (request.method === "GET" && url.pathname === "/api/health")
        return json({
          ok: true,
          cursor: this.store.cursor(),
          clients: this.ctx.getWebSockets().length,
        });
      if (request.method === "GET" && url.pathname === "/api/changes") {
        const changes = this.store.changes(
          cursorParam(url),
          url.searchParams.get("record") ?? undefined,
        );
        return json({ changes, cursor: this.store.cursor() });
      }
      if (request.method === "GET" && url.pathname === "/api/context")
        return json(
          contextBrief(
            this.store.snapshot(),
            url.searchParams.get("project") ?? "",
            url.searchParams.get("q") ?? "",
          ),
        );
      if (
        request.method === "GET" &&
        url.pathname.startsWith("/api/records/")
      ) {
        const id = decodeURIComponent(
          url.pathname.slice("/api/records/".length),
        );
        const revision = url.searchParams.has("revision")
          ? Number(url.searchParams.get("revision"))
          : undefined;
        if (
          revision !== undefined &&
          (!Number.isSafeInteger(revision) || revision < 1)
        )
          throw new DomainError(400, "Invalid revision");
        return json(this.store.record(id, revision));
      }
      if (request.method === "GET" && url.pathname === "/api/samples")
        return json({
          samples: this.store.samples(
            url.searchParams.get("record") ?? "",
            cursorParam(url),
          ),
        });
      if (request.method !== "POST" || url.pathname !== "/api/commands")
        throw new DomainError(404, "Route not found");
      const body = await request.text();
      if (body.length > 1_000_000)
        throw new DomainError(413, "Command exceeds 1 MB");
      let value: unknown;
      try {
        value = JSON.parse(body);
      } catch {
        throw new DomainError(400, "Invalid JSON");
      }
      const command = commandSchema.parse(value);
      const change = this.store.apply(command);
      const cursor = this.store.cursor();
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(JSON.stringify({ cursor }));
        } catch {
          socket.close(1011, "Reconnect to catch up");
        }
      }
      return json(change);
    } catch (error) {
      if (error instanceof DomainError) status = error.status;
      else if (error instanceof ZodError) status = 422;
      else status = 500;
      if (status === 500)
        console.error(
          JSON.stringify({
            event: "request.error",
            requestId,
            error: String(error),
          }),
        );
      const message =
        status === 500
          ? "Internal error; see server log with requestId"
          : (error as Error).message;
      return json({ error: { message, requestId } }, status);
    } finally {
      console.log(
        JSON.stringify({
          event: "request",
          requestId,
          method: request.method,
          path: url.pathname,
          status,
          durationMs: Date.now() - started,
        }),
      );
    }
  }
  webSocketMessage(socket: WebSocket) {
    socket.send(JSON.stringify({ cursor: this.store.cursor() }));
  }
  webSocketClose(socket: WebSocket, code: number) {
    socket.close(code, "Closed");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
      return json({ error: { message: "Local host required" } }, 403);
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin)
      return json({ error: { message: "Same origin required" } }, 403);
    if (url.pathname.startsWith("/api/"))
      return env.RESEARCH.get(env.RESEARCH.idFromName("workspace")).fetch(
        request,
      );
    return env.ASSETS.fetch(request);
  },
};
