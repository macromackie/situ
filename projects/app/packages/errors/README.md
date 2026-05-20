# errors

Support package for structured application errors.

Exports the shared application error contract from ADR 0009:

- stable `ErrorKind` values
- `BaseError` and concrete subclasses for expected failures
- `isBaseError` for type narrowing
- `serializeError` for CLI, HTTP, and other process boundaries
