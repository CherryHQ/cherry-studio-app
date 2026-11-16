import * as z from 'zod';

import { publishDataApiChanges } from '@/backend/data/dataApiChanges';
import type { AgentToolBindingService } from '@/backend/data/services/AgentToolBindingService';
import type { McpServerService } from '@/backend/data/services/McpServerService';
import type { AgentAvatars } from '@/backend/services/agents/createAgentAvatars';
import type { fileContent } from '@/backend/services/file/fileContent';
import { DataApiError, DataApiErrorFactory } from '@/shared/data/api/errors';
import {
  AgentToolRecordSchema,
  AgentToolTargetSchema,
} from '@/shared/data/types/agentManagementTool';
import type { BuiltInToolCapabilityId } from '@/shared/data/types/builtInTool';
import { FileEntryIdSchema } from '@/shared/data/types/file';
import { clampMcpToolApproval } from '@/shared/utils/agentToolApproval';

import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';
import type { WorkspaceFileAccess } from './workspaceFileAccess';

export type AgentConfigurationAccess = {
  avatars: Pick<AgentAvatars, 'setAvatar'>;
  bindings: Pick<AgentToolBindingService, 'list' | 'upsert' | 'delete'>;
  servers: Pick<McpServerService, 'list' | 'getById'>;
  files: Pick<typeof fileContent, 'resolve'>;
};

const avatarSchema = z.strictObject({
  agent_id: AgentToolTargetSchema,
  expected_updated_at: z.iso.datetime().describe('Copy updatedAt from a fresh agent_get.'),
  file_entry_id: FileEntryIdSchema.describe(
    'A managed image reference, never a device path or URL.',
  ),
});
const listSchema = z.strictObject({
  agent_id: AgentToolTargetSchema,
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(50).default(20),
});
const bindingSchema = z.strictObject({
  agent_id: AgentToolTargetSchema,
  server_id: z.uuidv4(),
  state: z.enum(['enabled', 'disabled', 'removed']),
  expected_binding_updated_at: z.iso
    .datetime()
    .nullable()
    .describe(
      'Copy binding.updatedAt from agent_list_mcp_servers; null means no server-wide binding existed.',
    ),
});

