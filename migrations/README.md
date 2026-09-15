# Database Migrations

Cherry Mobile is unreleased. `sqlite-drizzle/0000_initial.sql` creates the current
15-table schema from an empty database. Earlier development migrations and data
backfills have been replaced by this baseline. Existing development databases
must be recreated before using it; there is no upgrade path from the old history.
The app does not automatically delete the local `cherry.db`.

- Table definitions live in `src/backend/data/db/schemas`.
- `sqlite-drizzle` contains generated SQL, the migration journal, and schema snapshots.
  Keep them generated unless intentionally reconciling the migration history.
- Expo cannot read this directory at runtime. `src/backend/data/db/migrations.ts`
  bundles SQL and the journal for `drizzle-orm/expo-sqlite/migrator`.
- After changing table definitions, run `pnpm db:generate` and register the new SQL
  import in `migrations.ts`.
- Full-text search tables and triggers remain in `src/backend/data/db/customSql.ts`.
  `DbService` runs that SQL and the seeders after applying the bundled migrations.
