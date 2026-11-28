# Testing And CI

This guide defines the focused development loop, test-value rules, local pull request gates, and
the remote CI boundary.

Coding agents preparing application acceptance must also read
[Parallel Device Testing](./parallel-device-testing.md) for configuration preparation,
development-client reuse, and Conductor device isolation. That standard does not expand the user's
active authorization for checks, builds, device actions, or external calls. Preparation capabilities
marked as design must not be reported as implemented.

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

Use the owning package filter for `ai-runtime`. Jest owns app tests;
package scripts select their package test runner. The published AI and remote packages are
covered by their upstream suites; Mobile tests cover its adapters and consumed behavior.

Run only the specialized contract checks triggered by the change. Examples include
`pnpm docs:check-links`, `pnpm skills:check`, `pnpm design:check`, and database migration checks.

For translation or language changes, use `pnpm i18n:check` as described in
[Internationalization](./internationalization.md). PR CI runs the same read-only check;
`pnpm i18n:sync` is an explicit resource-editing step, not a test or translation service.

### Platform Component Families

Tests mirror the ownership boundary described in
[UI Components](../references/ui-components.md#component-family-anatomy):

- Shared public-component tests mock the extensionless private adapter and assert behavior owned by
  the shared shell.
- Adapter tests import the explicit `.ios` or `.android` file so the test does not depend on Jest's
  active platform resolution.
- Fallback tests load the exact extensionless file, including its source extension when necessary,
  so an iOS-default resolver cannot silently substitute the iOS adapter.
- Fallback assertions may use a dedicated `*-control.test.tsx` file or remain beside the shell test
  while a family is small, but they load the fallback explicitly and stay grouped by their owner.
- Provider SDKs are mocked only in adapter or fallback tests. Assertions target the shared contract
  mapping, not provider implementation details.

Run `pnpm ui:check-boundaries` when changing CherryUI exports, direct provider imports, or a private
platform adapter family.

## Before Creating A Draft PR

Run targeted unit tests covering the changed files and affected consumers (using `pnpm test:changed`
or explicit file paths such as `pnpm test:app -- path/to/file.test.ts --runInBand` and
`pnpm --filter @cherrystudio/ai-runtime test src/path/to/file.test.ts`), then run the incremental
static and typecheck gate matching PR CI:

```bash
pnpm check:changed
```

Use `pnpm check:plan` to inspect what `scripts/changedChecks.ts` selects against `main` (including
staged, unstaged, and untracked files). With `--no-tests` (used by `pnpm check:changed` and PR CI),
only incremental lint, format, scoped typecheck, and triggered specialized contract checks run. When
global configuration changes (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
`eslint.config.js`, `.oxfmtrc.json`, etc.), impacted static checks automatically promote to full.

Do not run the full local `pnpm test` unless explicitly requested; use `pnpm check:full` when you
want an explicit full local run. The local-only native fixture check described below still runs
explicitly when changing that native patch.

### After Changing Dependencies

Adding or removing a package makes pnpm rewrite the whole peer graph, which duplicates packages that
were previously shared. Two copies of `expo` is enough to break Jest on its own: the copy `jest-expo`
initializes defines `globalThis.expo`, so the other copy dials a non-existent dev server from
`Expo.fx`, and the native-module mocks in `jest.setup.ts` stop matching the paths suites resolve.

Collapse the duplicates before pushing, then rerun the gates:

```bash
pnpm dedupe
```

This is not a one-time cleanup — every dependency change re-splits the graph, so it belongs to the
same commit as the change itself.

## Ready For Review

Pull requests start as drafts. If the draft changed after its local gates, rerun your targeted tests
and `pnpm check:changed` on the final head before marking it ready.
[PR CI](../../.github/workflows/pr-ci.yml) shares `scripts/changedChecks.ts` with `--no-tests` for
non-draft PRs targeting `main`: it runs scoped typechecks, incremental lint/format, and triggered
specialized checks while skipping unit tests and bypassing `pnpm install` on workflow-only or
docs-only PRs. Add the `ci:full` label to a PR (or dispatch `pr-ci.yml` with `mode: full`) when
you want a full remote test run on that PR. A new push cancels the PR's previous run, and
[Cancel closed PR CI](../../.github/workflows/ci-cancel-closed-pr.yml) cancels unfinished PR CI runs
when a PR closes. The `CI` job succeeds only when planning succeeds and every planned `test`,
`typecheck`, and `lint` job reports success without unexpected skips; use `CI` as the required check
on `main`.

Full test coverage runs automatically outside ordinary PRs:

- [Release](../../.github/workflows/release.yml) calls `pr-ci.yml` with `mode: full` on every
  `v*.*.*` tag before building.
- [Nightly Full CI](../../.github/workflows/nightly-ci.yml) runs `pr-ci.yml` with `mode: full`
  every day at `17 18 * * *` UTC (02:17 Beijing time) and supports manual `workflow_dispatch`.

### Remote Coverage And Local Exceptions

- Root `pnpm test` runs the `ai-runtime` package suite, then root Jest.
- Provider registry schemas and catalog generation are tested upstream in the published package.
  Root Jest covers Mobile registry loading, compatibility projections, and consumed behavior.
- `scripts/__tests__/` suites are enabled in both `pnpm test:changed` and remote full CI runs
  (nightly, release tags, `ci:full`, and manual `workflow_dispatch`).
  `scripts/__tests__/patchReapplication.test.ts` remains temporarily excluded in `jest.config.js`
  because `virtualStoreDirMaxLength: 40` short-hashes `.pnpm` virtual-store directories and
  `patches/react-native-enriched-markdown@1.1.1.patch` has pre-existing `EventEmitters.cpp`
  reapplication findings tracked separately.
- `scripts/__tests__/enrichedMarkdownInputMeasurement.test.ts` guards the iOS input measurement
  patch; its native `.mm` regression requires an explicitly selected simulator as described in
  [Development](./development.md#enriched-markdown-patch).
- `skills:check` checks public skill entry points, whitelist files, and Claude symlinks.
  `docs:check-links` checks relative file links in project docs, the
  [Project Skills usage rules](../../.agents/skills/README.md), and public skill Markdown, including
  linked skill prerequisites. One exact optional upstream reference is exempted as documented in
  those usage rules; other missing links fail. The check does not validate Markdown anchors, remote
  URLs, or dependencies mentioned only as plain text. Declare required local skill dependencies as
  Markdown links in the project usage rules without editing upstream skill files.

A PR is merge-ready only after its remote checks pass.
