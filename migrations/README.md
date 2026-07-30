**THIS DIRECTORY IS NOT FOR RUNTIME USE**

**Mobile Data Refactoring Notice**
Before the mobile data layer is finalized, the database structure may change.
If the schema is reinitialized during development, delete the local `cherry.db`
database from the Expo SQLite storage.

- Using `expo-sqlite` as the SQLite driver, and `drizzle` as the ORM and
  database migration tool.
- Table schemas are defined in `src/backend/data/db/schemas`.
- `migrations/sqlite-drizzle` contains auto-generated migration data. Please
  **DO NOT** modify it manually unless intentionally reconciling the mobile
  migration history.
- Expo runtime does not read this folder directly.
  `src/backend/data/db/migrations.ts`
  bundles the SQL and journal into the object required by
  `drizzle-orm/expo-sqlite/migrator`.
- If table structure changes, generate migrations with `drizzle-kit`.
