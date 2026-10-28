import { parseAgentSetup, parseConfiguration, type SkipLog } from '../enterpriseConfiguration';

const configuration = {
  serverUniqueId: 'server-1',
  apiKey: ' gateway-key ',
  providers: [
    { provider_id: 'openai', type: 'openai', name: 'OpenAI', apiHost: 'https://gw.example.com/v1' },
    {
      provider_id: 'azure',
      type: 'azure-openai',
      name: 'Azure',
      apiHost: 'https://azure.example.com',
    },
  ],
  models: [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', capabilities: ['vision', 'unknown'] },
    { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'azure' },
    { id: 'broken', provider: 'openai' },
  ],
  mcpServers: [
    {
      id: 'search',
      name: 'Search',
      type: 'streamableHttp',
      baseUrl: 'https://mcp.example.com/mcp',
    },
    { id: 'local', name: 'Local', type: 'stdio', command: 'npx' },
  ],
  agents: [{ id: 7 }],
  defaultAssistantModel: { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'azure' },
  settings: [{ key: 'sync_interval', value: '30' }],
};

describe('enterprise configuration', () => {
  it('keeps what Mobile can run and skips the rest item by item', () => {
    const skipped: SkipLog = [];
    const parsed = parseConfiguration(configuration, skipped);

    expect(parsed.apiKey).toBe('gateway-key');
    expect(parsed.syncIntervalMinutes).toBe(30);
    expect(parsed.providers.map((provider) => provider.providerId)).toEqual(['openai']);
    expect(parsed.providers[0]!.models).toEqual([
      expect.objectContaining({
        id: 'openai::gpt-4o@openai',
        modelId: 'gpt-4o@openai',
        capabilities: ['image-recognition'],
      }),
    ]);
    expect(parsed.mcpServers.map((server) => server.remoteId)).toEqual(['search']);
    expect(parsed.providerIds).toEqual(['openai', 'azure']);
    expect(parsed.modelIds).toContain('openai::broken@openai');
    expect(parsed.mcpServerRemoteIds).toEqual(['search', 'local']);
    // Keep the organization's choice even when this device cannot use it.
    expect(parsed.defaults['agent.default_model_id']).toBe('azure::gpt-4.1@azure');
    expect(skipped).toEqual(
      expect.arrayContaining([
        'provider azure: unsupported type azure-openai',
        'model: malformed entry',
        'mcp local: unsupported transport stdio',
      ]),
    );
  });

  it.each(['providers', 'models', 'agents', 'mcpServers'])(
    'rejects a missing or null %s inventory instead of treating it as a deletion',
    (key) => {
      for (const value of [undefined, null])
        expect(() => parseConfiguration({ ...configuration, [key]: value }, [])).toThrow();
    },
  );

  it('accepts explicit empty inventories as server removals', () => {
    expect(
      parseConfiguration(
        {
          ...configuration,
          providers: [],
          models: [],
          agents: [],
          mcpServers: [],
        },
        [],
      ),
    ).toMatchObject({ providerIds: [], modelIds: [], agentIds: [], mcpServerRemoteIds: [] });
  });

  it('preserves unavailable defaults for every purpose and rejects malformed references', () => {
    const selected = { id: 'unavailable', provider: 'azure' };
    const parsed = parseConfiguration(
      {
        ...configuration,
        defaultAssistantModel: selected,
        defaultTopicNamingModel: selected,
        defaultTranslationModel: selected,
      },
      [],
    );
    expect(Object.values(parsed.defaults)).toEqual(Array(3).fill('azure::unavailable@azure'));
    expect(() => parseConfiguration({ ...configuration, defaultAssistantModel: {} }, [])).toThrow();
  });

  it.each(['libraryItems', 'mcpServers'])(
    'rejects an incomplete Agent %s inventory before its bindings can change',
    (key) => {
      const agent = { id: 1, name: 'Agent', libraryItems: [], mcpServers: [] };
      for (const value of [undefined, null])
        expect(() =>
          parseAgentSetup(
            { agent: { ...agent, [key]: value }, tasks: [] },
            parseConfiguration(configuration, []),
            [],
          ),
        ).toThrow();
    },
  );

  it('rejects a snapshot whose remote identity inventory cannot be trusted', () => {
    expect(() =>
      parseConfiguration({ ...configuration, providers: [{ name: 'Missing ID' }] }, []),
    ).toThrow();
    expect(() =>
      parseAgentSetup(
        { agent: { id: 7, name: 'Broken' } },
        parseConfiguration(configuration, []),
        [],
      ),
    ).toThrow();
  });

  it('keeps remote references separate from the configuration Mobile can run', () => {
    const skipped: SkipLog = [];
    const parsed = parseConfiguration(configuration, skipped);
    const setup = parseAgentSetup(
      {
        agent: {
          id: 7,
          name: 'Analyst',
          instructions: 'Secret prompt',
          models: [
            { model_id: 'gpt-4.1', provider: { provider_id: 'azure' } },
            { model_id: 'gpt-4o', provider: { provider_id: 'openai' } },
          ],
          configuration: {
            avatar: 'https://cdn.example.com/a.png',
            default_permission_mode: 'plan',
          },
          libraryItems: [
            { id: 3, type: 'agent_skill', status: 'ready' },
            { id: 4, type: 'future-skill', status: 'ready' },
          ],
          mcpServers: [{ key: 'local', config: { name: 'Local', type: 'stdio' } }],
        },
        tasks: [{ libraryItemId: 3, type: 'agent_skill', updatedAt: '2026-10-01' }],
      },
      parsed,
      skipped,
    );

    expect(setup.mcpServers).toEqual([]);
    expect(setup.mcpServerRemoteIds).toEqual(['local']);
    expect(setup.skillRemoteIds).toEqual(['3', '4']);
    expect(setup.skills.map((skill) => skill.remoteId)).toEqual(['3']);
    expect(setup.remoteId).toBe('7');
    expect(setup.agent).toEqual({
      name: 'Analyst',
      instructions: 'Secret prompt',
      avatar: null,
      model: 'openai::gpt-4o@openai',
      toolApprovalMode: 'default',
    });
    expect(
      parseAgentSetup(
        { agent: { id: 8, name: 'Lost', models: [], libraryItems: [], mcpServers: [] }, tasks: [] },
        parsed,
        skipped,
      ),
    ).toMatchObject({ remoteId: '8', agent: null });
  });
});
