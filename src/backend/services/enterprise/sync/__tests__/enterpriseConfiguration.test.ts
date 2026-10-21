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
    // An unavailable default falls back to the first chat model.
    expect(parsed.defaults['agent.default_model_id']).toBe('openai::gpt-4o@openai');
    expect(skipped).toEqual(
      expect.arrayContaining([
        'provider azure: unsupported type azure-openai',
        'model: malformed entry',
        'mcp local: unsupported transport stdio',
      ]),
    );
  });

  it('maps an Agent to one usable model and drops references Mobile cannot use', () => {
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
          libraryItems: [{ id: 3, type: 'agent_skill', status: 'ready' }],
          mcpServers: [{ key: 'local', config: { name: 'Local', type: 'stdio' } }],
        },
        tasks: [{ libraryItemId: 3, type: 'agent_skill', updatedAt: '2026-10-01' }],
      },
      parsed,
      skipped,
    );

    expect(setup?.agent).toEqual({
      remoteId: '7',
      name: 'Analyst',
      instructions: 'Secret prompt',
      avatar: null,
      model: 'openai::gpt-4o@openai',
      toolApprovalMode: 'default',
      skillRemoteIds: ['3'],
      mcpServerRemoteIds: [],
    });
    expect(
      parseAgentSetup({ agent: { id: 8, name: 'Lost', models: [] }, tasks: [] }, parsed, skipped),
    ).toBeNull();
  });
});
