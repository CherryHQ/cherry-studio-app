import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { PreferenceService } from '@/backend/data/PreferenceService';

import { AgentGlobalSkillService, type SkillInstallRecord } from '../AgentGlobalSkillService';
import { agentService } from '../AgentService';
import { createTestDb, type TestDb } from './_testDb';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

function record(
  name: string,
  locator: string,
  description = 'Draft a short brief',
): SkillInstallRecord {
  return {
    name,
    description,
    source: { registry: 'github', locator, url: null, revision: 'abc' },
    author: null,
    version: null,
    license: null,
    compatibility: null,
    tags: [],
    entryDigest: `entry-${name}`,
    packageDigest: `package-${name}`,
    manifest: [{ path: 'SKILL.md', size: 10, digest: 'd' }],
    profile: {
      packageDigest: `package-${name}`,
      provenance: 'analyzed',
      requirements: { platforms: null, execution: 'none', builtInTools: [], pluginTools: [] },
      workflowScope: null,
    },
    invocation: { modelInvocable: true, userInvocable: true },
  };
}

describe('AgentGlobalSkillService', () => {
  let service: AgentGlobalSkillService;
  let sqlite: DatabaseSync;
  let testDb: TestDb;

  beforeEach(async () => {
    sqlite = new DatabaseSync(':memory:');
    testDb = createTestDb(sqlite);
    await installTestHost({
      DbService: testDb.dbService,
      PreferenceService: { get: jest.fn(async () => null) } as unknown as PreferenceService,
    });
    service = new AgentGlobalSkillService();
  });

  afterEach(async () => {
    await uninstallTestHost();
    sqlite.close();
  });

  async function install(input: SkillInstallRecord, agentIds: string[] = []) {
    return testDb.dbService.withWriteTx(async (tx) => {
      const folderName = await service.allocateFolderNameTx(tx, input.name);
      return service.createTx(tx, input, folderName, agentIds);
    });
  }

  it('keeps same-named packages from different publishers distinct and searchable', async () => {
    const first = await install(record('brief', 'github:a/b/brief'));
    const second = await install(record('brief', 'github:c/d/brief', 'Weekly status summary'));
    expect(first.folderName).toBe('brief');
    expect(second.folderName).toBe('brief-2');
    await expect(install(record('brief', 'github:a/b/brief'))).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    const page = await service.list({ search: 'status', scope: 'library' });
    expect(page.items.map((item) => item.skill.id)).toEqual([second.id]);
    const wildcard = await service.list({ search: '%', scope: 'library' });
    expect(wildcard.items).toHaveLength(0);
  });

  it('paginates deterministically by name then id', async () => {
    for (const name of ['c-skill', 'a-skill', 'b-skill']) {
      await install(record(name, `github:x/y/${name}`));
    }
    const first = await service.list({ scope: 'library', limit: 2 });
    expect(first.items.map((item) => item.skill.name)).toEqual(['a-skill', 'b-skill']);
    expect(first.nextCursor).toBeDefined();
    const second = await service.list({ scope: 'library', limit: 2, cursor: first.nextCursor });
    expect(second.items.map((item) => item.skill.name)).toEqual(['c-skill']);
    expect(second.nextCursor).toBeUndefined();
  });

  it('scopes Agent and composer reads by binding, global enablement, and invocation policy', async () => {
    const agent = await agentService.create({ name: 'Writer' });
    const other = await agentService.create({ name: 'Other' });
    const bound = await install(record('bound', 'github:x/y/bound'), [agent.id]);
    const manual = await install(
      {
        ...record('manual', 'github:x/y/manual'),
        invocation: { modelInvocable: true, userInvocable: false },
      },
      [agent.id],
    );
    const unbound = await install(record('unbound', 'github:x/y/unbound'));
    const disabled = await install(record('disabled', 'github:x/y/disabled'), [agent.id]);
    await service.replaceBindings(agent.id, {
      updates: [{ skillId: disabled.id, isEnabled: false }],
    });

    const agentScope = await service.list({ scope: 'agent', agentId: agent.id });
    expect(
      agentScope.items.map((item) => [item.skill.id, item.binding?.isEnabled ?? null]),
    ).toEqual([
      [bound.id, true],
      [disabled.id, false],
      [manual.id, true],
      [unbound.id, null],
    ]);

    const composer = await service.list({ scope: 'composer', agentId: agent.id });
    expect(composer.items.map((item) => item.skill.id)).toEqual([bound.id]);
    expect(await service.listUsableForAgent(agent.id)).toMatchObject([
      { skill: { id: bound.id } },
      { skill: { id: manual.id } },
    ]);
    expect(await service.listUsableForAgent(other.id)).toEqual([]);

    // Global disable hides the Skill without rewriting the Agent's preference.
    await service.update(bound.id, { isGlobalEnabled: false });
    expect(await service.listUsableForAgent(agent.id)).toMatchObject([
      { skill: { id: manual.id } },
    ]);
    const preferences = (await service.listBindings(agent.id)).items.map(
      ({ skillId, isEnabled }) => [skillId, isEnabled] as const,
    );
    expect(new Map(preferences)).toEqual(
      new Map([
        [bound.id, true],
        [disabled.id, false],
        [manual.id, true],
      ]),
    );
  });

  it('applies binding updates in place, rejects missing Skills, and clears bindings on uninstall', async () => {
    const agent = await agentService.create({ name: 'Writer' });
    const first = await install(record('first', 'github:x/y/first'), [agent.id]);
    const second = await install(record('second', 'github:x/y/second'));
    const result = await service.replaceBindings(agent.id, {
      updates: [{ skillId: second.id, isEnabled: true }],
    });
    expect(result.items.map((item) => item.skillId).sort()).toEqual([first.id, second.id].sort());
    await service.replaceBindings(agent.id, { updates: [{ skillId: first.id, isEnabled: null }] });
    expect((await service.listBindings(agent.id)).items.map((item) => item.skillId)).toEqual([
      second.id,
    ]);
    await expect(
      service.replaceBindings(agent.id, {
        updates: [{ skillId: '00000000-0000-4000-8000-000000000009', isEnabled: true }],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await testDb.dbService.withWriteTx((tx) => service.tombstoneTx(tx, second.id));
    expect((await service.listBindings(agent.id)).items).toEqual([]);
    await expect(service.getById(second.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await service.findByLocator('github:x/y/second')).toBeNull();
    // The locator is free again after the tombstone.
    const reinstalled = await install(record('second', 'github:x/y/second'));
    expect(reinstalled.id).not.toBe(second.id);
    expect(reinstalled.folderName).toBe('second');
  });

  it('switches the accepted revision without changing identity or bindings', async () => {
    const agent = await agentService.create({ name: 'Writer' });
    const skill = await install(record('first', 'github:x/y/first'), [agent.id]);
    const updated = await testDb.dbService.withWriteTx((tx) =>
      service.updateRevisionTx(tx, skill.id, {
        ...record('first', 'github:x/y/first', 'Revised'),
        packageDigest: 'package-v2',
      }),
    );
    expect(updated).toMatchObject({
      id: skill.id,
      folderName: 'first',
      description: 'Revised',
      packageDigest: 'package-v2',
    });
    expect(await service.listUsableForAgent(agent.id)).toMatchObject([{ skill: { id: skill.id } }]);
    expect(await service.listStorageReferences()).toEqual([
      { folderName: 'first', packageDigest: 'package-v2' },
    ]);
  });
});
