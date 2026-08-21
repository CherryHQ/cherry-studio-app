# Data

Mobile-owned data entities, preferences, DTO schemas, pagination shapes, and data errors shared by
the mobile frontend and backend. This directory is **not** a Cherry Desktop mirror: the desktop-sync
audit no longer tracks it, and its contents follow one rule — mobile persists what mobile reads. A
desktop schema, field, or route with no mobile consumer is a deliberate omission, not a gap.

## Scope

- Entity and value types live under `types`; API-shaped DTO schemas, pagination shapes, and data
  errors live under `api`.
- `ApiClient` is the platform-neutral resource interface shared by frontend endpoint hooks and the
  backend in-process `DataApiService` implementation.
- DB-backed preference value types, defaults, and the separate `PreferenceClient` interface live
  under `preference`. The preference schema is hand-maintained and holds only the keys mobile reads.
- Cache schemas and pure cache-key helpers live under `cache`; concrete cache implementations remain
  with their runtime owner.

## Transitional Home

`packages/universal` is dissolving: code that is mobile-owned belongs in `src/`, and this data
layer's destination is `src/shared/data`. It has not all moved at once because
`packages/ai-runtime` imports the entity vocabulary, and workspace packages must not import app
code.

- **Staying here for now** — `types/{model,provider,assistant,message,uiParts,aiUsageRecord,mcpServer}.ts`
  (plus `../types/aiSdk.ts`): consumed by `packages/ai-runtime` and by `../ai`. These move in a
  later round, together with a decision on where the AI-runtime vocabulary finally lives
  (candidate: `packages/ai-runtime` itself).
- **Moving to `src/shared/data`** — everything else: `api`, `cache`, `preference`, `presets`, and
  the types with no package-side consumer.

Do not add new modules here; put new mobile data contracts in `src/shared/data`.
