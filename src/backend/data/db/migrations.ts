import m0000 from '../../../../migrations/sqlite-drizzle/0000_initial.sql';
import m0001 from '../../../../migrations/sqlite-drizzle/0001_agent_skills.sql';
import journal from '../../../../migrations/sqlite-drizzle/meta/_journal.json';

// Expo SQLite migrations must be bundled into JS; unlike the desktop main
// process, mobile runtime cannot read the Drizzle migration folder directly.
// The initial schema stores only MCP tool bindings; 0001 adds the installed
// Skill library and per-Agent Skill bindings.
// Keep this module in the dependency graph when editing imported `.sql` files:
// Metro/Babel inline-import can otherwise serve stale inlined SQL from cache.
export const migrations = {
  journal,
  migrations: {
    m0000,
    m0001,
  },
};
