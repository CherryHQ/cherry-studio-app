# Data DB Schemas

Mobile Drizzle schemas migrated from the desktop `src/main/data/db/schemas` directory.

## Scope

- Keep table names, column names, indexes, constraints, and schema comments aligned with desktop
  unless mobile has a documented runtime compatibility reason to diverge.
- `_columnHelpers.ts` mirrors desktop `_columnHelpers.ts` but keeps Expo-compatible UUID generation
  for drizzle-kit and React Native runtime loading.
- Agent, Agent tool binding, Agent Session, MCP, file, job, painting, provider/model, preference,
  and AI usage tables are the active mobile subset. Knowledge, translate, miniapp, and Agent
  workspace domains are not migrated yet.

## Migration Flow

After changing a schema file, run `pnpm db:generate` and add the generated SQL import to
`src/backend/data/db/migrations.ts` so Expo can bundle the migration.

Custom SQL that Drizzle cannot generate, such as Agent Session message FTS5 and triggers, is
executed idempotently through `src/backend/data/db/customSql.ts`.
