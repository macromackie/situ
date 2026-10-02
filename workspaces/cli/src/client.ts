import {
  commandSchema,
  requestJson,
  HttpError,
  type Change,
} from "../../core/src/index";
import { baseUrl } from "./paths";

export function get<T>(path: string): Promise<T> {
  return requestJson<T>(new URL(path, baseUrl));
}

export async function send(
  value: unknown,
  endpoint = baseUrl,
): Promise<Change> {
  const command = commandSchema.parse(value);
  try {
    return await requestJson<Change>(new URL("/api/commands", endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new Error(
      `Request ${command.requestId} has an uncertain outcome. Retry identical content and requestId. ${String(error)}`,
    );
  }
}
