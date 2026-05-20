# Branching Normalizer Manifest

## Purpose

This workspace is intentionally small and composable. It gives each candidate a
separate improvement surface so the advanced eval can observe real branch
selection and cherry-pick behavior without relying on conflict-heavy edits.

## Files

- `normalizer.py`: applies the normalizer modules in a fixed order.
- `normalizers/casefold.py`: case and accent normalization surface.
- `normalizers/punctuation.py`: punctuation and separator normalization surface.
- `normalizers/numbers.py`: small number normalization surface.
- `normalizers/spacing.py`: whitespace normalization surface.
- `harness.py`: protected metric harness.
- `dev-cases.tsv`: protected dev cases used by the harness.
- `final-cases.tsv`: protected held-out cases used by the harness.
- `OBJECTIVE.md`: run contract for agents.
- `program.md`: shorter operating guide.

## Expected Situ Records

- One project for the copied repository.
- One active baseline for the unmodified checkout, with baseline measurements.
- At least three candidate tasks.
- At least three candidate experiments with branch names, worktree paths,
  assignments, and `baseRef` set to the initial workspace commit.
- One synthesis task.
- One synthesis experiment with `baseRef` set to a chosen candidate branch HEAD.
- Measurements for candidate and synthesis experiments.
- Events for creation and review-ready transitions.

## Expected Git Shape

```text
initial commit
  +-- candidate-1
  +-- candidate-2
  +-- candidate-3
  +-- candidate-4

chosen candidate HEAD
  +-- synthesis
        +-- cherry-pick -x from another candidate
        +-- cherry-pick -x from another candidate
```

Lineage lives in git commits and in the synthesis experiment's `baseRef`.
Situ records explain the human-facing intent.
