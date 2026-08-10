---
name: sync-cherry-desktop
description: Audits and synchronizes Cherry Studio desktop behavior into the Expo mobile app across database schemas and migrations, data contracts and services, AI runtime, platform services, shared types and utilities, design tokens, themes, and provider/model/general icons. Use when syncing or checking mobile parity against desktop, updating shared data or AI behavior, regenerating Uniwind CSS or WebP icons, investigating desktop-to-mobile drift or visual regressions, or deciding whether a desktop change applies to mobile.
---

# Sync Cherry Desktop

Treat a clean Cherry Studio desktop checkout as the read-only source of truth. Preserve behavior and every persisted value; adapt only platform boundaries.

The cross-platform subset of desktop `src/shared` lives in `packages/universal/src` (`@cherrystudio/universal`), mirroring the desktop directory layout one-to-one; inside that package the import alias `@shared/*` matches desktop exactly so synced diffs stay verbatim.

## Audit First

1. Inspect both worktrees. Preserve unrelated mobile changes and never modify the desktop checkout.
2. Resolve the source through `--desktop-root <path>` or `CHERRY_STUDIO_DESKTOP_ROOT`; never record a machine-specific path.
3. Run the repository audit before editing:

   ```bash
   pnpm desktop:sync:audit --desktop-root <path> \
     [--domain <domain>] [--json] [--check]
   ```

4. Stop on an invalid checkout, dirty selected desktop source, failed invariant, or blocker. Use repeatable `--domain` flags to narrow investigation. Use `--json` for stable machine output; use `--check` when any drift, unbaselined domain, blocker, or invariant failure must fail.
5. Record the desktop commit and per-domain hashes. Do not let the audit write files or advance the Manifest.

## Read The Scope

- Read [scope-matrix.md](references/scope-matrix.md) for domain ownership, source mapping, classifications, and exclusions.
- Read [data-and-backup.md](references/data-and-backup.md) for schemas, migrations, Data APIs, preferences, MCP, opaque retention, and backup compatibility.
- Read [ai-and-services.md](references/ai-and-services.md) for exact mirrors, provider registry, AI runtime, shared AI, services, and dependencies.
- Read [design-and-icons.md](references/design-and-icons.md) for tokens, themes, catalogs, icon generation, and visual QA.
- Read [validation-and-reporting.md](references/validation-and-reporting.md) before editing and before reporting completion.
- Read each selected reference completely. References are complementary; load every domain touched by a cross-cutting change.

## Workflow

1. Compare the current desktop commit with each domain baseline in `desktop-sync-manifest.json`. Review tracked Git changes between commits and the current structured audit; do not infer parity from file counts.
2. Trace every changed concept through storage, shared contracts, service, API, bootstrap, frontend query/cache, settings, localization, tests, backup, and generated assets.
3. Classify every source change as `mirror`, `semantic-port`, `mobile-extension`, `opaque-retention`, `explicit-exclusion`, or `blocked`. Account for every file; never silently defer a gap.
4. Implement the smallest complete vertical slice in dependency order. Keep migrations append-only and preserve mobile Expo, TanStack Query, Bootstrap/DI, product identity, and Streamable HTTP adapters without changing contracts.
5. For design work, run the existing pipeline after the broad audit:

   ```bash
   pnpm design:sync --desktop-root <path>   # icons only
   pnpm design:sync --desktop-root <path> --check
   pnpm design:build                        # regenerate native.css from local token sources
   pnpm design:check
   ```

   The design tokens are mobile-owned (Vercel Brand Guidelines) — values and names both — and nothing under `packages/design-tokens/src/styles` or `scripts/theme-contract.ts` is mirrored from desktop; see `references/design-and-icons.md`.

6. Run focused and repository gates, then re-run the broad audit with `--check`. Advance a domain baseline manually only after all changes are classified, no blocker remains, and its required checks pass.

## Non-Negotiable Invariants

- Retain all 40 desktop business schemas, including Agent and Knowledge data, and provide complete Data API behavior even when mobile has no corresponding UI, Agent execution, indexing, or background jobs.
- Persist MCP `stdio`, `sse`, `streamableHttp`, and `inMemory` records plus unknown fields. Filter only the runtime/UI projection to `streamableHttp`; never rewrite hidden records.
- Migrate preference values whenever keys or codecs change. Never replace a preference schema in a way that strands old values.
- Treat desktop-restorable backup round trips as a formal target. Keep physical desktop v7 SQLite backup compatibility blocked until mobile can reproduce and restore its database and migration chain losslessly.
- Exclude only the Agent runtime paths declared in the Manifest. Synchronize ordinary chat `runtime/aiSdk/Agent.ts` and `aiCore/core/agents/createAgent.ts`.
- Block any unexplained non-Agent AI gap. Do not add retired tokens, PNG APIs, stale compatibility layers, or data-destructive fallbacks.

## Completion Report

Report the desktop commit, per-domain hashes and status, synchronized surfaces, file/table/token/icon counts, every classification, migrations, backup compatibility, validation and export results, screenshot paths, and every skipped check with its reason. State worktree, cache, device, and external-dependency state. Use small Conventional Commits with a specific kebab-case scope.
