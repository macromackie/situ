/**
 * Stable categories for application errors that callers may handle.
 */
export enum ErrorKind {
  Validation = "validation",
  NotFound = "not_found",
  Conflict = "conflict",
  External = "external",
  Internal = "internal",
}

/**
 * Additional structured context attached to an application error.
 */
export type ErrorDetails = Readonly<Record<string, unknown>>;

/**
 * Object argument accepted by concrete application error classes.
 */
export type ApplicationErrorInput = {
  readonly message: string;
  readonly details?: ErrorDetails;
};

/**
 * Serialized shape used when errors cross process or network boundaries.
 */
export type SerializedError = {
  readonly kind: ErrorKind;
  readonly message: string;
  readonly details: ErrorDetails;
};

type BaseErrorInput = ApplicationErrorInput & {
  readonly kind: ErrorKind;
  readonly name: string;
};

const defaultInternalErrorMessage = "An internal error occurred.";
const emptyDetails: ErrorDetails = Object.freeze({});

/**
 * Base class for expected, user-facing, or programmatically handled failures.
 */
export abstract class BaseError extends Error {
  readonly kind: ErrorKind;
  readonly details: ErrorDetails;

  protected constructor(input: BaseErrorInput) {
    super(input.message);

    this.name = input.name;
    this.kind = input.kind;
    this.details = input.details ?? emptyDetails;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Indicates caller-provided input failed validation.
 */
export class ValidationError extends BaseError {
  constructor(input: ApplicationErrorInput) {
    super({
      ...input,
      kind: ErrorKind.Validation,
      name: "ValidationError",
    });
  }
}

/**
 * Indicates a requested product record or resource does not exist.
 */
export class NotFoundError extends BaseError {
  constructor(input: ApplicationErrorInput) {
    super({
      ...input,
      kind: ErrorKind.NotFound,
      name: "NotFoundError",
    });
  }
}

/**
 * Indicates a request conflicts with existing state.
 */
export class ConflictError extends BaseError {
  constructor(input: ApplicationErrorInput) {
    super({
      ...input,
      kind: ErrorKind.Conflict,
      name: "ConflictError",
    });
  }
}

/**
 * Indicates an expected failure from an external command, service, or adapter.
 */
export class ExternalError extends BaseError {
  constructor(input: ApplicationErrorInput) {
    super({
      ...input,
      kind: ErrorKind.External,
      name: "ExternalError",
    });
  }
}

/**
 * Indicates an application failure that should not expose low-level details.
 */
export class InternalError extends BaseError {
  constructor(input: ApplicationErrorInput) {
    super({
      ...input,
      kind: ErrorKind.Internal,
      name: "InternalError",
    });
  }
}

/**
 * Returns true when a value is a structured Situ application error.
 */
export function isBaseError(value: unknown): value is BaseError {
  return value instanceof BaseError;
}

/**
 * Converts any thrown value to the stable serialized application error shape.
 */
export function serializeError(error: unknown): SerializedError {
  if (isBaseError(error)) {
    return {
      kind: error.kind,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      kind: ErrorKind.Internal,
      message: error.message || defaultInternalErrorMessage,
      details: emptyDetails,
    };
  }

  return {
    kind: ErrorKind.Internal,
    message: defaultInternalErrorMessage,
    details: emptyDetails,
  };
}

export const errorsPackageName = "errors" as const;
export type ErrorsPackageName = typeof errorsPackageName;
