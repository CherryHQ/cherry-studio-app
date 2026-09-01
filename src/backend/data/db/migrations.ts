import m0000 from '../../../../migrations/sqlite-drizzle/0000_release_baseline.sql';
import m0001 from '../../../../migrations/sqlite-drizzle/0001_mcp-disabled-tools.sql';
import m0002 from '../../../../migrations/sqlite-drizzle/0002_file-entry-mobile-model.sql';
import m0003 from '../../../../migrations/sqlite-drizzle/0003_retire-oauth-provider-auth.sql';
import m0004 from '../../../../migrations/sqlite-drizzle/0004_agent-sessions.sql';
import m0005 from '../../../../migrations/sqlite-drizzle/0005_remove_legacy_chat.sql';
import m0006 from '../../../../migrations/sqlite-drizzle/0006_natural_blur.sql';
import m0007 from '../../../../migrations/sqlite-drizzle/0007_agent-tool-bindings.sql';
import m0008 from '../../../../migrations/sqlite-drizzle/0008_context-checkpoint.sql';
import m0009 from '../../../../migrations/sqlite-drizzle/0009_agent-tool-approval-mode.sql';
import m0010 from '../../../../migrations/sqlite-drizzle/0010_remove-agent-settings.sql';
import m0011 from '../../../../migrations/sqlite-drizzle/0011_file-provenance.sql';
import m0012 from '../../../../migrations/sqlite-drizzle/0012_mcp-http-headers.sql';
import m0013 from '../../../../migrations/sqlite-drizzle/0013_agent-session-fork-lineage.sql';
import m0014 from '../../../../migrations/sqlite-drizzle/0014_agent-disabled-capabilities.sql';
import journal from '../../../../migrations/sqlite-drizzle/meta/_journal.json';

// Expo SQLite migrations must be bundled into JS; unlike the desktop main
// process, mobile runtime cannot read the Drizzle migration folder directly.
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
    m0006,
    m0007,
    m0008,
    m0009,
    m0010,
    m0011,
    m0012,
    m0013,
    m0014,
  },
};
