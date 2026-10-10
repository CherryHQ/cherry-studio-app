import m0000 from '../../../../migrations/sqlite-drizzle/0000_initial.sql';
import m0001 from '../../../../migrations/sqlite-drizzle/0001_hot_cammi.sql';
import m0002 from '../../../../migrations/sqlite-drizzle/0002_orange_thunderbolt_ross.sql';
import m0003 from '../../../../migrations/sqlite-drizzle/0003_align_agent_fields.sql';
import m0004 from '../../../../migrations/sqlite-drizzle/0004_agent_message_replay.sql';
import m0005 from '../../../../migrations/sqlite-drizzle/0005_drop_agent_message_replay.sql';
import journal from '../../../../migrations/sqlite-drizzle/meta/_journal.json';

// Expo SQLite migrations must be bundled into JS; unlike the desktop main
// process, mobile runtime cannot read the Drizzle migration folder directly.
// The initial schema stores only MCP tool bindings.
// Keep this module in the dependency graph when editing imported `.sql` files:
// Metro/Babel inline-import can otherwise serve stale inlined SQL from cache.
export const migrations = {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
    m0004,
    m0005,
  },
};
