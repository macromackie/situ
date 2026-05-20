# worktrees

Adapter package for git worktree command descriptors, path containment, and
command environment filtering.

This package exports:

- `gitWorktreeCommand`, which returns a git worktree command descriptor without
  executing it.
- `resolveInsideRoot`, which lexically resolves a relative path inside an
  allowed root and rejects absolute or escaping paths.
- `filterCommandEnvironment`, which removes undefined values and likely secret
  environment variable names before a caller executes a command.

This package should not own product truth. Experiment records belong to
`@situ/experiments`, cross-primitive behavior belongs in app actions, and any
command execution runner must be defined outside this package.

`resolveInsideRoot` is lexical containment only. It normalizes strings with
Node path rules, rejects absolute or lexically escaping relative paths, and does
not read the filesystem, call `realpath`, create directories, or make an
untrusted destination path safe for writes. Filesystem write helpers must own
their own physical containment rules and tests instead of relying on this
adapter helper as their only protection.
