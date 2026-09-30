# Universal Package

`packages/universal` (`@cherrystudio/universal`) was extracted as the cross-platform subset of
Cherry Desktop's `src/shared`, keeping that code visibly separate from mobile-native code.

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

## Remaining Scope

The remaining files are mobile-owned copies admitted by current consumers. They are no longer
synchronized with desktop; change them like any other mobile code.

| Directory | Contents |
|---|---|
| `src/ai` | Remaining portable AI vocabulary with current package consumers |
| `src/types` | Portable value types (`aiSdk`, `error`, `serializable`) |
| `src/utils` | Portable pure helpers (`conversationTitle`, `keywordSearch`, `model`, `text`, `url`, plus the mobile-only `fnv1a` used by `mcpToolName`) |

`src/data` is described in `packages/universal/src/data/README.md`.

## Admission Criteria

Desktop's `src/shared` means "shared between the Electron main and renderer processes", not
"cross-platform". Apply these when deciding whether to port a desktop `src/shared` file into the
package:

1. Reject files that name Electron surfaces (windows, IPC channels, settings routes, boot config,
   the v1→v2 migration wizard).
2. Reject files that encode host-OS capabilities mobile cannot have (binary tool installation,
   local ONNX runtimes, OCR file processing).
3. Admit pure logic consumed by the mobile runtime. Data shapes are not admitted: the mobile data
   layer is independent of desktop and lives in app space.
4. Check the import graph: a file whose only consumers are desktop-process-only files is not
   admitted, whatever its own contents look like.
5. Split welded hybrids surgically: keep the portable logic and drop the desktop capability logic.

## Imports And Aliasing

- App code imports `@cherrystudio/universal/*` (enforced by ESLint; the package-internal alias is
  banned in `src/`).
- Inside the package, imports use the package-internal `@shared/*` alias.
- The package must not import app code (`@/*`) or react/react-native/expo modules; ESLint enforces
  both directions.
- The package is source-direct (no build step): `exports` point at `./src/*.ts`, and Metro/tsc/jest
  resolve it through the root `tsconfig.json` paths.
