import { Database } from "./database.js";
import { Service } from "./service.js";
import { read } from "./reads.js";
import { commandSchemas } from "../protocol/commands.js";
import { Fault } from "../protocol/models.js";
interface Env {
  WORKSPACE: any;
  ASSETS: { fetch(r: Request): Promise<Response> };
  ADMIN_TOKEN: string;
  JOIN_TOKEN: string;
}
export class Workspace {
  service: Service;
  constructor(
    private ctx: any,
    private env: Env,
  ) {
    this.service = new Service(
      new Database({
        query: (sql, ...args) => ctx.storage.sql.exec(sql, ...args).toArray(),
        transaction: (fn) => ctx.storage.transactionSync(fn),
      }),
      { admin: env.ADMIN_TOKEN, join: env.JOIN_TOKEN },
    );
    ctx.blockConcurrencyWhile(async () => {
      this.service.tick();
      await this.arm();
    });
  }
  async arm() {
    const due = this.service.nextAlarm();
    if (due) await this.ctx.storage.setAlarm(due);
    else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    this.service.tick();
    await this.arm();
  }
  async fetch(request: Request) {
    try {
      const url = new URL(request.url);
      const token =
        request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
      if (request.method === "POST" && url.pathname === "/v1/commands") {
        const body = await request.text();
        if (body.length > 1024 * 1024)
          throw new Fault("too_large", "Command exceeds 1 MiB", 413);
        const result = await this.service.execute(JSON.parse(body), token);
        await this.arm();
        return Response.json(result);
      }
      if (request.method !== "GET")
        throw new Fault(
          "method_not_allowed",
          "Use GET for reads or POST /v1/commands",
          405,
        );
      if (url.pathname === "/v1/schema") return Response.json(commandSchemas());
      const actor =
        token && url.pathname !== "/v1/status"
          ? await this.service.actor(
              token,
              url.pathname.startsWith("/v1/commands/"),
            )
          : null;
      return Response.json(
        read(this.service, url.pathname, url.searchParams, actor),
      );
    } catch (e: any) {
      const validation = e.name === "ZodError" || e instanceof SyntaxError;
      const status = e instanceof Fault ? e.status : validation ? 400 : 500;
      if (status === 500) console.error(e);
      return Response.json(
        {
          error: {
            code:
              e instanceof Fault
                ? e.code
                : validation
                  ? "invalid_input"
                  : "internal_error",
            message:
              status === 500
                ? "Internal failure; inspect service logs"
                : e.message,
            details: e.details,
          },
        },
        { status },
      );
    }
  }
}
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
      return new Response("Loopback Host required", { status: 403 });
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin)
      return new Response("Same origin required", { status: 403 });
    if (url.pathname.startsWith("/api/"))
      return Response.json(
        {
          error: {
            code: "legacy_api",
            message:
              "This is Situ v2. The old data and API are archived; use /v1/schema and the new CLI.",
          },
        },
        { status: 410 },
      );
    if (url.pathname.startsWith("/v1/")) {
      const response = await env.WORKSPACE.get(
        env.WORKSPACE.idFromName("workspace"),
      ).fetch(request);
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(response.body, { status: response.status, headers });
    }
    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    headers.set("Cache-Control", "no-cache");
    return new Response(asset.body, { status: asset.status, headers });
  },
};
