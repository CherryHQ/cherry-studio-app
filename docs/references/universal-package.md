# Universal Package

`packages/universal` (`@cherrystudio/universal`) was extracted as the cross-platform subset of
Cherry Desktop's `src/shared`, so the desktop mirror is a visible boundary instead of being mixed
into mobile-native code.

It is named `universal` rather than `shared` because three different "shared" scopes are in play —
desktop's process-shared `src/shared`, this cross-platform subset, and the mobile-native remainder
in `src/shared`. The package name keeps every import site unambiguous.

## Dissolution

The package is dissolving. The mobile data layer is independent of desktop, so nothing under
`src/data` is a mirror anymore, and mobile-owned code has moved back into app space:

- `src/data/{api,cache,preference,presets}` and the entity types with no package-side consumer now
  live in `src/shared/data` (`@/shared/data`).
- `src/data/types/{model,provider,assistant,message,uiParts,aiUsageRecord,mcpServer}.ts` and
  `src/types/aiSdk.ts` stay temporarily: `packages/ai-runtime` imports them, and workspace packages
  must not import app code. They move in a later round together with a decision on the AI-runtime
  vocabulary's final home (candidate: `packages/ai-runtime`).
- The old Chat stream/approval transport has been removed. Remaining `src/ai` files are admitted
  only when a current package consumer exists.
- `src/utils/model.ts` has forked in both directions (mobile-only detection helpers, desktop-only
  registry queries) and is no longer a candidate for verbatim alignment.

New cross-layer mobile contracts belong in `src/shared`, not here.

## Remaining Mirror Scope

Desktop's `src/shared` means "shared between the Electron main and renderer processes", not
"cross-platform". The directories still synchronized against desktop:

| Directory | Contents |
|---|---|
| `src/ai` | Remaining portable AI vocabulary with current package consumers |
| `src/types` | Portable value types (`aiSdk`, `error`, `serializable`) |
| `src/utils` | Portable pure helpers (`conversationTitle`, `keywordSearch`, `model`, `text`, `url`, plus the mobile-only `fnv1a` used by `mcpToolName`) |

`src/data` is mobile-owned and excluded from synchronization; see `packages/universal/src/data/README.md`.

## Admission Criteria

Apply these when deciding whether a desktop `src/shared` file belongs in the remaining mirror:

1. Reject files that name Electron surfaces (windows, IPC channels, settings routes, boot config,
   the v1→v2 migration wizard).
2. Reject files that encode host-OS capabilities mobile cannot have (binary tool installation,
   local ONNX runtimes, OCR file processing).
3. Admit pure logic consumed by the mobile runtime. Data shapes are not admitted: the mobile data
   layer is independent of desktop and lives in app space.
4. Check the import graph: a file whose only consumers are desktop-process-only files is not
   admitted, whatever its own contents look like.
5. Split welded hybrids surgically: keep the portable logic, drop the desktop capability logic,
   and register the trim as a `shapeOnlyPorts` entry in `desktop-sync-manifest.json` (see the
   `mcpToolName.test.ts` entry in the `shared-ai` domain).

Rejected files become `explicitExclusions` in the Manifest.

## Imports And Aliasing

- App code imports `@cherrystudio/universal/*` (enforced by ESLint; the package-internal alias is
  banned in `src/`).
- Inside the package, imports use `@shared/*` — the same alias desktop uses — so synced files diff
  verbatim against their desktop counterparts.
- The package must not import app code (`@/*`) or react/react-native/expo modules; ESLint enforces
  both directions.
- The package is source-direct (no build step): `exports` point at `./src/*.ts`, and Metro/tsc/jest
  resolve it through the root `tsconfig.json` paths.

## Sync

The `sync-cherry-desktop` skill owns desktop parity for the remaining mirror.
`desktop-sync-manifest.json` maps the `shared-ai` and `shared-portable` domains onto
`packages/universal/src`, carries the `explicitExclusions`, and registers every `shapeOnlyPorts`
trim that must be re-applied on each sync. `pnpm desktop:sync:audit` compares both repositories
against that manifest. The data domains were retired deliberately: mobile persists what mobile
reads, and auditing a non-mirror only manufactures drift reports.
