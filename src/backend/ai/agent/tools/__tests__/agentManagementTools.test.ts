import { createAgentMemory } from '@/backend/services/agentMemory/createAgentMemory';
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
    delete: jest.fn(async () => ({ deleted: true })),
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
  const files = new Map<string, string>();
  const memory = createAgentMemory({
    storage: {
      read: async (id, key) => files.get(`${id}/${key}`) ?? null,
      replace: async (id, key, text) => {
        files.set(`${id}/${key}`, text);
      },
    },
    assertAgent: async () => {},
    assertWritable: () => {},
  });
  const tools = createAgentManagementTools(data, agent.id, memory);
  const invoke = (name: string, input: RuntimeJsonValue, signal = new AbortController().signal) => {
    const tool = tools.find((entry) => entry.providerName === name)!;
    return tool.execute({ input, signal, toolCallId: 'call-1', turnId: 'turn-1' });
  };
  return { data, invoke, tools, memory };
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
      soul: 'Write clearly.',
    });
    expect(data.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Writer',
      }),
    );
    expect(data.create.mock.calls[0][0].model).toBeUndefined();
    expect(data.create.mock.calls[0][0]).not.toHaveProperty('disabledCapabilities');
    expect(result.value).toMatchObject({
      status: 'created',
      agent: AgentToolRecordSchema.parse(agent),
      soul: { content: 'Write clearly.' },
    });
    expect(result.value).not.toHaveProperty('agent.avatar');
    expect(result.value).not.toHaveProperty('agent.avatarUri');
  });

  test('a guarded current-Agent update sends only changed fields and never creates a replacement', async () => {
    const { data, invoke, memory } = setup();
    const result = await invoke('agent_update', {
      agent_id: 'current',
      expected_updated_at: agent.updatedAt,
      changes: { soul: { content: 'Use plain language.', expected_version: 'missing' } },
    });
    expect(data.update).toHaveBeenCalledWith(agent.id, {}, { expectedUpdatedAt: agent.updatedAt });
    expect(data.create).not.toHaveBeenCalled();
    expect((await memory.read(agent.id, 'soul')).content).toBe('Use plain language.');
    expect(result.instructions?.text).toContain('Use plain language.');
  });

  test('passes an explicit model selection to creation and update', async () => {
    const { data, invoke } = setup();
    const model = 'provider::model';
    expect(
      await invoke('agent_create', { name: 'Writer', soul: 'Write clearly.', model }),
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
        await invoke('agent_create', { name: 'Writer', soul: 'Write clearly.', model }),
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

  test('creates and reads separate SOUL and USER documents with their current versions', async () => {
    const { data, invoke, memory } = setup();
    const result = await invoke('agent_create', {
      name: 'Writer',
      soul: 'A warm writing partner.',
      user: 'The user prefers short paragraphs.',
    });
    expect(result).not.toHaveProperty('failure');
    expect(data.create.mock.calls[0][0]).not.toHaveProperty('instructions');
    const read = await invoke('agent_get', { agent_id: 'current' });
    expect(read.value).toMatchObject({
      soul: await memory.read(agent.id, 'soul'),
      user: await memory.read(agent.id, 'user'),
    });
  });

  test('updates another Agent without leaking its persona into the current execution', async () => {
    const { data, invoke, memory } = setup();
    const otherId = '00000000-0000-4000-8000-000000000002';
    data.getById.mockResolvedValue({ ...agent, id: otherId });
    data.update.mockResolvedValue({ ...agent, id: otherId });
    const result = await invoke('agent_update', {
      agent_id: otherId,
      expected_updated_at: agent.updatedAt,
      changes: {
        soul: { content: 'A math tutor.', expected_version: 'missing' },
        user: { content: 'An advanced student.', expected_version: 'missing' },
      },
    });
    expect(result).not.toHaveProperty('failure');
    expect(result.instructions).toBeUndefined();
    expect((await memory.read(otherId, 'soul')).content).toBe('A math tutor.');
    expect((await memory.read(otherId, 'user')).content).toBe('An advanced student.');
    expect((await memory.read(agent.id, 'soul')).content).toBe('');
    expect((await memory.read(agent.id, 'user')).content).toBe('');
  });

  test('rejects stale USER replacements before changing metadata or SOUL', async () => {
    const { data, invoke, memory } = setup();
    await memory.write({
      agentId: agent.id,
      key: 'user',
      content: 'Fresh user context',
      expectedVersion: 'missing',
    });
    const result = await invoke('agent_update', {
      agent_id: 'current',
      expected_updated_at: agent.updatedAt,
      changes: {
        name: 'A stale edit',
        soul: { content: 'A stale persona', expected_version: 'missing' },
        user: { content: 'Stale user context', expected_version: 'missing' },
      },
    });
    expect(result).toMatchObject({ failure: { error: { code: 'agent_memory_conflict' } } });
    expect(data.update).not.toHaveBeenCalled();
    expect((await memory.read(agent.id, 'soul')).content).toBe('');
    expect((await memory.read(agent.id, 'user')).content).toBe('Fresh user context');
  });

  test('clears only requested identity files and refreshes the current persona', async () => {
    const { invoke, memory } = setup();
    const soul = await memory.write({
      agentId: agent.id,
      key: 'soul',
      content: 'Old persona',
      expectedVersion: 'missing',
    });
    const user = await memory.write({
      agentId: agent.id,
      key: 'user',
      content: 'Old user context',
      expectedVersion: 'missing',
    });
    await memory.write({
      agentId: agent.id,
      key: 'fact',
      content: 'A durable decision',
      expectedVersion: 'missing',
    });
    const result = await invoke('agent_update', {
      agent_id: 'current',
      expected_updated_at: agent.updatedAt,
      changes: {
        soul: { content: '', expected_version: soul.version },
        user: { content: '', expected_version: user.version },
      },
    });
    expect(result).not.toHaveProperty('failure');
    expect(result.instructions?.text).not.toContain('Old persona');
    expect(result.instructions?.text).not.toContain('Old user context');
    expect((await memory.read(agent.id, 'fact')).content).toBe('A durable decision');
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
      await invoke('agent_create', { name: 'Test', soul: '', avatar: '/private/file' }),
    ).toHaveProperty('failure');
    const controller = new AbortController();
    controller.abort(new Error('Stopped'));
    await expect(
      invoke('agent_create', { name: 'Test', soul: '' }, controller.signal),
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
      soul: { key: 'soul', content: '', version: 'missing', truncated: false },
      user: { key: 'user', content: '', version: 'missing', truncated: false },
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
