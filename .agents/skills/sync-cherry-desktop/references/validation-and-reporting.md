# Validation And Reporting

## Audit Guarantees

Run the read-only audit before and after synchronization against a clean selected desktop source.
Keep desktop installs, formatters, generators, and snapshot-writing tests out of this workflow.
Use tracked files and the audit's structured hashes/probes; observations are not new baselines.
Never let a reporting command silently advance `desktop-sync-manifest.json`.

`--check` fails on selected-domain drift, unbaselined or blocked status, or invariant failures.
A reporting-only audit may succeed while reporting findings. Scope checks to selected domains,
report unrelated unresolved domains separately, and resolve every selected blocker before manually
advancing its baseline.

## Select Gates By Changed Contract

Follow [Testing And CI](../../../../docs/guides/testing-and-ci.md), including focused suites,
specialized checks, local draft-PR gates, and the remote PR-suite boundary. Do not add a conflicting
full-local-suite policy here.

- AI ports: owning package and consumer tests, export-boundary checks, and provider-registry
  admission gates when compatibility changes.
- Persisted data: affected schema/migration, preference, serialization, and supported round-trip
  regressions. Do not demand tests for retired desktop-only domains.
- Icons/tokens: `pnpm design:sync --desktop-root <path> --check`, `pnpm design:check`, and affected
  icon routing/catalog regressions. Token regeneration uses local Mobile sources.
- Skill/doc changes: `pnpm skills:sync`, `pnpm skills:check`, `pnpm docs:check-links`, and formatting.
  These do not prove runtime behavior.
- Audit-script changes: focused desktop-sync fixture suites under `scripts/__tests__`. PR CI
  excludes these suites, so remote success cannot substitute for their focused local run.

Add regression coverage for changed behavior and newly identified audit gaps. Inspect generated
files and preserve unrelated work. If required checks cannot run within the task's permissions or
environment, report them as skipped and leave admission/baseline advancement pending.

## Platform Admission

Runtime, dependency, native-adapter, and bundle-sensitive ports require platform exports and device
acceptance defined by the owning architecture reference. Visual changes additionally need light/dark
inspection and applicable icon-cache checks. Follow
[Parallel Device Testing](../../../../docs/guides/parallel-device-testing.md) for workspace isolation.

Pure documentation/skill changes do not require runtime export or visual acceptance; report those
as not applicable instead of claiming they ran.

## Completion Report

Report the desktop identity/commit, selected domains and hashes, baseline/final status, admitted
consumers, classified changes, unresolved drift, and blockers. Include touched migrations,
data-retention and compatibility effects, provider/icon fan-out, check results, and skipped checks
with reasons. Report export/screenshot artifacts, device/cache state, and external dependencies
only when relevant. An audit result does not authorize commits, publication, or baseline changes.
