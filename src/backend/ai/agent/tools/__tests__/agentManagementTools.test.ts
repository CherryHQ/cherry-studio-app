import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { Agent } from '@/shared/data/types/agent';
import { DEFAULT_DISABLED_AGENT_CAPABILITIES } from '@/shared/data/types/agentCapability';
import { AgentToolRecordSchema } from '@/shared/data/types/agentManagementTool';

import type { RuntimeJsonValue } from '../../runtime';
import { createAgentManagementTools, type AgentManagementData } from '../agentManagementTools';

const agent: Agent = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Writer',
  instructions: 'Write clearly.',
  modelId: null,
  modelName: null,
  avatar: null,
  avatarUri: null,
  disabledCapabilities: [],
  toolApprovalMode: 'auto',
  orderKey: 'a0',
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
};

function setup() {
  const data: jest.Mocked<AgentManagementData> = {
    create: jest.fn<
      ReturnType<AgentManagementData['create']>,
      Parameters<AgentManagementData['create']>
    >(async () => agent),
    getById: jest.fn<
      ReturnType<AgentManagementData['getById']>,
      Parameters<AgentManagementData['getById']>
    >(async () => agent),
    list: jest.fn<ReturnType<AgentManagementData['list']>, Parameters<AgentManagementData['list']>>(
      async () => ({ items: [agent], page: 1, total: 1 }),
    ),
    update: jest.fn<
      ReturnType<AgentManagementData['update']>,
      Parameters<AgentManagementData['update']>
    >(async () => agent),
  };
  const tools = createAgentManagementTools(data, agent.id);
  const invoke = (name: string, input: RuntimeJsonValue, signal = new AbortController().signal) => {
    const tool = tools.find((entry) => entry.providerName === name)!;
    return tool.execute({ input, signal, toolCallId: 'call-1', turnId: 'turn-1' });
  };
  return { data, invoke };
}

describe('Agent management tools', () => {
  test('creation leaves default-model resolution to storage and uses the manual form capability defaults', async () => {
    const { data, invoke } = setup();
    const result = await invoke('agent_create', {
      name: ' Writer ',
      instructions: 'Write clearly.',
    });
    expect(data.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Writer',
        disabledCapabilities: [...DEFAULT_DISABLED_AGENT_CAPABILITIES],
      }),
    );
    expect(data.create.mock.calls[0][0].modelId).toBeUndefined();
    expect(result.value).toEqual({ status: 'created', agent: AgentToolRecordSchema.parse(agent) });
    expect(result.value).not.toHaveProperty('agent.avatar');
    expect(result.value).not.toHaveProperty('agent.avatarUri');
  });

  test('a guarded current-Agent update sends only changed fields and never creates a replacement', async () => {
    const { data, invoke } = setup();
    await invoke('agent_update', {
      agent_id: 'current',
      expected_updated_at: agent.updatedAt,
      changes: { instructions: 'Use plain language.' },
    });
    expect(data.update).toHaveBeenCalledWith(
      agent.id,
      { instructions: 'Use plain language.' },
      { expectedUpdatedAt: agent.updatedAt },
    );
    expect(data.create).not.toHaveBeenCalled();
  });

  test('reports conflicts as failed tool calls so the model must read before retrying', async () => {
    const { data, invoke } = setup();
    data.update.mockRejectedValueOnce(DataApiErrorFactory.conflict('Changed'));
    const result = await invoke('agent_update', {
      agent_id: agent.id,
      expected_updated_at: agent.updatedAt,
      changes: { name: 'New name' },
    });
    expect(result).toMatchObject({ failure: { scope: 'call', error: { code: 'agent_conflict' } } });
    expect(data.update).toHaveBeenCalledTimes(1);
  });

  test('rejects empty edits, unknown fields and cancelled writes before mutating', async () => {
    const { data, invoke } = setup();
    expect(
      await invoke('agent_update', {
        agent_id: agent.id,
        expected_updated_at: agent.updatedAt,
        changes: {},
      }),
    ).toHaveProperty('failure');
    expect(
      await invoke('agent_create', { name: 'Test', instructions: '', avatar: '/private/file' }),
    ).toHaveProperty('failure');
    const controller = new AbortController();
    controller.abort(new Error('Stopped'));
    await expect(
      invoke('agent_create', { name: 'Test', instructions: '' }, controller.signal),
    ).rejects.toThrow('Stopped');
    expect(data.create).not.toHaveBeenCalled();
    expect(data.update).not.toHaveBeenCalled();
  });

  test('lists compact paginated records and resolves current without leaking avatar paths', async () => {
    const { data, invoke } = setup();
    data.getById.mockResolvedValueOnce({ ...agent, avatarUri: '/private/avatar' });
    expect((await invoke('agent_get', { agent_id: 'current' })).value).toEqual({
      agent: AgentToolRecordSchema.parse(agent),
    });
    expect((await invoke('agent_list', { search: 'Writer', page: 2 })).value).toEqual({
      items: [
        {
          id: agent.id,
          name: agent.name,
          modelId: null,
          modelName: null,
          updatedAt: agent.updatedAt,
        },
      ],
      page: 1,
      total: 1,
    });
    expect(data.list).toHaveBeenCalledWith({ search: 'Writer', page: 2, limit: 20 });
  });
});
