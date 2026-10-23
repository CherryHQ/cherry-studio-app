import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { eq } from 'drizzle-orm';

import {
  agentGlobalSkillTable,
  agentSessionTable,
  agentSkillTable,
  agentTable,
  agentToolBindingTable,
  mcpServerTable,
  userModelTable,
  userProviderTable,
} from '@/backend/data/db/schemas';
import { createTestDb, type TestDb } from '@/backend/data/services/__tests__/_testDb';
import { installProviderRegistryTestSnapshot } from '@/backend/data/services/providerRegistryTestSnapshot';

import { type AgentSetup, type ManagedAgent, parseConfiguration } from '../enterpriseConfiguration';
import { type PublishedSkill, projectConfiguration } from '../projectConfiguration';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

const raw = {
  serverUniqueId: 'server-1',
  apiKey: 'gateway-key',
  agents: [{ id: 1 }],
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

const agent = (
  remoteId: string,
  model = 'openai::gpt-4o@openai',
): AgentSetup & { agent: ManagedAgent } => ({
  remoteId,
  skillRemoteIds: [],
  mcpServerRemoteIds: ['search'],
  agent: {
    name: `Agent ${remoteId}`,
    instructions: 'Hidden prompt',
    avatar: null,
    model: model as ManagedAgent['model'],
    toolApprovalMode: 'default',
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

  afterEach(() => db.sqlite.close());

  const project = (input: unknown, agents: AgentSetup[], publishedSkills: PublishedSkill[] = []) =>
    db.dbService.withWriteTx((tx) =>
      projectConfiguration(tx, {
        configuration: parseConfiguration(input, []),
        agents,
        publishedSkills,
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
      {
        ...raw,
        agents: [],
        providers: [raw.providers[0]],
        models: [raw.models[0]],
        mcpServers: [],
      },
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
  it('preserves unsupported identities and conversations while removing truly withdrawn resources', async () => {
    const skill: PublishedSkill = {
      remoteId: '7',
      name: 'research',
      description: null,
      folderName: 'research',
      source: 'marketplace',
      sourceUrl: null,
      author: null,
      version: null,
      tags: [],
      contentHash: 'directory-sha256:abc',
      manifest: [],
      profile: { declaredTools: [] },
      invocation: { modelInvocable: true, userInvocable: true },
    };
    const initial = agent('1');
    initial.skillRemoteIds.push('7');
    await project(raw, [initial], [skill]);
    const [original] = await db.database.select().from(agentTable);
    await db.database
      .insert(agentSessionTable)
      .values({ agentId: original!.id, name: 'Existing history' });
    const [originalServer] = await db.database.select().from(mcpServerTable);
    const [originalSkill] = await db.database.select().from(agentGlobalSkillTable);

    const unsupported = {
      ...raw,
      providers: [{ ...raw.providers[0], type: 'desktop-only' }],
      models: [raw.models[0]],
      mcpServers: [{ ...raw.mcpServers[0], type: 'stdio' }],
    };
    await project(unsupported, [{ ...initial, agent: null, skills: [], mcpServers: [] }]);
    expect(await db.database.select().from(agentTable)).toEqual([original]);
    expect(await db.database.select().from(mcpServerTable)).toEqual([originalServer]);
    expect(await db.database.select().from(agentGlobalSkillTable)).toEqual([originalSkill]);
    expect(await db.database.select().from(agentSkillTable)).toEqual([
      expect.objectContaining({ agentId: original!.id, skillId: originalSkill!.id }),
    ]);
    expect(await db.database.select().from(agentToolBindingTable)).toEqual([
      expect.objectContaining({ agentId: original!.id, mcpServerId: originalServer!.id }),
    ]);
    expect(
      await db.database.select({ id: userProviderTable.providerId }).from(userProviderTable),
    ).toEqual([{ id: 'openai' }]);
    expect(await db.database.select({ id: userModelTable.id }).from(userModelTable)).toEqual([
      { id: 'openai::gpt-4o@openai' },
    ]);

    await project(raw, [initial]);
    expect(await db.database.select().from(agentTable)).toEqual([
      expect.objectContaining({
        id: original!.id,
        managedRemoteId: '1',
        instructions: 'Hidden prompt',
      }),
    ]);
    expect(await db.database.select().from(agentSessionTable)).toEqual([
      expect.objectContaining({ agentId: original!.id, name: 'Existing history' }),
    ]);

    // Revoking only one Agent's access must not be hidden by its unsupported model.
    const other = agent('2');
    other.skillRemoteIds.push('7');
    const shared = { ...raw, agents: [{ id: 1 }, { id: 2 }] };
    await project(shared, [initial, other]);
    const [beforeWithdrawal] = await db.database
      .select()
      .from(agentTable)
      .where(eq(agentTable.id, original!.id));
    const [otherRow] = await db.database
      .select()
      .from(agentTable)
      .where(eq(agentTable.managedRemoteId, '2'));
    const result = await project(shared, [
      { ...initial, agent: null, skillRemoteIds: [], mcpServerRemoteIds: [] },
      other,
    ]);
    const [afterWithdrawal] = await db.database
      .select()
      .from(agentTable)
      .where(eq(agentTable.id, original!.id));
    expect(afterWithdrawal).toEqual({ ...beforeWithdrawal, updatedAt: expect.any(Number) });
    expect(afterWithdrawal!.updatedAt).toBeGreaterThan(beforeWithdrawal!.updatedAt);
    expect(result.changedPaths).toContain(`/agents/${original!.id}`);
    expect(await db.database.select().from(mcpServerTable)).toEqual([originalServer]);
    expect(await db.database.select().from(agentGlobalSkillTable)).toEqual([originalSkill]);
    expect(await db.database.select().from(agentToolBindingTable)).toEqual([
      expect.objectContaining({ agentId: otherRow!.id, mcpServerId: originalServer!.id }),
    ]);
    expect(await db.database.select().from(agentSkillTable)).toEqual([
      expect.objectContaining({ agentId: otherRow!.id, skillId: originalSkill!.id }),
    ]);
    expect(await db.database.select().from(agentSessionTable)).toEqual([
      expect.objectContaining({ agentId: original!.id, name: 'Existing history' }),
    ]);

    // Detaching an Agent revokes its organization bindings even while others keep using them.
    await project(shared, [initial, other]);
    const remaining = { ...raw, agents: [{ id: 2 }] };
    await project(remaining, [other]);
    expect(await db.database.select().from(agentSkillTable)).toEqual([
      expect.objectContaining({ agentId: otherRow!.id, skillId: originalSkill!.id }),
    ]);
    expect(await db.database.select().from(agentToolBindingTable)).toEqual([
      expect.objectContaining({ agentId: otherRow!.id, mcpServerId: originalServer!.id }),
    ]);
    expect(await db.database.select().from(agentGlobalSkillTable)).toEqual([originalSkill]);
    expect(await db.database.select().from(mcpServerTable)).toEqual([originalServer]);

    // A global withdrawal also advances the version before the FK cascade can hide the binding.
    const [beforeGlobalWithdrawal] = await db.database
      .select()
      .from(agentTable)
      .where(eq(agentTable.id, otherRow!.id));
    await project({ ...remaining, mcpServers: [] }, [
      { ...other, agent: null, skillRemoteIds: [], mcpServerRemoteIds: [] },
    ]);
    const [afterGlobalWithdrawal] = await db.database
      .select()
      .from(agentTable)
      .where(eq(agentTable.id, otherRow!.id));
    expect(afterGlobalWithdrawal!.updatedAt).toBeGreaterThan(beforeGlobalWithdrawal!.updatedAt);

    await project({ ...raw, agents: [], mcpServers: [] }, []);
    expect(await db.database.select().from(agentGlobalSkillTable)).toEqual([]);
    expect(await db.database.select().from(mcpServerTable)).toEqual([]);
    expect(
      await db.database.select().from(agentTable).where(eq(agentTable.id, original!.id)),
    ).toEqual([
      expect.objectContaining({ id: original!.id, managedRemoteId: null, instructions: '' }),
    ]);
  });

  it('advances Agent and MCP row versions even within one wall-clock millisecond', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      await project(raw, [agent('1')]);
      const [beforeAgent] = await db.database.select().from(agentTable);
      const [beforeServer] = await db.database.select().from(mcpServerTable);
      await project({ ...raw, mcpServers: [{ ...raw.mcpServers[0], name: 'Changed' }] }, [
        agent('1'),
      ]);
      const [afterAgent] = await db.database.select().from(agentTable);
      const [afterServer] = await db.database.select().from(mcpServerTable);
      expect(afterAgent!.updatedAt).toBeGreaterThan(beforeAgent!.updatedAt);
      expect(afterServer!.updatedAt).toBeGreaterThan(beforeServer!.updatedAt);
    } finally {
      clock.mockRestore();
    }
  });
});
