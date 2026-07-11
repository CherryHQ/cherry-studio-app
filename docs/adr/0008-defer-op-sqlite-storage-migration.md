# Defer op-sqlite Storage Migration

Cherry Mobile keeps `expo-sqlite` with `drizzle-orm` as its local persistence engine for now and defers migrating to `op-sqlite`. There is no prior ADR selecting `expo-sqlite`; the only recorded rationale is a pair of workarounds in the data layer, not a positive engine choice. Migration is deferred, not rejected: it should be re-evaluated as a scoped spike, not folded into unrelated data-layer work.

**Considered Options**

- Keep `expo-sqlite` + Drizzle and carry the current workarounds.
- Migrate to `op-sqlite` + its Drizzle driver now to drop the workarounds and pursue read/write throughput.
- Migrate later, after the workarounds' cost or the driver's stability makes the trade-off clear.

**Consequences**

The two `expo-sqlite`-specific workarounds stay in place and remain the seam a future migration must re-check: (1) migrations are bundled into `src/data/db/migrations.ts` because the Expo runtime cannot read a migration folder directly; (2) `DbService.withWriteTx` serializes writes on a long-lived connection with a hand-written `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` to avoid Expo's temporary exclusive-transaction connection, which crashes on physical iOS devices when FTS5 tables are present (`src/data/db/DbService.ts`), and the custom FTS SQL runs after every migration (`src/data/db/customSql.ts`). Because these are mitigations for `expo-sqlite` deficiencies, they argue *for* evaluating `op-sqlite` later, not against it. A migration spike must weigh `op-sqlite`'s smaller ecosystem, extra Babel/Metro configuration, and still-evolving driver API against removing the manual transaction queue and any measured throughput gain, and must re-verify the FTS5 exclusive-transaction crash on real hardware. Startup performance work proceeds independently of this decision (see ADR 0002).
