# Data

Mobile-owned data entities, preferences, DTO schemas, pagination shapes, and data errors shared by
the mobile frontend and backend. This layer is independent of Cherry Desktop and follows one rule —
mobile persists what mobile reads. A desktop schema, field, or route with no mobile consumer is a
deliberate omission, not a gap.

## Scope

- `types`: entity and value types. Most are declared here (`Agent`, `AgentSession`, `FileEntry`,
  `Painting`, web search, trace). Six — model, provider, message, uiParts, aiUsageRecord, mcpServer —
  are one-line re-exports of declarations that stay in `@cherrystudio/universal/data/types` because
  `packages/ai-runtime` imports them and a workspace package must not import app code. App code
  imports every entity type from here regardless, so dissolving universal means pasting those
  declarations into files that already exist at the right path. Re-exporting rather than copying
  keeps one declaration: two copies of the same zod schema across the app/package boundary would
  drift silently. See that package's `src/data/README.md` ledger.
- `api`: endpoint DTO schemas, pagination shapes, data errors, and `ApiClient` — the
  platform-neutral resource interface shared by frontend endpoint hooks and the backend in-process
  `DataApiService` implementation.
- `preference`: DB-backed preference value types, defaults, and the separate `PreferenceClient`
  interface. The preference schema is hand-maintained and holds only the keys mobile reads.
- `cache`: cache schemas and pure cache-key helpers; concrete cache implementations remain with
  their runtime owner.
- `presets`: seed catalog data for web search providers.

Database tables, Drizzle row types, and migrations are not shared contracts; they stay under
`src/backend/data/db`. Workflow-only contracts live in `src/shared/contracts`.
