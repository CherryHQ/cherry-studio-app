# Universal Package

`packages/universal` (`@cherrystudio/universal`) is the cross-platform subset of Cherry Desktop's
`src/shared`, extracted into a workspace package so the desktop mirror is a visible boundary
instead of being mixed into mobile-native code, and so a future desktop/mobile monorepo can consume
it as-is.

It is named `universal` rather than `shared` because three different "shared" scopes are in play —
desktop's process-shared `src/shared`, this cross-platform subset, and the mobile-native remainder
in `src/shared`. The package name keeps every import site unambiguous.

## Scope

Desktop's `src/shared` means "shared between the Electron main and renderer processes", not
"cross-platform". This package holds only the subset that is genuinely platform-independent:

| Directory | Contents |
|---|---|
| `src/data` | Entities, endpoint DTO schemas, `ApiClient`, preferences, `PreferenceClient`, presets, cache schemas, and data errors |
| `src/ai` | Cross-layer AI tool and transport rules |
| `src/types` | Portable value types (`aiSdk`, `codeCli`, `error`, `serializable`) |
| `src/utils` | Portable pure helpers (`conversationTitle`, `keywordSearch`, `model`, `shortcut`, `text`, `url`, plus the mobile-only `fnv1a` used by `mcpToolName`) |

The directory layout maps one-to-one onto desktop `src/shared/{data,ai,types,utils}`.
Mobile-native shared code stays in `src/shared`: `contracts/` (in-process API boundary, the mobile
counterpart of desktop IPC), `core/logger`, and `utils/cherryInOauth`.

## Admission Criteria

Apply these when deciding whether a desktop `src/shared` file belongs in the package:

1. Reject files that name Electron surfaces (windows, IPC channels, settings routes, boot config,
   the v1→v2 migration wizard).
2. Reject files that encode host-OS capabilities mobile cannot have (binary tool installation, CLI
   OAuth launch, local ONNX runtimes, OCR file processing).
3. Admit pure logic consumed by the mobile runtime, or shapes of data that mobile persists, backs
   up, or exchanges with desktop.
4. Check the import graph: a file whose only consumers are desktop-process-only files is not
   admitted, whatever its own contents look like.
5. Split welded hybrids surgically: keep the serialized shape, drop the desktop capability logic,
   and register the trim as a `shapeOnlyPorts` entry in `desktop-sync-manifest.json` (see
   `types/codeCli.ts`, `utils/shortcut.ts`, `ai/prompts.ts`).

Rejected files become `explicitExclusions` in the Manifest. Seeded ghost preference keys backing
excluded features (`feature.binary.*`, `feature.code_cli.configs`) stay: they are serialized data
under the preference-parity invariant, not code.

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

The `sync-cherry-desktop` skill owns desktop parity. `desktop-sync-manifest.json` maps the
`shared-data`, `shared-ai`, and `shared-portable` domains onto `packages/universal/src`, carries the
`explicitExclusions`, and registers every `shapeOnlyPorts` trim that must be re-applied on each
sync. `pnpm desktop:sync:audit` compares both repositories against that manifest.

In a future desktop/mobile monorepo, both apps consume this package directly; desktop keeps its
process-only `src/shared` remainder (IPC, window, command, and file concerns) beside it.
