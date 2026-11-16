import type { ResolvedFile } from '@/shared/contracts/file';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { Agent } from '@/shared/data/types/agent';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import type { McpServer } from '@/shared/data/types/mcpServer';

import type { RuntimeToolCall } from '../../runtime';
import { createAgentConfigurationTools } from '../agentConfigurationTools';

const agentId = '00000000-0000-4000-8000-000000000001';
const serverId = '00000000-0000-4000-8000-000000000002';
const fileId = '00000000-0000-4000-8000-000000000003';
const version = '2026-01-01T00:00:00.000Z';
const agent: Agent = {
  id: agentId,
  name: 'Writer',
  instructions: 'x'.repeat(64_000),
  mode: 'standard',
  model: null,
  modelName: null,
  toolApprovalMode: 'default',
  disabledCapabilities: [],
  orderKey: 'a',
  createdAt: version,
  updatedAt: version,
  avatar: 'agent-avatar-file:private.webp',
  avatarUri: 'file:///private-avatar.webp',
};
const server: McpServer = {
  id: serverId,
  name: 'Example',
  endpointUrl: 'https://example.com/mcp?key=secret',
  headers: { Authorization: 'Bearer secret' },
  isEnabled: false,
  disabledTools: [],
  createdAt: version,
  updatedAt: version,
};
function binding(rawToolName?: string): AgentToolBinding {
  return {
    id: rawToolName ?? 'default',
    agentId,
    source: 'mcp',
    serverId,
    rawToolName,
    enabled: true,
    approval: 'deny',
    displayNameSnapshot: 'Example',
    createdAt: version,
    updatedAt: version,
  };
}
const call: RuntimeToolCall = {
  input: {},
  signal: new AbortController().signal,
  toolCallId: 'call',
  turnId: 'turn',
};
function fixture() {
  const access = {
    avatars: { setAvatar: jest.fn(async () => agent) },
    files: {
      resolve: jest.fn(
        async () =>
          ({
            uri: 'file:///managed-image.png',
            entry: { id: fileId, mediaType: 'image/png' },
          }) as ResolvedFile,
      ),
    },
    bindings: {
      list: jest.fn(async (): Promise<{ items: AgentToolBinding[] }> => ({ items: [] })),
      upsert: jest.fn(async () => binding()),
      delete: jest.fn(async () => ({ deleted: true as const })),
    },
    servers: {
      list: jest.fn(async () => ({ items: [server], total: 1, page: 1 })),
      getById: jest.fn(async () => server),
    },
  };
  const files = { resolveEdit: jest.fn(async () => fileId) };
  const tools = createAgentConfigurationTools(access, files, agentId);
  const run = (name: string, input: RuntimeToolCall['input']) =>
    tools.find((tool) => tool.providerName === name)!.execute({ ...call, input });
  return { access, files, run };
}

it('resolves an authorized source before the normal avatar workflow and hides all file paths', async () => {
  const f = fixture();
  const result = await f.run('agent_set_avatar', {
    agent_id: 'current',
    expected_updated_at: version,
    file_entry_id: fileId,
  });
  expect(f.files.resolveEdit).toHaveBeenCalledWith({ file_entry_id: fileId });
  expect(f.access.avatars.setAvatar).toHaveBeenCalledWith(
    agentId,
    { sourceUri: 'file:///managed-image.png' },
    { expectedUpdatedAt: version },
  );
  expect(result.value).toEqual({
    status: 'updated',
    agent: { id: agentId, name: agent.name, updatedAt: version },
  });
  expect(JSON.stringify(result).length).toBeLessThan(400);
  expect(JSON.stringify(result)).not.toContain('file:');
  expect(JSON.stringify(result)).not.toContain('private.webp');
});

it('cannot use an out-of-scope file or a non-image as an avatar', async () => {
  const f = fixture();
  f.files.resolveEdit.mockRejectedValueOnce(DataApiErrorFactory.invalidOperation('read_file'));
  await f.run('agent_set_avatar', {
    agent_id: 'current',
    expected_updated_at: version,
    file_entry_id: fileId,
  });
  expect(f.access.files.resolve).not.toHaveBeenCalled();
  f.access.files.resolve.mockResolvedValueOnce({
    uri: 'file:///notes.txt',
    entry: { id: fileId, mediaType: 'text/plain' },
  } as ResolvedFile);
  expect(
    (
      await f.run('agent_set_avatar', {
        agent_id: 'current',
        expected_updated_at: version,
        file_entry_id: fileId,
      })
    ).value,
  ).toMatchObject({ status: 'error', error: { code: 'agent_avatar_image_required' } });
  expect(f.access.avatars.setAvatar).not.toHaveBeenCalled();
});

