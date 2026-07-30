# Data DB Schemas

Mobile Drizzle schemas migrated from the desktop `src/main/data/db/schemass` directory.

## Scope

- Keep table names, column names, indexes, constraints, and schema comments aligned with desktop
  unless mobile has a documented runtime compatibility reason to diverge.
- `_columnHelpers.ts` mirrors desktop `_columnHelpers.ts` but keeps Expo-compatible UUID generation
  for drizzle-kit and React Native runtime loading.
- Full agent, MCP, knowledge, job, translate, miniapp, file, and agent workspace domains are not
  migrated yet. Assistant MCP/knowledge relation tables exist only as partial relation support.

## Migration Flow

After changing a schema file, run `pnpm db:generate` and add the generated SQL import to
`src/backend/infrastructure/db/migrations.ts` so Expo can bundle the migration.

Custom SQL that Drizzle cannot generate, such as the message FTS5 table and triggers, lives in the
schema module and is executed idempotently through `src/backend/infrastructure/db/customSql.ts`.
