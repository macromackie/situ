import { ErrorKind, NotFoundError, ValidationError, serializeError } from "@situ/errors";
import type { SerializedError } from "@situ/errors";

import { openAppDatabase } from "../db/index.js";
import {
  processReplicachePull,
  processReplicachePush,
  validateReplicachePullRequest,
  validateReplicachePushRequest,
} from "../sync/index.js";
import { handleClientGetRequest, isClientPath } from "./client-assets.js";

export type SituHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HandleSituHttpRequestInput = {
  readonly request: Request;
  readonly databasePath?: string;
  readonly environment?: NodeJS.ProcessEnv;
};

type SituHttpErrorOutput = {
  readonly error: SerializedError;
};

const jsonContentType = "application/json; charset=utf-8";
const healthPath = "/health";
const pullPath = "/replicache/pull";
const pushPath = "/replicache/push";
const healthMethods = ["GET"] satisfies readonly SituHttpMethod[];
const clientMethods = ["GET"] satisfies readonly SituHttpMethod[];
const pullMethods = ["POST"] satisfies readonly SituHttpMethod[];
const pushMethods = ["POST"] satisfies readonly SituHttpMethod[];

export async function handleSituHttpRequest(input: HandleSituHttpRequestInput): Promise<Response> {
  try {
    const url = new URL(input.request.url);

    if (url.pathname === healthPath) {
      return handleHealthRequest({ request: input.request });
    }

    if (isClientPath(url.pathname)) {
      return await handleClientRequest({
        request: input.request,
        pathname: url.pathname,
      });
    }

    if (url.pathname === pullPath) {
      return await handleReplicachePullRequest(input);
    }

    if (url.pathname === pushPath) {
      return await handleReplicachePushRequest(input);
    }

    return jsonErrorResponse({
      error: new NotFoundError({
        message: "HTTP route was not found.",
        details: { path: url.pathname },
      }),
    });
  } catch (error) {
    return jsonErrorResponse({ error });
  }
}

async function handleClientRequest(input: {
  readonly request: Request;
  readonly pathname: string;
}): Promise<Response> {
  if (input.request.method !== "GET") {
    return jsonErrorResponse({
      error: new ValidationError({
        message: "HTTP method is not supported for this path.",
        details: {
          method: input.request.method,
          path: input.pathname,
          allowedMethods: clientMethods,
        },
      }),
      headers: { Allow: clientMethods.join(", ") },
      status: 405,
    });
  }

  return await handleClientGetRequest({
    pathname: input.pathname,
  });
}

function handleHealthRequest(input: { readonly request: Request }): Response {
  if (input.request.method !== "GET") {
    return jsonErrorResponse({
      error: new ValidationError({
        message: "HTTP method is not supported for this path.",
        details: {
          method: input.request.method,
          path: healthPath,
          allowedMethods: healthMethods,
        },
      }),
      headers: { Allow: healthMethods.join(", ") },
      status: 405,
    });
  }

  return jsonResponse({
    ok: true,
  });
}

async function handleReplicachePullRequest(input: HandleSituHttpRequestInput): Promise<Response> {
  if (input.request.method !== "POST") {
    return jsonErrorResponse({
      error: new ValidationError({
        message: "HTTP method is not supported for this path.",
        details: {
          method: input.request.method,
          path: pullPath,
          allowedMethods: pullMethods,
        },
      }),
      headers: { Allow: pullMethods.join(", ") },
      status: 405,
    });
  }

  const pullRequest = validateReplicachePullRequest({
    value: await parseJsonRequestBody({ request: input.request }),
  });
  const database = openAppDatabase({
    databasePath: input.databasePath,
    environment: input.environment,
  });

  try {
    const result = processReplicachePull({
      database,
      pullRequest,
    });

    return jsonResponse(result);
  } finally {
    database.close();
  }
}

async function handleReplicachePushRequest(input: HandleSituHttpRequestInput): Promise<Response> {
  if (input.request.method !== "POST") {
    return jsonErrorResponse({
      error: new ValidationError({
        message: "HTTP method is not supported for this path.",
        details: {
          method: input.request.method,
          path: pushPath,
          allowedMethods: pushMethods,
        },
      }),
      headers: { Allow: pushMethods.join(", ") },
      status: 405,
    });
  }

  const pushRequest = validateReplicachePushRequest({
    value: await parseJsonRequestBody({ request: input.request }),
  });
  const database = openAppDatabase({
    databasePath: input.databasePath,
    environment: input.environment,
  });

  try {
    const result = processReplicachePush({
      database,
      pushRequest,
    });

    return jsonResponse(result);
  } finally {
    database.close();
  }
}

async function parseJsonRequestBody(input: { readonly request: Request }): Promise<unknown> {
  const contentType = input.request.headers.get("content-type");

  if (contentType === null || !contentType.toLowerCase().includes("application/json")) {
    throw new ValidationError({
      message: "Expected a JSON request body.",
      details: { header: "content-type" },
    });
  }

  try {
    return await input.request.json();
  } catch {
    throw new ValidationError({
      message: "Expected a valid JSON request body.",
      details: { body: "json" },
    });
  }
}

function jsonResponse(body: object, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", jsonContentType);

  return new Response(`${JSON.stringify(body)}\n`, {
    ...init,
    headers,
  });
}

function jsonErrorResponse(input: {
  readonly error: unknown;
  readonly headers?: HeadersInit;
  readonly status?: number;
}): Response {
  const serialized = serializeError(input.error);
  const body: SituHttpErrorOutput = { error: serialized };

  return jsonResponse(body, {
    headers: input.headers,
    status: input.status ?? httpStatusForError(serialized),
  });
}

function httpStatusForError(error: SerializedError): number {
  switch (error.kind) {
    case ErrorKind.Validation:
      return 400;
    case ErrorKind.NotFound:
      return 404;
    case ErrorKind.Conflict:
      return 409;
    case ErrorKind.External:
      return 502;
    case ErrorKind.Internal:
      return 500;
  }
}