it('lists binding versions and override counts without connection credentials', async () => {
  const f = fixture();
  f.access.bindings.list.mockResolvedValue({ items: [binding(), binding('write')] });
  const result = await f.run('agent_list_mcp_servers', { agent_id: 'current', limit: 1 });
  expect(result.value).toMatchObject({
    servers: [
      {
        serverId,
        serverEnabled: false,
        binding: { updatedAt: version, approval: 'deny' },
        toolOverrideCount: 1,
      },
    ],
    nextPage: null,
  });
  expect(JSON.stringify(result)).not.toContain('secret');
  expect(JSON.stringify(result)).not.toContain('endpointUrl');
});

it('creates one server binding at ask and preserves an existing deny when enabling it', async () => {
  const f = fixture();
  const input = {
    agent_id: 'current',
    server_id: serverId,
    state: 'enabled',
    expected_binding_updated_at: null,
  };
  await f.run('agent_set_mcp_binding', input);
  expect(f.access.bindings.upsert).toHaveBeenLastCalledWith(
    agentId,
    { source: 'mcp', serverId, enabled: true, approval: 'ask', displayNameSnapshot: 'Example' },
    { expectedUpdatedAt: null },
  );
  f.access.bindings.list.mockResolvedValue({ items: [binding(), binding('write')] });
  await f.run('agent_set_mcp_binding', { ...input, expected_binding_updated_at: version });
  expect(f.access.bindings.upsert).toHaveBeenLastCalledWith(
    agentId,
    { source: 'mcp', serverId, enabled: true, approval: 'deny', displayNameSnapshot: 'Example' },
    { expectedUpdatedAt: version },
  );
  expect(f.access.bindings.delete).not.toHaveBeenCalled();
});

it('removes only the server-wide binding, preserving per-tool rules and refusing stale versions', async () => {
  const f = fixture();
  f.access.bindings.list.mockResolvedValue({ items: [binding(), binding('write')] });
  const input = {
    agent_id: 'current',
    server_id: serverId,
    state: 'removed',
    expected_binding_updated_at: version,
  };
  expect(
    await f.run('agent_set_mcp_binding', { ...input, expected_binding_updated_at: null }),
  ).toMatchObject({ failure: { scope: 'call', error: { code: 'CONFLICT', retryable: false } } });
  expect(f.access.bindings.delete).not.toHaveBeenCalled();
  await f.run('agent_set_mcp_binding', input);
  expect(f.access.bindings.delete).toHaveBeenCalledWith(agentId, 'default', {
    expectedUpdatedAt: version,
  });
  expect(f.access.bindings.upsert).not.toHaveBeenCalled();
});

it('marks validation, known resource errors and uncertain writes as failed calls without leaking source details', async () => {
  const f = fixture();
  const input = { agent_id: 'current', expected_updated_at: version, file_entry_id: fileId };
  expect(
    await f.run('agent_set_avatar', { ...input, file_entry_id: '/private/image.png' }),
  ).toMatchObject({
    failure: { scope: 'call', error: { code: 'agent_invalid_input' } },
  });
  f.access.files.resolve.mockResolvedValueOnce({
    uri: 'file:///notes.txt',
    entry: { id: fileId, mediaType: 'text/plain' },
  } as ResolvedFile);
  expect(await f.run('agent_set_avatar', input)).toMatchObject({
    failure: { scope: 'call', error: { code: 'agent_avatar_image_required' } },
  });
  f.access.avatars.setAvatar.mockRejectedValueOnce(new Error('file:///private/secret.png'));
  const result = await f.run('agent_set_avatar', input);
  expect(result).toMatchObject({
    failure: { scope: 'call', error: { code: 'agent_operation_unconfirmed', retryable: false } },
  });
  expect(JSON.stringify(result)).not.toContain('/private/secret.png');
});