export function createAgentConfigurationTools(
  access: AgentConfigurationAccess,
  files: Pick<WorkspaceFileAccess, 'resolveEdit'>,
  currentAgentId?: string,
): RuntimeTool[] {
  function target(id: string) {
    if (id !== 'current') return id;
    if (!currentAgentId)
      throw DataApiErrorFactory.validation({ agent_id: ['Use an exact Agent id.'] });
    return currentAgentId;
  }
  function tool<T>(
    name: BuiltInToolCapabilityId,
    approval: 'auto' | 'ask',
    description: string,
    schema: z.ZodType<T>,
    execute: (input: T, signal: AbortSignal) => Promise<RuntimeToolResult['value']>,
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
        if (!parsed.success)
          return {
            value: {
              status: 'error',
              code: 'agent_invalid_input',
              message: z.prettifyError(parsed.error),
            },
            artifacts: [],
          };
        signal.throwIfAborted();
        try {
          return { value: await execute(parsed.data, signal), artifacts: [] };
        } catch (error) {
          signal.throwIfAborted();
          return {
            value: {
              status: 'error',
              code: error instanceof DataApiError ? error.code : 'agent_operation_unconfirmed',
              message:
                'The operation could not be confirmed. Read agent_get or agent_list_mcp_servers before retrying. Reconcile conflicts with the latest saved state; do not assume a write was not saved.',
            },
            artifacts: [],
          };
        }
      },
    };
  }
  return [
    tool(
      'agent_set_avatar',
      'ask',
      'Set a saved Cherry Agent’s avatar from a managed image explicitly attached to this conversation, generated in it, in its workspace, or read with library_read_file this turn. Never pass a device path or remote URL. Read agent_get first and copy updatedAt. The app normalizes and stores the avatar, updates the Agent, and removes the previous avatar only after saving. This does not edit or remove the source image. After an uncertain result inspect the Agent before another write.',
      avatarSchema,
      async ({ agent_id, expected_updated_at, file_entry_id }, signal) => {
        const agentId = target(agent_id);
        const id = await files.resolveEdit({ file_entry_id });
        const source = await access.files.resolve(id);
        if (!source || !source.entry.mediaType.startsWith('image/'))
          return {
            status: 'error',
            code: 'agent_avatar_image_required',
            message: 'Use an available managed image.',
          };
        signal.throwIfAborted();
        const agent = await access.avatars.setAvatar(
          agentId,
          { sourceUri: source.uri },
          { expectedUpdatedAt: expected_updated_at },
        );
        return { status: 'updated', agent: AgentToolRecordSchema.parse(agent) };
      },
    ),
    tool(
      'agent_list_mcp_servers',
      'auto',
      'List saved remote MCP servers and the target Agent’s server-wide bindings, including disabled connections and dangling bindings. Follow nextPage with the same Agent. Results contain server ids, enablement, binding versions and tool-override counts, never credentials. Bundled plugins are already available globally and need no Agent binding. Listing grants no tools; use agent_set_mcp_binding only when requested.',
      listSchema,
      async ({ agent_id, page, limit }) => {
        const agentId = target(agent_id);
        const [{ items: bindings }, { items: servers }] = await Promise.all([
          access.bindings.list(agentId),
          access.servers.list(),
        ]);
        const remote = servers.filter((server) => server.origin !== 'builtin');
        const builtInIds = new Set(
          servers.filter((server) => server.origin === 'builtin').map((server) => server.id),
        );
        const ids = [
          ...new Set([
            ...remote.map((server) => server.id),
            ...bindings
              .filter((binding) => !builtInIds.has(binding.serverId))
              .map((binding) => binding.serverId),
          ]),
        ];
        const start = (page - 1) * limit;
        return {
          servers: ids.slice(start, start + limit).map((id) => {
            const server = remote.find((item) => item.id === id);
            const rules = bindings.filter((binding) => binding.serverId === id);
            const binding = rules.find((item) => item.rawToolName === undefined);
            return {
              serverId: id,
              name: server?.name ?? binding?.displayNameSnapshot ?? null,
              serverExists: Boolean(server),
              serverEnabled: server?.isEnabled ?? false,
              binding: binding
                ? {
                    id: binding.id,
                    enabled: binding.enabled,
                    approval: binding.approval,
                    updatedAt: binding.updatedAt,
                  }
                : null,
              toolOverrideCount: rules.filter((item) => item.rawToolName !== undefined).length,
            };
          }),
          total: ids.length,
          nextPage: start + limit < ids.length ? page + 1 : null,
        };
      },
    ),
    tool(
      'agent_set_mcp_binding',
      'ask',
      'Bind, enable, disable or remove ONE saved remote MCP server for a Cherry Agent after agent_list_mcp_servers. Copy binding.updatedAt, or null if absent, to expected_binding_updated_at. Uses server-wide binding only; all other server bindings and per-tool overrides are preserved. New bindings start at ask, and existing deny rules are not promoted. Does not enable a disabled server, change credentials, authorize a plugin, or alter this turn’s frozen tool catalog. Bundled plugins are globally available and need no Agent binding.',
      bindingSchema,
      async ({ agent_id, server_id, state, expected_binding_updated_at }, signal) => {
        const agentId = target(agent_id);
        const { items } = await access.bindings.list(agentId);
        const previous = items.find(
          (binding) => binding.serverId === server_id && binding.rawToolName === undefined,
        );
        if ((previous?.updatedAt ?? null) !== expected_binding_updated_at)
          throw DataApiErrorFactory.conflict('The binding changed. Read the latest binding.');
        signal.throwIfAborted();
        if (state === 'removed') {
          if (previous)
            await access.bindings.delete(agentId, previous.id, {
              expectedUpdatedAt: previous.updatedAt,
            });
        } else {
          const server = await access.servers.getById(server_id);
          if (server.origin === 'builtin')
            return {
              status: 'error',
              code: 'agent_mcp_global_plugin',
              message:
                'Bundled plugins are available globally; manage their connection in Plugins.',
            };
          signal.throwIfAborted();
          await access.bindings.upsert(
            agentId,
            {
              source: 'mcp',
              serverId: server_id,
              enabled: state === 'enabled',
              approval: clampMcpToolApproval(previous?.approval ?? 'ask'),
              displayNameSnapshot: server.name,
            },
            { expectedUpdatedAt: expected_binding_updated_at },
          );
        }
        publishDataApiChanges([`/agents/${agentId}/tool-bindings`]);
        return {
          status: state === 'removed' ? 'removed' : 'updated',
          agentId,
          serverId: server_id,
          state,
          appliesToSubsequentTurns: true,
        };
      },
    ),
  ];
}
