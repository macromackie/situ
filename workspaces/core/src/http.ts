export async function requestJson<T>(
  url: string | URL,
  init?: RequestInit,
): Promise<T> {
  let failure: Error = new Error("Request did not complete");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(15000),
      });
      const text = await response.text();
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        if (response.ok) throw new Error("Server returned invalid JSON");
        value = { error: { message: text || `HTTP ${response.status}` } };
      }
      if (response.ok) return value as T;
      const error = (
        value as { error?: { message?: string; requestId?: string } }
      ).error;
      const message = `${error?.message ?? `HTTP ${response.status}`}${error?.requestId ? ` (request ${error.requestId})` : ""}`;
      failure = new Error(message);
      if (![429, 502, 503, 504].includes(response.status))
        throw new HttpError(response.status, message);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      failure = error as Error;
    }
    if (attempt < 4)
      await new Promise((resolve) =>
        setTimeout(resolve, 100 * 2 ** attempt + Math.random() * 100),
      );
  }
  throw failure;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
