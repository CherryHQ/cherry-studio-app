import * as z from 'zod';

import type { McpServerMutations } from '@/backend/data/api/handlers/mcpServers';
import { publishDataApiChanges } from '@/backend/data/dataApiChanges';
import type { McpServerService } from '@/backend/data/services/McpServerService';
import { DataApiError } from '@/shared/data/api/errors';
import { CreateMcpServerSchema, UpdateMcpServerSchema } from '@/shared/data/api/schemas/mcpServers';
import type { BuiltInToolCapabilityId } from '@/shared/data/types/builtInTool';
import type { McpServer } from '@/shared/data/types/mcpServer';

import { createCallErrorToolResult, type RuntimeTool, type RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export type McpManagementAccess = {
  servers: Pick<McpServerService, 'getById' | 'list'>;
  mutations: Pick<McpServerMutations, 'createServer' | 'updateServer'>;
};

const endpointSchema = z.url().refine((url) => /^https?:\/\//i.test(url), {
  message: 'Mobile MCP requires an HTTP or HTTPS Streamable HTTP endpoint.',
});
const nameSchema = z.string().trim().min(1).max(255);
const createSchema = CreateMcpServerSchema.extend({
  name: nameSchema,
  endpointUrl: endpointSchema,
});
const changesSchema = UpdateMcpServerSchema.extend({
  name: nameSchema.optional(),
  endpointUrl: endpointSchema.optional(),
});
const getSchema = z.strictObject({ server_id: z.uuidv4() });
const listSchema = z.strictObject({
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(50).default(20),
});
const updateSchema = getSchema.extend({
  expected_updated_at: z.iso.datetime(),
  changes: changesSchema.refine(
    (value) => Object.keys(value).length > 0,
    'Provide a field to change.',
  ),
});

/** A configuration receipt never returns custom headers, URL credentials or OAuth references. */
function serverRecord(server: McpServer) {
  const endpoint = server.endpointUrl ? new URL(server.endpointUrl) : null;
  return {
    id: server.id,
    name: server.name,
    origin: server.origin ?? 'remote',
    endpointOrigin: endpoint?.origin ?? null,
    hasEndpointQuery: Boolean(endpoint?.search),
    headerNames: Object.keys(server.headers ?? {}),
    usesOAuth: server.origin !== 'builtin' && Boolean(server.oauth),
    isEnabled: server.isEnabled,
    disabledTools: server.disabledTools,
    updatedAt: server.updatedAt,
  };
}

export function createMcpManagementTools(access: McpManagementAccess): RuntimeTool[] {
  function tool<T>(
    name: BuiltInToolCapabilityId,
    approval: 'auto' | 'ask',
    description: string,
    schema: z.ZodType<T>,
    execute: (input: T, signal: AbortSignal) => Promise<RuntimeToolResult>,
  ): RuntimeTool {
    return {
      ref: { source: 'builtin', capabilityId: name },
      providerName: name,
      displayName: name,
      description,
      approval,
      deferred: true,
      inputSchema: toRuntimeInputSchema(schema),
      async execute({ input, signal }) {
        const parsed = schema.safeParse(input);
        if (!parsed.success) return failure('mcp_invalid_input', z.prettifyError(parsed.error));
        signal.throwIfAborted();
        try {
          return await execute(parsed.data, signal);
        } catch (error) {
          signal.throwIfAborted();
          // Provider failures and configuration values may contain credentials; do not echo them.
          return failure(
            error instanceof DataApiError ? error.code : 'mcp_operation_unconfirmed',
            'The operation could not be confirmed. Read mcp_list_servers/mcp_get_server before retrying a write. On conflict, read the latest record and reconcile. Bundled plugin authorization must be managed in Plugins.',
          );
        }
      },
    };
  }
  return [
    tool(
      'mcp_list_servers',
      'auto',
      'List saved MCP connections, including disabled servers and bundled plugins, with credential-free metadata. Follow nextPage. Names may repeat: use exact ids, and resolve ambiguity before changing configuration.',
      listSchema,
      async ({ page, limit }) => {
        const { items } = await access.servers.list();
        const start = (page - 1) * limit;
        return {
          value: {
            servers: items.slice(start, start + limit).map(serverRecord),
            total: items.length,
            nextPage: start + limit < items.length ? page + 1 : null,
          },
          artifacts: [],
        };
      },
    ),
    tool(
      'mcp_get_server',
      'auto',
      'Read one saved MCP connection and its updatedAt before editing. Returns endpoint origin and header names, never full credential-bearing URLs, header values or OAuth references. Omitted fields in an update are preserved; do not reconstruct secrets from this metadata.',
      getSchema,
      async ({ server_id }) => ({
        value: { server: serverRecord(await access.servers.getById(server_id)) },
        artifacts: [],
      }),
    ),
    tool(
      'mcp_create_server',
      'ask',
      'Save a user-requested remote Streamable HTTP MCP connection using a name, complete HTTP/HTTPS endpointUrl and optional headers. Mobile does not run stdio commands, packages or local executables. Use only configuration supplied by the user or established by their requested setup. Omitted isEnabled saves disabled. This saves configuration without testing connectivity, completing OAuth, or binding any Agent. Do not invent credentials or repeat a successful create; inspect mcp_list_servers after an uncertain outcome. Bundled plugin setup and OAuth remain in the Plugins interface.',
      createSchema,
      async (input) => {
        const server = await access.mutations.createServer(input);
        publishDataApiChanges(['/mcp-servers', `/mcp-servers/${server.id}`]);
        return {
          value: { status: 'created', server: serverRecord(server), connectionVerified: false },
          artifacts: [],
        };
      },
    ),
    tool(
      'mcp_update_server',
      'ask',
      'Update a user-requested remote MCP configuration after mcp_get_server. Copy its updatedAt to expected_updated_at. Send only changed fields; headers replaces the complete header map, so omit it to preserve existing secrets. Cannot alter bundled plugin connections or mint OAuth grants. Changes invalidate the existing connection when needed and apply to later tool catalogs; success confirms saving, not connectivity or Agent binding. After an uncertain outcome inspect current state before another write.',
      updateSchema,
      async ({ server_id, expected_updated_at, changes }, signal) => {
        const current = await access.servers.getById(server_id);
        if (current.origin === 'builtin')
          return failure('mcp_builtin_connection', 'Manage bundled plugin connections in Plugins.');
        signal.throwIfAborted();
        const { server } = await access.mutations.updateServer(server_id, changes, {
          expectedUpdatedAt: expected_updated_at,
        });
        publishDataApiChanges(['/mcp-servers', `/mcp-servers/${server.id}`]);
        return {
          value: { status: 'updated', server: serverRecord(server), connectionVerified: false },
          artifacts: [],
        };
      },
    ),
  ];
}

function failure(code: string, message: string): RuntimeToolResult {
  return createCallErrorToolResult({ code, message, retryable: false, origin: 'tool' });
}
