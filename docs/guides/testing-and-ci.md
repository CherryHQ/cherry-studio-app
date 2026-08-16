# Testing And CI

This guide defines the focused development loop, test-value rules, local pull request gates, and
the remote CI boundary.

## Test The Owned Behavior

- Put a test at the lowest layer that owns the behavior. Prefer pure functions and hooks over
  reasserting the same behavior through a screen.
- A test must fail when its protected behavior regresses and remain stable across unrelated
  implementation changes.
- Do not write tests whose only claim is that a wrapper forwards props, a component renders without
  throwing, or an implementation collaborator was called.
- A mock interaction is valid when the interaction itself is the observable contract, such as a
  transaction boundary, request shape, callback order, cancellation, subscription, or cleanup.
- Do not add screen-level render suites. Exercise screen workflows on a device with `agent-device`;
  test their pure logic and hooks directly.
- Always cover database schemas and migrations, serialized contracts, upstream patch guards, and a
  regression that reproduces a bug being fixed.
- Remove a test only when it protects no behavior. If a valuable test is slow, change how it runs.

## Focused Development Loop

Format and lint only the files being changed:

```bash
pnpm exec oxfmt --no-error-on-unmatched-pattern <files...>
pnpm exec oxlint <files...>
pnpm exec expo lint <files...>
```

Run every fixed suite that protects the changed behavior, including relevant suites whose files were
not edited:

```bash
pnpm test:app -- path/to/file.test.ts --runInBand
pnpm --filter @cherrystudio/ai-runtime test src/path/to/file.test.ts
```

Use the owning package filter for `ai-core`, `ai-runtime`, `ai-sdk-provider`, and
`provider-registry`. Jest owns app tests; package scripts select their package test runner.

Run only the specialized contract checks triggered by the change. Examples include
`pnpm docs:check-links`, `pnpm skills:check`, `pnpm design:check`, database migration checks, and
desktop synchronization guards.

## Before Creating A Draft PR

Run these full local gates on the final local head:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
```

Also rerun the behavior-related fixed suites and specialized checks selected above. Do not run the
full local `pnpm test`; the complete suite belongs to remote PR CI.

## Ready For Review

Pull requests start as drafts. If the draft changed after its local gates, rerun the gates on the
final head before marking it ready. The existing GitHub workflow runs the complete tests, typecheck,
lint, format check, package build, and documentation link check only after the PR is ready.

A PR is merge-ready only after its remote checks pass.
