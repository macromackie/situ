import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
export const home =
  process.env.SITU_HOME ?? join(homedir(), ".local", "share", "situ-v2");
export const runtime = join(home, "runtime");
export interface Credentials {
  endpoint: string;
  workspaceId: string;
  token: string;
  sessionId?: string;
  projectId?: string;
}
export async function json<T = any>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8"));
}
export async function save(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = path + "." + randomUUID() + ".tmp";
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, path);
}
export function endpoint() {
  const value = process.env.SITU_URL ?? "http://127.0.0.1:4317";
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search
  )
    throw new Error("SITU_URL must be a loopback HTTP origin");
  return url.origin;
}
export async function request(
  path: string,
  credentials?: Credentials,
  body?: unknown,
): Promise<any> {
  const base = credentials?.endpoint ?? endpoint();
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(credentials ? { Authorization: `Bearer ${credentials.token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(result.error?.message ?? `HTTP ${response.status}`),
      {
        code: result.error?.code,
        status: response.status,
        details: result.error?.details,
      },
    );
  return result;
}
export async function credentials(admin = false): Promise<Credentials> {
  const path = admin ? join(runtime, "admin.json") : process.env.SITU_SESSION;
  if (!path)
    throw new Error(
      "Set SITU_SESSION to the file returned by situ join. Each agent uses its own file.",
    );
  const c = await json<Credentials>(path);
  if (process.env.SITU_URL && endpoint() !== c.endpoint)
    throw new Error("Session belongs to another endpoint");
  const status = await request("/v1/status", c);
  if (c.workspaceId !== status.workspaceId)
    throw new Error(
      "Workspace changed. Join the intended workspace; pending writes remain bound to the old one.",
    );
  return c;
}
export async function command(
  type: string,
  input: unknown,
  c: Credentials,
  id = randomUUID(),
) {
  const body = { id, workspaceId: c.workspaceId, type, input };
  const path = join(
    home,
    "client",
    c.workspaceId,
    "pending-writes",
    id + ".json",
  );
  const intent = {
    endpoint: c.endpoint,
    sessionId: c.sessionId ?? "admin",
    body,
  };
  await save(path, intent);
  try {
    const response = await request("/v1/commands", c, body);
    await save(path, { ...intent, response, delivered: true });
    return response.result;
  } catch (e: any) {
    await save(path, {
      ...intent,
      error: { code: e.code ?? "transport", message: e.message },
    });
    e.message += `\nSaved command ${id}. Retry with: situ retry ${id}`;
    throw e;
  }
}
export async function retry(id: string, c: Credentials) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid command ID");
  const path = join(
    home,
    "client",
    c.workspaceId,
    "pending-writes",
    id + ".json",
  );
  const intent = await json(path);
  if (
    intent.endpoint !== c.endpoint ||
    intent.sessionId !== (c.sessionId ?? "admin")
  )
    throw new Error("Pending write belongs to another endpoint or session");
  if (intent.delivered) return intent.response.result;
  const response = await request("/v1/commands", c, intent.body);
  await save(path, { ...intent, delivered: true, response });
  return response.result;
}
