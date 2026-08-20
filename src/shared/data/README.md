# Data

Mobile-owned data entities, preferences, DTO schemas, pagination shapes, and data errors shared by
the mobile frontend and backend. This layer is independent of Cherry Desktop and follows one rule —
mobile persists what mobile reads. A desktop schema, field, or route with no mobile consumer is a
deliberate omission, not a gap.

## Scope

- `types`: entity and value types with no package-side consumer (`FileEntry`, `Topic`, `Painting`,
  web search, trace). The entity types `packages/ai-runtime` still imports (model, provider,
  assistant, message, uiParts, aiUsageRecord, mcpServer) remain temporarily under
  `@cherrystudio/universal/data/types`; see that package's `src/data/README.md` ledger.
- `api`: endpoint DTO schemas, pagination shapes, data errors, and `ApiClient` — the
  platform-neutral resource interface shared by frontend endpoint hooks and the backend in-process
  `DataApiService` implementation.
- `preference`: DB-backed preference value types, defaults, and the separate `PreferenceClient`
  interface. The preference schema is hand-maintained and holds only the keys mobile reads.
- `cache`: cache schemas and pure cache-key helpers; concrete cache implementations remain with
  their runtime owner.
- `presets`: seed catalog data (default assistant, managed CherryAI provider, web search providers).

Database tables, Drizzle row types, and migrations are not shared contracts; they stay under
`src/backend/data/db`. Workflow-only contracts live in `src/shared/contracts`.
