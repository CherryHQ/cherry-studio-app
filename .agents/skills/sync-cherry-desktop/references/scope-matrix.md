# Scope Matrix

Use `desktop-sync-manifest.json` as the versioned domain inventory. Let the design manifest (`packages/design-tokens/src/sync-manifest.json`) own the SVG, icon-routing, and catalog-only-icon hashes; do not duplicate those entries in the broad Manifest. It no longer carries token, CSS, or contract hashes — those files are mobile-owned and unsynced, so there is no desktop baseline to record. Keep runtime catalogs, manually adapted icons, and cross-domain provider coverage in the broad Manifest.

## Domain Mapping

| Domain | Desktop source | Mobile destination | Required strategy |
|---|---|---|---|
| `design-catalog` | `packages/ui/icons`, icon registry and components | `packages/ui/icons`, `packages/ui/src/icons`, `packages/ui/src/icons-webp` | `semantic-port`; exact SVG sources plus native asset/catalog adapters |
| `schema` | `src/main/data/db/schemas`, migration snapshots | `src/backend/data/db/schemas`, migration snapshots | `opaque-retention`; identical target schema with independent append-only history |
| `shared-data` | `src/shared/data` | `packages/universal/src/data` | `semantic-port` |
| `shared-portable` | shared `types`/`utils` files listed in the Manifest | `packages/universal/src/{types,utils}` | `semantic-port`; shape-only trims registered in `shapeOnlyPorts` |
| `data-main` | `src/main/data` | `src/backend/data` | `semantic-port`; exclude only the Manifest's legacy desktop migration mechanics |
| `data-renderer` | `src/renderer/data` | `src/frontend/data` | `semantic-port`; TanStack Query is the mobile adapter |
| `ai-core` | `packages/aiCore` | `packages/ai-core` | `mirror` |
| `ai-sdk-provider` | `packages/ai-sdk-provider` | same path | `mirror` |
| `provider-registry` | `packages/provider-registry` | same path | `semantic-port` with a narrow mobile loader |
| `ai-runtime` | `src/main/ai` | `src/backend/ai` | `semantic-port` except explicit Manifest exclusions |
| `shared-ai` | `src/shared/ai` | `packages/universal/src/ai` | `semantic-port` |
| `services` | `src/main/services` | `src/backend/services`, reached data and AI services | `semantic-port` |
| `dependencies` | manifests, lockfile, patches | mobile equivalents | `semantic-port`; retain Expo-compatible resolution |
| `backup` | backup manager, restore, cache | mobile data and services | `opaque-retention`; remain `blocked` until lossless desktop restoration works |

Also trace shared `types` and `utils`, root configuration, workspace packages, feature/core imports, bootstrap and DI registration, migrations, seeds, cache, search, file/logo references, import/export, settings, i18n, tests, and fixtures. A path outside this table is not automatically out of scope.

## Classification Rules

- Use `mirror` only when sorted tracked file sets and bytes must match, such as `aiCore -> ai-core` and `ai-sdk-provider`.
- Use `semantic-port` when public behavior must match through a mobile platform adapter.
- Use `mobile-extension` only for code that serves a mobile-only platform or product requirement without weakening desktop parity.
- Use `opaque-retention` when unsupported features must still survive storage, migration, unrelated updates, export, and import unchanged.
- Use `explicit-exclusion` only for a path already justified in the Manifest. Do not infer it from a symbol or directory name.
- Use `blocked` when parity cannot be implemented or proved. Record behavior, dependency chain, user/data impact, evidence, and the smallest decision needed.

Classify every tracked desktop change in the selected domains. Do not advance a baseline while any change is unclassified or blocked.

## Allowed Platform Boundaries

Preserve Expo and React Native packaging, async Expo SQLite with Bootstrap/DI, in-process typed APIs, TanStack Query, static Metro asset registries, the mobile product identity, and Streamable HTTP runtime projection. At each boundary, keep desktop inputs, outputs, defaults, filtering, sorting, pagination, errors, cancellation, mutations, persistence, lifecycle, and invalidation semantics.

## Explicit AI Runtime Exclusions

Exclude only the paths in the Manifest:

- `src/main/ai/agentSession/**`
- `src/main/ai/agents/**`
- `src/main/ai/observability/adapters/claudeCode/**`
- `src/main/ai/runtime/claudeCode/**`
- `src/main/ai/streamManager/__tests__/buildCompactReplay.test.ts`
- `src/main/ai/streamManager/buildCompactReplay.ts`
- `src/main/ai/tools/adapters/claudeCode/**`

Desktop compact replay exists so an Electron renderer can reattach to a Main-owned chunk stream.
Mobile keeps generation and UI state in one process, and route remounts recover the current overlay
from `ChatRuntime`'s Topic snapshot, so porting the chunk buffer and replay helper would duplicate the
mobile source of truth. This exclusion does not cover stream accumulation, terminal persistence, or
any shared Message/Topic data contract.

Do not exclude Agent database tables. Do not exclude ordinary chat `src/main/ai/runtime/aiSdk/Agent.ts` or `packages/aiCore/**/agents/createAgent.ts`. Require evidence and a Manifest change before adding an exclusion.

## Explicit Shared AI Exclusions

The nine `shared-ai` exclusions are the shared half of surfaces the `ai-runtime` domain already excludes. They rest on two different grounds, and the difference matters when re-checking them:

- **Hard.** `agentSessionContextUsage.ts` and `agentSessionSlashCommands.ts` alias `@anthropic-ai/claude-agent-sdk` types directly, and mobile has no such dependency. `claudecode/**` serves the desktop Claude Code runtime. These cannot be ported without first taking the dependency.
- **Product surface.** `slashCommands.ts`, `agentSlashCommands.ts` and `tool.ts` describe the desktop Agent's slash-command palette and tool-registry DTO, whose consumers are `src/renderer/hooks/agent/**` and the Claude Code tool adapter. `tool.ts` is the weakest of the nine: mobile already ships an approval sheet and an MCP settings screen, so the first "tools overview" screen makes it portable.

`agentSessionApiRetry.ts`, `agentSessionBackgroundTasks.ts` and `agentSessionFlowParts.ts` are on neither ground. They are cache-key constants and state types with no SDK dependency, structurally indistinguishable from `agentSessionCompaction.ts` — which **is** ported, with just as few mobile consumers (zero). Porting is the default and exclusion is what needs a reason, so the honest reading is that these three are unfinished porting rather than a decided boundary. Nothing depends on the inconsistency today, since all four are type-and-constant only; do not cite "no mobile consumer" as the rationale for keeping them out, because it would exclude the ported one too.
