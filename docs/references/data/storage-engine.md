# Storage Engine

Cherry Mobile keeps `expo-sqlite` with `drizzle-orm` as its local persistence engine for now and defers migrating to `op-sqlite`. There is no prior architecture rule selecting `expo-sqlite`; the current rationale is a pair of workarounds in the data layer, not a permanent engine commitment. Migration is deferred, not rejected: it should be re-evaluated as a scoped spike, not folded into unrelated data-layer work.

## Current Boundary

The storage engine is a backend implementation detail behind the Data API and preference
interfaces. A driver change must not change the frontend boundary.

## Expo SQLite Workarounds

The two `expo-sqlite`-specific workarounds stay in place and remain the seam a future migration must
re-check: (1) migrations are bundled into
`src/backend/data/db/migrations.ts` because the Expo runtime cannot read a migration folder
directly; (2) `DbService.withWriteTx` serializes writes on a long-lived connection with a hand-written
`BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` to avoid Expo's temporary exclusive-transaction connection,
which crashes on physical iOS devices when FTS5 tables are present
(`src/backend/data/db/DbService.ts`). Custom FTS SQL is checked after migrations from
`src/backend/data/db/customSql.ts` and skipped when its journaled content hash is unchanged.
Because these are mitigations for `expo-sqlite` deficiencies, they argue *for* evaluating `op-sqlite`
later, not against it.

## Reconsidering `op-sqlite`

Re-evaluate `op-sqlite` when the workarounds create measurable correctness, maintenance, or
performance cost; device benchmarks show product-relevant throughput gains; the driver and its
ecosystem are stable enough; or a required storage capability cannot be implemented reliably with
the current engine.

A migration spike must weigh `op-sqlite`'s smaller ecosystem, extra Babel/Metro
configuration, and still-evolving driver API against removing the manual transaction queue and any
measured throughput gain, and must re-verify the FTS5 exclusive-transaction crash on real hardware.
It must also preserve the Data API, preference behavior, migration semantics, seed data, custom FTS
setup, and the user-data requirements in effect at that time.
