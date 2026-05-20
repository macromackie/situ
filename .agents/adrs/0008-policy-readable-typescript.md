---
status: active
category: policy
created: 2026-05-13
---

# 0008. Policy: Readable TypeScript

## Context

Situ should be easy for agents and humans to change in small slices. Code style
should reduce local reasoning load and make concepts searchable.

Mechanical tooling should enforce what it can. This ADR covers the conventions
that are better handled by review, examples, and future lint rules.

## Decision

Write TypeScript for clarity before cleverness.

Prefer many small files with focused functions over large files with many
unrelated functions.

Prefer explicit names, object arguments, guard clauses, and vertical space over
dense expressions.

## Function Shape

Prefer object arguments for exported functions and functions that take more
than one meaningful input:

```ts
export type CreateTaskInput = {
  readonly projectId: string;
  readonly title: string;
};

export function createTask(input: CreateTaskInput): Task {
  // ...
}
```

Small local helpers may use positional arguments when that is clearly simpler.

Prefer guard clauses over nested `if` statements.

Avoid nested ternaries. Avoid ternaries for non-trivial branches. Use a guard,
an explicit `if`, or a small immediately invoked function expression when an
expression value needs branching.

## Comments

Exported functions, exported classes, and non-obvious exported types should have
brief multiline doc comments:

```ts
/**
 * Creates a task record.
 */
export function createTask(input: CreateTaskInput): Task {
  // ...
}
```

Comments should describe intent, behavior, or domain meaning. Do not write
comments that merely repeat implementation details.

Package marker constants, obvious type aliases, and empty scaffold types do not
need comments until they carry domain behavior.

## Data And Libraries

Prefer Luxon for dates, times, and durations. Do not pass raw `Date` objects or
duration numbers across package boundaries when a Luxon type or ISO string
would communicate the contract more clearly.

Prefer Lodash for non-trivial collection operations when it improves
readability. Do not use Lodash to obscure simple built-in operations.

Prefer readonly data shapes at package boundaries.

## Formatting

Let Oxfmt own formatting.

Use blank lines to separate conceptual steps inside functions. Avoid dense
blocks where validation, transformation, persistence, and return construction
are visually glued together.

## Consequences

Existing and new code should gradually converge on this style as ADRs introduce
real behavior.

If a convention can be enforced mechanically, prefer adding a tool rule or
small policy check over relying only on prose.
