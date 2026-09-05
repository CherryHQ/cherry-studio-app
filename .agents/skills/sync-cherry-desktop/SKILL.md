---
name: sync-cherry-desktop
description: Audit Cherry Studio desktop changes and selectively port behavior consumed by Cherry Mobile. Use for desktop-to-mobile drift reviews, provider and non-conversation AI SDK updates, portable shared helpers, and icon synchronization. Mobile owns its Pi conversation runtime, data layer, design tokens, and platform adapters; this skill does not require whole-application parity.
---

# Sync Cherry Desktop

Treat a clean desktop checkout as a read-only comparison source, not as authority over Mobile's
architecture. Read [Desktop AI Reuse](../../../docs/references/ai/desktop-package-reuse.md) for AI
work and [Universal Package](../../../docs/references/universal-package.md) for shared code.
Current repository references govern admission; historical sync instructions do not restore
retired domains or desktop owners.

## Audit First

1. Inspect both worktrees and preserve unrelated changes. Never edit the desktop checkout.
2. Resolve it through `--desktop-root <path>` or `CHERRY_STUDIO_DESKTOP_ROOT`; never commit a
   machine-specific path.
3. Read [the manifest](../../../desktop-sync-manifest.json) and run the read-only audit:

   ```bash
   pnpm desktop:sync:audit --desktop-root <path> [--domain <domain>] [--json] [--check]
   ```

4. Stop on an invalid checkout, dirty selected desktop source, or failed invariant. Record drift
   and unbaselined domains before editing; these are findings, not permission to copy everything.
   Use repeatable `--domain` flags to scope the work. `--check` fails for unresolved selected-domain
   drift, unbaselined status, blockers, or invariant failures.
5. Record the desktop commit and per-domain hashes. The audit must not advance a baseline.

## Read The Selected Scope

- Always read [scope-matrix.md](references/scope-matrix.md) and
  [validation-and-reporting.md](references/validation-and-reporting.md).
- For AI, shared helpers, services, or dependencies, read
  [ai-and-services.md](references/ai-and-services.md).
- For a port touching persisted Mobile data or import/export, read
  [data-and-backup.md](references/data-and-backup.md).
- For icons or presentation, read [design-and-icons.md](references/design-and-icons.md).
- Read each selected reference completely; cross-cutting changes need every affected reference.

## Workflow

1. Compare the desktop commit with selected domain baselines. Account for changed behavior,
   not just matching file counts or hashes.
2. Identify a current Mobile production consumer and its owner before admitting a port. Trace
   affected contracts through provider resolution, services, persistence, UI, assets, and tests
   only where the selected behavior reaches them.
3. Classify each selected source change using the scope matrix. Record deliberate exclusions and
   unresolved decisions. An unsupported desktop feature is not a Mobile defect by default.
4. Implement the smallest complete consumer slice. Preserve Mobile's Pi conversation execution,
   `AiService` non-conversation path, static Metro loading, Expo adapters, and independent data layer.
5. Use the existing icon/token pipelines; tokens remain Mobile-owned. Do not add another generator.
6. Apply the relevant gates and re-run the selected audit. Advance a domain baseline manually only
   after its changes are classified and required checks pass. Report unrelated unbaselined domains
   separately; do not silently mark them aligned.

## Invariants

- Do not mirror desktop conversation hosts, loops, tools, lifecycle, or persistence into Mobile.
- `ai-core` and `ai-sdk-provider` are semantic ports, not byte-for-byte package mirrors.
- Admit remaining `universal` helpers by their current consumer closure; new Mobile contracts
  belong in `src/shared`.
- Preserve existing persisted values when changing an admitted Mobile contract. Keep migrations
  append-only; do not use resets or lossy coercions to resolve drift.
- Do not reintroduce retired desktop schema, data, conversation-runtime, or backup domains.
- A source baseline is not registry compatibility admission or proof of backup interoperability.

## Completion Report

Report the source commit, selected domains and hashes, admitted consumers, classifications,
changed contracts, remaining drift or blockers, validation results, and skipped checks with reasons.
Include migration, compatibility, export, screenshot, device, and cache details only when touched.
