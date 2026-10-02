import { useSyncExternalStore } from "react";
import { requestJson, type Change, type Snapshot } from "../../core/src/index";

type State = {
  snapshot: Snapshot | null;
  connection: "connecting" | "live" | "offline";
  error: string;
};
let state: State = {
  snapshot: null,
  connection: "connecting",
  error: "",
};
const listeners = new Set<() => void>();
function publish(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}
export function useResearch() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
  );
}
export function request<T>(path: string, init?: RequestInit): Promise<T> {
  return requestJson<T>(path, init);
}
export async function command(value: object) {
  return request<Change>("/api/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}
function apply(change: Change) {
  const snapshot = state.snapshot!;
  if (change.cursor <= snapshot.cursor) return;
  const records = [...snapshot.records];
  const projects = [...snapshot.projects];
  if (change.record) {
    const index = records.findIndex(
      (record) => record.id === change.record!.id,
    );
    if (index >= 0) records[index] = change.record;
    else records.push(change.record);
  }
  if (
    change.project &&
    !projects.some((project) => project.id === change.project!.id)
  )
    projects.push(change.project);
  publish({
    snapshot: {
      ...snapshot,
      cursor: change.cursor,
      records,
      projects,
      samples: [...snapshot.samples, ...(change.samples ?? [])].slice(-5000),
      sampleCount: snapshot.sampleCount + (change.samples?.length ?? 0),
    },
  });
}
let busy = false;
let pending = false;
let needsSnapshot = true;
let socketConnected = false;
async function sync() {
  pending = true;
  if (busy) return;
  busy = true;
  try {
    while (pending) {
      pending = false;
      if (needsSnapshot || !state.snapshot) {
        needsSnapshot = false;
        publish({
          snapshot: await request<Snapshot>("/api/snapshot"),
          error: "",
        });
      }
      let more = true;
      while (more) {
        const result = await request<{ changes: Change[]; cursor: number }>(
          `/api/changes?after=${state.snapshot!.cursor}`,
        );
        for (const change of result.changes) apply(change);
        more = result.changes.length === 100;
      }
      publish({
        error: "",
        connection: socketConnected ? "live" : state.connection,
      });
    }
  } catch (error) {
    publish({ error: String(error), connection: "offline" });
  } finally {
    busy = false;
  }
}
let started = false;
export function connect() {
  if (started) return;
  started = true;
  let delay = 500;
  function open() {
    const url = new URL("/api/live", location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url);
    let heartbeat: ReturnType<typeof setInterval>;
    socket.onopen = () => {
      delay = 500;
      needsSnapshot = true;
      socketConnected = true;
      publish({ connection: "live" });
      void sync();
      heartbeat = setInterval(() => socket.send("catch-up"), 15000);
    };
    socket.onmessage = () => {
      void sync();
    };
    socket.onclose = () => {
      socketConnected = false;
      clearInterval(heartbeat);
      publish({ connection: "offline" });
      setTimeout(open, delay);
      delay = Math.min(delay * 2, 8000);
    };
    socket.onerror = () => socket.close();
  }
  void sync();
  open();
}
