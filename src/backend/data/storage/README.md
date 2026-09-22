# Storage generations

The durable `Documents/storage-control/state.json` record selects either the original `legacy`
store or `Documents/stores/<uuid>`. Database and managed file resolvers use the same selection,
cached for the lifetime of the JavaScript runtime. They never retarget a live database connection.

The original store keeps its existing Expo SQLite location and Documents file layout. A new store
contains `database/cherry.db`, `Data/Files`, and the existing avatar directory names. Missing control
metadata or a missing selected database fails closed instead of creating an empty replacement.

1. Import validates in cache, then copies and normalizes a separate candidate store.
2. After files are synchronized, an atomic control write records `pending: staged` and the native
   process id. The current process becomes read-only and displays restart instructions.
3. On a different native process, selection records `activating` before opening the candidate.
   A JavaScript reload in the staging process cannot activate it.
4. Bootstrap verifies hashes, schema, references and required service initialization. Only then
   does it commit `current = candidate`, retaining the previous generation.
5. Failure requires another native restart. An interrupted activation automatically selects the
   previous generation on the following native process. It never falls through to an empty store.

Cleanup runs after successful bootstrap, at most once per native process. It retains current and
previous generations, removes abandoned generations and other processes' backup cache, and deletes
only explicitly owned legacy paths when legacy is no longer retained. It never deletes Documents
or the shared SQLite directory. The latest previous generation remains available on disk; this
release has no user-facing undo action after a successful commit.

Native-process restart is intentional: current Drizzle/FTS connections can retain native handles
after JavaScript teardown. Reloading the JavaScript bundle does not make in-process database
replacement safe. See [backup workflow](../../services/backup/README.md).
