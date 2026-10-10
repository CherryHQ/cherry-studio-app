# Database Migrations

Released databases upgrade in place. `sqlite-drizzle/0000_initial.sql` creates the
15-table baseline shipped since v0.1.0; later journal entries upgrade it to the current schema, so
a schema or serialized-format change must migrate existing user data rather than require a reset.
Databases from development builds before that baseline are unsupported and must be recreated.
The app does not automatically delete the local `cherry.db`.

- Table definitions live in `src/backend/data/db/schemas`.
- `sqlite-drizzle` contains generated SQL, the migration journal, and schema snapshots.
  Generate schema changes with Drizzle; add data transformations to the new migration when
  serialized formats change. Keep already-applied migrations intact.
- Expo cannot read this directory at runtime. `src/backend/data/db/migrations.ts`
  bundles SQL and the journal for `drizzle-orm/expo-sqlite/migrator`.
- After changing table definitions, run `pnpm db:generate` and register the new SQL
  import in `migrations.ts`.
- Full-text search tables and triggers remain in `src/backend/data/db/customSql.ts`.
  `DbService` runs that SQL and the seeders after applying the bundled migrations.
