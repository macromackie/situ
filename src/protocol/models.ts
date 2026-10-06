import type { Evidence, Policy } from "./commands.js";
export interface Entity {
  id: string;
  kind: string;
  projectId: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  author: string;
  [key: string]: any;
}
export interface Session extends Entity {
  name: string;
  roles: string[];
  lastSeen: number;
  left: boolean;
  tokenHash: string;
}
export interface Project extends Entity {
  title: string;
  goal: string;
  focus: string;
  brief: string;
  policy: Policy;
  policyRevision: number;
  sources: string[];
}
export interface Work extends Entity {
  topicId: string;
  title: string;
  state: string;
  owner: string | null;
  generation: number;
  leaseUntil: number;
  planRevision: number;
  plan: Record<string, string>;
  evidence: Evidence[];
  next: string;
}
export interface Failure {
  code: string;
  message: string;
  details?: unknown;
}
export class Fault extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function requireThat(
  condition: unknown,
  code: string,
  message: string,
  status = 409,
): asserts condition {
  if (!condition) throw new Fault(code, message, status);
}
export async function digest(value: string): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}

export function mergeEvidence(...groups: Evidence[][]): Evidence[] {
  return [
    ...new Map(groups.flat().map((e) => [e.uri + "#" + e.sha256, e])).values(),
  ];
}
