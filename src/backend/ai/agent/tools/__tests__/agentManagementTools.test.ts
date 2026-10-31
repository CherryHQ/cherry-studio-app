import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { Agent } from '@/shared/data/types/agent';
import { AgentToolRecordSchema } from '@/shared/data/types/agentManagementTool';

import type { RuntimeJsonValue } from '../../runtime';
import { createAgentManagementTools, type AgentManagementData } from '../agentManagementTools';

const agent: Agent = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Writer',
  instructions: 'Write clearly.',
  mode: 'standard',
  model: null,
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
    listSkillBindings: jest.fn<
      ReturnType<AgentManagementData['listSkillBindings']>,
      Parameters<AgentManagementData['listSkillBindings']>
    >(async () => ({ items: [] })),
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
  return { data, invoke, tools };
}

describe('Agent management tools', () => {
  test('publishes concrete property types instead of the unions rejected by Gemini gateways', () => {
    const { tools } = setup();
    const schemas = Object.fromEntries(tools.map((tool) => [tool.providerName, tool.inputSchema]));
    expect(schemas.agent_create).toMatchObject({
      type: 'object',
      properties: { model: { type: 'string' } },
    });
    expect(schemas.agent_get).toMatchObject({
      properties: { agent_id: { type: 'string' } },
    });
    expect(schemas.agent_update).toMatchObject({
      properties: {
        agent_id: { type: 'string' },
        changes: {
          type: 'object',
          properties: {
            model: { type: 'string' },
            skills: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  skillId: { type: 'string' },
                  state: { type: 'string', enum: ['enabled', 'disabled', 'removed'] },
                },
              },
            },
          },
        },
      },
    });
    for (const schema of Object.values(schemas)) {
      expect(JSON.stringify(schema)).not.toMatch(/"(?:anyOf|oneOf)"/);
    }
  });

  test('creation leaves default-model resolution to storage without capability switches', async () => {
    const { data, invoke } = setup();
    const result = await invoke('agent_create', {
      name: ' Writer ',
      instructions: 'Write clearly.',
    });
    expect(data.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Writer',
      }),
    );
    expect(data.create.mock.calls[0][0].model).toBeUndefined();
    expect(data.create.mock.calls[0][0]).not.toHaveProperty('disabledCapabilities');
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

  test('passes an explicit model selection to creation and update', async () => {
    const { data, invoke } = setup();
    const model = 'provider::model';
    expect(
      await invoke('agent_create', { name: 'Writer', instructions: 'Write clearly.', model }),
    ).not.toHaveProperty('failure');
    expect(data.create).toHaveBeenCalledWith(expect.objectContaining({ model }));
    expect(
      await invoke('agent_update', {
        agent_id: 'current',
        expected_updated_at: agent.updatedAt,
        changes: { model },
      }),
    ).not.toHaveProperty('failure');
    expect(data.update).toHaveBeenCalledWith(
      agent.id,
      { model },
      { expectedUpdatedAt: agent.updatedAt },
    );
  });

  test.each(['', ' ', 'model', '::model', 'provider::', null, false, 0])(
    'rejects invalid model values before writing: %j',
    async (model) => {
      const { data, invoke } = setup();
      expect(
        await invoke('agent_create', { name: 'Writer', instructions: 'Write clearly.', model }),
      ).toHaveProperty('failure');
      expect(
        await invoke('agent_update', {
          agent_id: 'current',
          expected_updated_at: agent.updatedAt,
          changes: { model },
        }),
      ).toHaveProperty('failure');
      expect(data.create).not.toHaveBeenCalled();
      expect(data.update).not.toHaveBeenCalled();
    },
  );

  test('rejects an invented Agent id before reading', async () => {
    const { data, invoke } = setup();
    expect(await invoke('agent_get', { agent_id: 'invented' })).toHaveProperty('failure');
    expect(data.getById).not.toHaveBeenCalled();
  });

  test.each<Record<string, RuntimeJsonValue>>([
    { state: 'unknown' },
    { state: 'removed', isEnabled: true },
    { isEnabled: false },
  ])('rejects invalid or ambiguous Skill changes: %j', async (binding) => {
    const { data, invoke } = setup();
    expect(
      await invoke('agent_update', {
        agent_id: 'current',
        expected_updated_at: agent.updatedAt,
        changes: { skills: [{ skillId: '00000000-0000-4000-8000-000000000002', ...binding }] },
      }),
    ).toHaveProperty('failure');
    expect(data.update).not.toHaveBeenCalled();
  });

  test('reads bindings and passes only requested Skill changes to the guarded update', async () => {
    const { data, invoke } = setup();
    const skillId = '00000000-0000-4000-8000-000000000002';
    data.listSkillBindings.mockResolvedValue({
      items: [
        {
          agentId: agent.id,
          skillId,
          isEnabled: false,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
        },
      ],
    });
    expect((await invoke('agent_get', { agent_id: 'current' })).value).toMatchObject({
      skills: [{ skillId, state: 'disabled' }],
    });
    for (const [state, isEnabled] of [
      ['enabled', true],
      ['disabled', false],
      ['removed', null],
    ] as const) {
      await invoke('agent_update', {
        agent_id: 'current',
        expected_updated_at: agent.updatedAt,
        changes: { skills: [{ skillId, state }] },
      });
      expect(data.update).toHaveBeenLastCalledWith(
        agent.id,
        {},
        {
          expectedUpdatedAt: agent.updatedAt,
          skillUpdates: [{ skillId, isEnabled }],
        },
      );
    }
    const empty = await invoke('agent_update', {
      agent_id: 'current',
      expected_updated_at: agent.updatedAt,
      changes: { skills: [] },
    });
    expect(empty).toHaveProperty('failure');
    expect(data.update).toHaveBeenCalledTimes(3);
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
      skills: [],
    });
    expect((await invoke('agent_list', { search: 'Writer', page: 2 })).value).toEqual({
      items: [
        {
          id: agent.id,
          name: agent.name,
          model: null,
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
