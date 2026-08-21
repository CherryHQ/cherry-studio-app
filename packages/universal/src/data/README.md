# Data (Transitional)

The mobile data layer lives in `src/shared/data` (`@/shared/data`); it moved out of this package
because it is mobile-owned, not a Cherry Desktop mirror. What remains here is the transitional
remainder that cannot move yet.

## Why these files are still here

`packages/ai-runtime` imports the entity vocabulary below, and workspace packages must not import
app code. Until the AI-runtime vocabulary finds its final home (candidate: `packages/ai-runtime`
itself), these modules stay importable as `@cherrystudio/universal/data/types/*` — but only for
package-side consumers:

- `types/model.ts`
- `types/provider.ts`
- `types/assistant.ts`
- `types/message.ts`
- `types/uiParts.ts`
- `types/aiUsageRecord.ts`
- `types/mcpServer.ts`

They are mobile-owned all the same — the desktop-sync audit does not track them, and each follows
"mobile persists what mobile reads".

App code no longer spells this path: `src/shared/data/types` re-exports each module under its final
name, and an ESLint tombstone keeps `src` off the package path. Dissolving this directory is
therefore a paste into the matching `src/shared/data/types/*.ts` file plus repointing
`packages/ai-runtime`, with no import migration in `src`.

Do not add new modules here; put new mobile data contracts in `src/shared/data`.
