import { eq, sql } from 'drizzle-orm';

import type { DbService } from '../db/DbService';
import { mcpServerTable } from '../db/schemas/mcpServer';
import { pluginAuthorizationTable } from '../db/schemas/pluginAuthorization';

/** Select metadata in SQL; credentials, account names, endpoints and headers are never read. */
export async function readDiagnosticPluginState(database: Pick<DbService, 'getDb'>) {
  const rows = await database
    .getDb()
    .select({
      serverId: mcpServerTable.id,
      origin: mcpServerTable.origin,
      pluginId: mcpServerTable.builtinId,
      enabled: mcpServerTable.isEnabled,
      authMethod: pluginAuthorizationTable.authMethod,
      disabledToolCount: sql<number>`json_array_length(${mcpServerTable.disabledTools})`,
    })
    .from(mcpServerTable)
    .leftJoin(
      pluginAuthorizationTable,
      eq(mcpServerTable.authorizationId, pluginAuthorizationTable.id),
    )
    .orderBy(mcpServerTable.id)
    .limit(201);
  return { connections: rows.slice(0, 200), truncated: rows.length > 200 };
}
