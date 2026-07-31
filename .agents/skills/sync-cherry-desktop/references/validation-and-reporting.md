# Validation And Reporting

## Audit Guarantees

Run the read-only repository audit before and after synchronization. Require valid mobile package identity `cherry-studio-app`, desktop identity `CherryStudio`, and shared package identities. Reject uncommitted or untracked files under selected desktop source paths without an override. Do not run desktop formatters, generators, installs, snapshot-writing tests, or edit commands.

Use Git-tracked files, sorted path-plus-content SHA-256, structured JSON, and TypeScript AST probes for table names, catalogs, registries, and routes. Keep JSON output deterministic and free of timestamps and machine-specific absolute paths. Treat current snapshots as observations, not baselines. Never let the audit write or silently update `desktop-sync-manifest.json`.

Require `--check` to fail for drift, an unbaselined or blocked domain, or any invariant failure. A reporting-only audit may exit successfully while describing drift. Before advancing a baseline manually, account for every desktop change with one approved classification and resolve every blocker in that domain.

## Focused Gates

Run checks for every touched contract. At minimum:

- Replay fresh and historical database migrations with foreign keys enabled; test schemas, relations, Data APIs, ordering, search, preferences, all MCP transports, opaque Agent/Knowledge data, and backup round trips.
- Run `pnpm test:ai-core` and `pnpm test:ai-sdk-provider`; verify exact file sets/hashes and test provider routing, request/response contracts, tools, streams, and platform adapters.
- Run `pnpm design:sync --desktop-root <path> --check`, `pnpm design:check`, icon catalog/routing tests, and scans for retired tokens/providers, `icons-png`, `IconPngSource`, and `packages/ui/src/**/*.png`.
- Add regression tests for every behavior adaptation and every previously undetected drift.

## Repository Gates

Run all gates after focused checks pass:

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" \
  .agents/skills/sync-cherry-desktop
pnpm skills:sync
pnpm skills:check
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test --runInBand
git diff --check
```

Review every rewritten or generated file. Attribute unrelated pre-existing changes instead of reverting them. Report any skipped command and its exact reason.

## Export And Visual Gates

When runtime, dependencies, native adapters, themes, icons, or bundle-sensitive code changes, run production exports:

```bash
pnpm exec expo export --platform ios --output-dir .context/expo-export-ios
pnpm exec expo export --platform android --output-dir .context/expo-export-android
```

Launch production-equivalent iPhone and Android builds. Inspect every affected view in light and dark mode, clear Metro and image caches when needed, and store screenshots under `.context/`. Check clipping, overlap, density, stale assets, routing, missing dark assets, and platform-only crashes. If a pure audit/Skill change does not affect runtime visuals, report export and device QA as not applicable instead of claiming they ran.

## Forward-Test The Workflow

Use isolated temporary Git fixtures and a fresh agent to prove:

1. A clean current checkout identifies exact mirrors and real drift without modifying either repository.
2. A dirty selected desktop source is rejected.
3. A catalog-only embedded raster such as Radeon Cloud becomes a provenance-tracked WebP, while `opencode -> open-code` remains a valid virtual mapping.
4. Ordinary AI SDK Agent code stays in scope and every unexplained non-Agent AI gap blocks its domain.
5. Knowledge, Agent, and non-HTTP MCP data must round trip, while physical desktop v7 backup incompatibility remains accurately blocked.

## Completion Report

Report the desktop repository identity and commit; per-domain source hashes, baseline, and final status; changed files and file/table/token/icon counts; migrations and data-retention behavior; all six change classifications; provider/model fan-out; backup compatibility; focused, repository, export, and visual results; skipped checks with reasons; screenshot/export/audit artifact paths; Metro and image cache state; dirty worktree state; device, credentials, SDK, network, and external-service blockers; and Conventional Commit hashes and subjects.
