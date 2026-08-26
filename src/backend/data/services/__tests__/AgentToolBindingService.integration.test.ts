import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { AgentToolBindingSchema } from '@/shared/data/types/agentToolBinding';

import { agentService } from '../AgentService';
import { AgentToolBindingService } from '../AgentToolBindingService';
import { McpServerService } from '../McpServerService';
import { createTestDb, type TestDb } from './_testDb';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

describe('AgentToolBindingService', () => {
  let bindingService: AgentToolBindingService;
  let mcpServerService: McpServerService;
  let sqlite: DatabaseSync;
  let testDb: TestDb;

  beforeEach(async () => {
    sqlite = new DatabaseSync(':memory:');
    testDb = createTestDb(sqlite);
    await installTestHost({
      DbService: testDb.dbService,
      PreferenceService: { get: jest.fn(async () => null) } as unknown as PreferenceService,
    });
    bindingService = new AgentToolBindingService();
    mcpServerService = new McpServerService();
  });

  afterEach(async () => {
    await uninstallTestHost();
    sqlite.close();
  });

  it('upserts stable identities and resolves specific MCP overrides before server defaults', async () => {
    const agent = await agentService.create({ name: 'Researcher' });
    const server = await mcpServerService.create({
      endpointUrl: 'https://example.com/mcp',
      isEnabled: true,
      name: 'Example',
    });

    const serverDefault = await bindingService.upsert(agent.id, {
      displayNameSnapshot: 'Example',
      serverId: server.id,
      source: 'mcp',
    });
    const repeated = await bindingService.upsert(agent.id, {
      serverId: server.id,
      source: 'mcp',
    });
    expect(repeated.id).toBe(serverDefault.id);
    expect(repeated).toMatchObject({ approval: 'ask', displayNameSnapshot: 'Example' });
    expect((await bindingService.list(agent.id)).items).toHaveLength(1);

    const initialSpecific = await bindingService.upsert(agent.id, {
      rawToolName: 'write',
      serverId: server.id,
      source: 'mcp',
    });
    const specific = await bindingService.upsert(agent.id, {
      approval: 'deny',
      rawToolName: 'write',
      serverId: server.id,
      source: 'mcp',
    });
    expect(specific.id).toBe(initialSpecific.id);
    expect((await bindingService.list(agent.id)).items).toHaveLength(2);
    await expect(
      bindingService.resolveMcpTool(agent.id, {
        isToolAvailable: true,
        rawToolName: 'write',
        serverId: server.id,
      }),
    ).resolves.toMatchObject({
      approval: 'deny',
      availability: 'available',
      binding: { id: specific.id },
      enabled: true,
    });
    await expect(
      bindingService.resolveMcpTool(agent.id, {
        isToolAvailable: true,
        rawToolName: 'read',
        serverId: server.id,
      }),
    ).resolves.toMatchObject({
      approval: 'ask',
      availability: 'available',
      binding: { id: serverDefault.id },
    });
    await expect(
      bindingService.resolveMcpTool(agent.id, {
        isToolAvailable: false,
        rawToolName: 'read',
        serverId: server.id,
      }),
    ).resolves.toMatchObject({ availability: 'tool-unavailable', enabled: false });

    await expect(bindingService.delete(agent.id, specific.id)).resolves.toEqual({ deleted: true });
    expect((await bindingService.list(agent.id)).items.map((binding) => binding.id)).toEqual([
      serverDefault.id,
    ]);
    await expect(bindingService.delete(agent.id, specific.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rejects duplicate replacements and rolls the whole batch back on commit failure', async () => {
    const agent = await agentService.create({ name: 'Researcher' });
    const original = await bindingService.upsert(agent.id, {
      approval: 'auto',
      capabilityId: 'calendar.read',
      source: 'builtin',
    });

    await expect(
      bindingService.replace(agent.id, {
        bindings: [
          { capabilityId: 'calendar.read', source: 'builtin' },
          { capabilityId: 'calendar.read', source: 'builtin' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await bindingService.list(agent.id)).items.map((binding) => binding.id)).toEqual([
      original.id,
    ]);

    testDb.failWriteTxCommit(new Error('commit failed'));
    await expect(
      bindingService.replace(agent.id, {
        bindings: [{ approval: 'deny', capabilityId: 'files.read', source: 'builtin' }],
      }),
    ).rejects.toThrow('commit failed');
    expect((await bindingService.list(agent.id)).items).toEqual([original]);

    const replaced = await bindingService.replace(agent.id, {
      bindings: [{ approval: 'deny', capabilityId: 'files.read', source: 'builtin' }],
    });
    expect(replaced.items).toHaveLength(1);
    expect(replaced.items[0]).toMatchObject({ capabilityId: 'files.read' });
    expect(replaced.items[0]?.id).not.toBe(original.id);
  });

  it('retains and disables dangling bindings when their MCP server is deleted', async () => {
    const agent = await agentService.create({ name: 'Researcher' });
    const server = await mcpServerService.create({
      endpointUrl: 'https://example.com/mcp',
      isEnabled: true,
      name: 'Example',
    });
    const serverDefault = await bindingService.upsert(agent.id, {
      displayNameSnapshot: 'Example',
      serverId: server.id,
      source: 'mcp',
    });
    const initialSpecific = await bindingService.upsert(agent.id, {
      displayNameSnapshot: 'Write',
      rawToolName: 'write',
      serverId: server.id,
      source: 'mcp',
    });
    const specific = await bindingService.upsert(agent.id, {
      approval: 'deny',
      rawToolName: 'write',
      serverId: server.id,
      source: 'mcp',
    });
    expect(specific.id).toBe(initialSpecific.id);

    await mcpServerService.delete(server.id);

    const dangling = (await bindingService.list(agent.id)).items;
    expect(dangling).toHaveLength(2);
    expect(dangling).toEqual(
      expect.arrayContaining([
        { ...serverDefault, enabled: false, updatedAt: expect.any(String) },
        { ...specific, enabled: false, updatedAt: expect.any(String) },
      ]),
    );
    expect(() =>
      AgentToolBindingSchema.parse(JSON.parse(JSON.stringify(dangling[0]))),
    ).not.toThrow();
    await expect(
      bindingService.resolveMcpTool(agent.id, {
        isToolAvailable: true,
        rawToolName: 'write',
        serverId: server.id,
      }),
    ).resolves.toMatchObject({ availability: 'server-unavailable', enabled: false });

    await expect(
      bindingService.replace(agent.id, {
        bindings: [
          {
            approval: 'ask',
            displayNameSnapshot: 'Example',
            enabled: false,
            serverId: server.id,
            source: 'mcp',
          },
          {
            approval: 'deny',
            displayNameSnapshot: 'Write',
            enabled: false,
            rawToolName: 'write',
            serverId: server.id,
            source: 'mcp',
          },
        ],
      }),
    ).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: serverDefault.id }),
        expect.objectContaining({ id: specific.id }),
      ]),
    });
    await expect(
      bindingService.upsert(agent.id, {
        rawToolName: 'new-tool',
        serverId: server.id,
        source: 'mcp',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('forces new MCP bindings to start at ask and rejects auto approval writes', async () => {
    const agent = await agentService.create({ name: 'Researcher' });
    const server = await mcpServerService.create({
      endpointUrl: 'https://example.com/mcp',
      name: 'Example',
    });

    await expect(
      bindingService.upsert(agent.id, {
        approval: 'auto',
        serverId: server.id,
        source: 'mcp',
      } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      bindingService.upsert(agent.id, {
        approval: 'deny',
        serverId: server.id,
        source: 'mcp',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('keeps bindings through ordinary Agent edits and soft delete, then cascades hard cleanup', async () => {
    const first = await agentService.create({ name: 'First' });
    const second = await agentService.create({ name: 'Second' });
    const binding = await bindingService.upsert(first.id, {
      capabilityId: 'calendar.read',
      source: 'builtin',
    });

    await agentService.update(first.id, { name: 'Renamed' });
    await agentService.reorder(first.id, { after: second.id });
    await agentService.delete(first.id);

    expect(readBinding(sqlite, binding.id)).toMatchObject({ agent_id: first.id });
    await expect(
      bindingService.upsert(first.id, {
        capabilityId: 'calendar.write',
        source: 'builtin',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    sqlite.prepare('DELETE FROM agent WHERE id = ?').run(first.id);
    expect(readBinding(sqlite, binding.id)).toBeUndefined();
  });
});

function readBinding(database: DatabaseSync, id: string) {
  return database.prepare('SELECT id, agent_id FROM agent_tool_binding WHERE id = ?').get(id) as
    | { agent_id: string; id: string }
    | undefined;
}
