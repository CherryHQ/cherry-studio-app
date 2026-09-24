# Storage generations

The durable `Documents/storage-control/state.json` record selects either the original `legacy`
store or `Documents/stores/<uuid>`. Database and managed file resolvers use the same selection,
cached for the lifetime of the JavaScript runtime. They never retarget a live database connection.

The original store keeps its existing Expo SQLite location and Documents file layout. A new store
contains `database/cherry.db`, `Data/Files`, and the existing avatar directory names. Missing control
metadata or a missing selected database fails closed instead of creating an empty replacement.

1. Import validates in cache, then copies and normalizes a separate candidate store.
2. After files are synchronized, an atomic control write records `pending: staged` and the native
   process id. The current process becomes read-only. Android starts a fresh native process
   automatically; iOS and Android restart failures display restart instructions.
3. On a different native process, selection records `activating` before opening the candidate.
   A JavaScript reload in the staging process cannot activate it.
4. Bootstrap verifies hashes, schema, references and required service initialization. Only then
   does it commit `current = candidate`.
5. A candidate rejected by validation has not been opened, so the same process continues on the
   current generation. A failure after the candidate opens requires another native restart. An
   interrupted activation automatically selects the current generation on the following native
   process. It never falls through to an empty store.

Cleanup runs after successful bootstrap, at most once per native process. It retains only the
current generation, removes replaced and abandoned generations and other processes' backup cache,
and deletes only explicitly owned legacy paths once legacy is no longer current. It never deletes
Documents or the shared SQLite directory. There is no undo after a successful commit, so a replaced
generation is not kept on disk.

Native-process restart is intentional: current Drizzle/FTS connections can retain native handles
after JavaScript teardown. Reloading the JavaScript bundle does not make in-process database
replacement safe. See [backup workflow](../../services/backup/README.md).
