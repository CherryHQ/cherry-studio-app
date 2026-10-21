import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { eq } from 'drizzle-orm';

import {
  agentTable,
  agentToolBindingTable,
  mcpServerTable,
  userModelTable,
  userProviderTable,
} from '@/backend/data/db/schemas';
import { createTestDb, type TestDb } from '@/backend/data/services/__tests__/_testDb';
import { installProviderRegistryTestSnapshot } from '@/backend/data/services/providerRegistryTestSnapshot';

import { type AgentSetup, parseConfiguration } from '../enterpriseConfiguration';
import { projectConfiguration } from '../projectConfiguration';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

const raw = {
  serverUniqueId: 'server-1',
  apiKey: 'gateway-key',
  providers: [
    { provider_id: 'openai', type: 'openai', name: 'OpenAI', apiHost: 'https://gw.example.com' },
    { provider_id: 'claude', type: 'anthropic', name: 'Claude', apiHost: 'https://gw.example.com' },
  ],
  models: [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
    { id: 'sonnet', name: 'Sonnet', provider: 'claude' },
  ],
  mcpServers: [
    { id: 'search', name: 'Search', type: 'streamableHttp', baseUrl: 'https://mcp.example.com' },
  ],
};

const agent = (remoteId: string, model = 'openai::gpt-4o@openai'): AgentSetup => ({
  agent: {
    remoteId,
    name: `Agent ${remoteId}`,
    instructions: 'Hidden prompt',
    avatar: null,
    model: model as AgentSetup['agent']['model'],
    toolApprovalMode: 'default',
    skillRemoteIds: [],
    mcpServerRemoteIds: ['search'],
  },
  skills: [],
  mcpServers: [],
});

describe('projectConfiguration', () => {
  let db: TestDb;

  beforeEach(() => {
    installProviderRegistryTestSnapshot();
    db = createTestDb(new DatabaseSync(':memory:'));
  });

  const project = (input: unknown, agents: AgentSetup[]) =>
    db.dbService.withWriteTx((tx) =>
      projectConfiguration(tx, {
        configuration: parseConfiguration(input, []),
        agents,
        publishedSkills: [],
        skillRemoteIds: new Set(),
      }),
    );

  it('writes the gateway key into every provider and binds Agents to managed servers', async () => {
    await project(raw, [agent('1')]);
    const providers = await db.database.select().from(userProviderTable);
    expect(providers.map((provider) => provider.apiKeys?.[0]?.key)).toEqual([
      'gateway-key',
      'gateway-key',
    ]);
    const [server] = await db.database.select().from(mcpServerTable);
    expect(server).toMatchObject({
      managedRemoteId: 'search',
      endpointUrl: 'https://mcp.example.com/',
    });
    const bindings = await db.database.select().from(agentToolBindingTable);
    expect(bindings).toEqual([expect.objectContaining({ mcpServerId: server!.id })]);
  });

  it('keeps the user’s choices on a managed Agent across syncs', async () => {
    await project(raw, [agent('1')]);
    await db.database
      .update(agentTable)
      .set({ model: 'claude::sonnet@claude', toolApprovalMode: 'auto' })
      .where(eq(agentTable.managedRemoteId, '1'));
    await project(raw, [{ ...agent('1'), agent: { ...agent('1').agent, name: 'Renamed' } }]);
    const [row] = await db.database.select().from(agentTable);
    expect(row).toMatchObject({
      name: 'Renamed',
      model: 'claude::sonnet@claude',
      toolApprovalMode: 'auto',
    });
  });

  it('deletes removed resources and detaches a removed Agent into a user Agent', async () => {
    await project(raw, [agent('1')]);
    await project(
      { ...raw, providers: [raw.providers[0]], models: [raw.models[0]], mcpServers: [] },
      [],
    );
    expect(
      await db.database.select({ id: userProviderTable.providerId }).from(userProviderTable),
    ).toEqual([{ id: 'openai' }]);
    expect(await db.database.select({ id: userModelTable.id }).from(userModelTable)).toEqual([
      { id: 'openai::gpt-4o@openai' },
    ]);
    expect(await db.database.select().from(mcpServerTable)).toEqual([]);
    const [detached] = await db.database.select().from(agentTable);
    expect(detached).toMatchObject({ name: 'Agent 1', managedRemoteId: null, instructions: '' });
    expect(await db.database.select().from(agentToolBindingTable)).toEqual([]);
  });
});
