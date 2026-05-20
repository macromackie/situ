# Repository Scripts

This directory is reserved for small root-level wrappers around project
commands. Project-owned behavior should stay in `projects/app/`,
`projects/e2e-tests/`, or `projects/evals/`.

`scripts/check.sh` is a compatibility wrapper for tooling that expects a shell
script. The canonical full local gate is `mise run check`.
