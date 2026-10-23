import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import {
  agentGlobalSkillTable,
  agentSkillTable,
  agentTable,
  agentToolBindingTable,
  appStateTable,
  mcpServerTable,
  preferenceTable,
  userProviderTable,
} from '@/backend/data/db/schemas';
import { PreferenceService } from '@/backend/data/PreferenceService';
import { createTestDb, type TestDb } from '@/backend/data/services/__tests__/_testDb';
import { installProviderRegistryTestSnapshot } from '@/backend/data/services/providerRegistryTestSnapshot';
import { HttpError } from '@/backend/services/http';
import { LOCAL_PROFILE, setActiveProfile } from '@/shared/data/activeProfile';

import { EnterpriseSyncService } from '../EnterpriseSyncService';

const mockApi = {
  getConfiguration: jest.fn(),
  setupAgent: jest.fn(),
  downloadLibraryItem: jest.fn(),
};
const mockSkillStorage = {
  stage: jest.fn(async () => 'staging'),
  publish: jest.fn(async () => {}),
  discardStaging: jest.fn(),
};

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));
jest.mock('../../enterpriseApi', () => ({ createEnterpriseApi: () => mockApi }));
// Package validation has its own byte-level suites; this suite owns publication and its lifetime.
jest.mock('@/backend/services/skill', () => ({
  skillStorage: {
    stage: () => mockSkillStorage.stage(),
    publish: () => mockSkillStorage.publish(),
    discardStaging: (handle: string) => mockSkillStorage.discardStaging(handle),
  },
  SKILL_ARCHIVE_MAX_BYTES: 1024,
  readSkillArchive: jest.fn(),
  deriveSkillProfile: () => ({ declaredTools: [] }),
  validateSkillPackage: () => ({
    ok: true,
    package: {
      name: 'research',
      description: 'Research',
      author: null,
      version: null,
      tags: [],
      contentHash: 'directory-sha256:abc',
      manifest: [],
      invocation: { modelInvocable: true, userInvocable: true },
    },
  }),
}));

const configuration = {
  serverUniqueId: 'server-1',
  apiKey: 'gateway-key',
  providers: [
    { provider_id: 'openai', type: 'openai', name: 'OpenAI', apiHost: 'https://gw.example.com' },
  ],
  models: [{ id: 'chat', name: 'Chat', provider: 'openai' }],
  defaultAssistantModel: { id: 'chat', name: 'Chat', provider: 'openai' },
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('EnterpriseSyncService persistence and lifetime', () => {
  let db: TestDb;
  let preference: PreferenceService;
  let service: EnterpriseSyncService;
  const mcp = { invalidateServer: jest.fn() };
  const reportRejected = jest.fn();

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockApi.getConfiguration.mockResolvedValue(configuration);
    mockApi.setupAgent.mockResolvedValue({
      agent: {
        id: 1,
        name: 'Analyst',
        model: { model_id: 'chat', provider: { provider_id: 'openai' } },
        libraryItems: [{ id: 7, type: 'agent_skill', status: 'ready' }],
      },
      tasks: [{ libraryItemId: 7, type: 'agent_skill', updatedAt: 'revision-1' }],
    });
    mockApi.downloadLibraryItem.mockResolvedValue({
      data: new ArrayBuffer(0),
      contentType: 'text/markdown',
    });
    setActiveProfile({
      id: 'enterprise',
      address: 'https://enterprise.example.com',
      identity: { deployment: 'server-1', subject: 'user', authentication: 'password' },
    });
    installProviderRegistryTestSnapshot();
    db = createTestDb(new DatabaseSync(':memory:'));
    preference = new PreferenceService(db.dbService);
    await preference._doInit();
    service = new EnterpriseSyncService(db.dbService, preference, mcp);
    service.configure({
      getProductToken: async () => 'token',
      refuseProductToken: async () => {},
      reportRejected,
    });
  });

  afterEach(async () => {
    await service.stop();
    db.sqlite.close();
    setActiveProfile(LOCAL_PROFILE);
    jest.useRealTimers();
  });

  it.each(['defaults', 'commit'])(
    'rolls back resources, defaults, hash and cache after a %s failure, then retries the same snapshot',
    async (failure) => {
      if (failure === 'defaults') {
        db.sqlite.exec(
          "CREATE TRIGGER fail_defaults BEFORE INSERT ON preference WHEN NEW.key = 'feature.translate.model_id' BEGIN SELECT RAISE(ABORT, 'default write failed'); END;",
        );
      } else {
        db.failWriteTxCommit(new Error('commit failed'));
      }
      const observed: unknown[] = [];
      const listener = jest.fn(() =>
        observed.push({
          providers: db.sqlite.prepare('SELECT COUNT(*) AS count FROM user_provider').get(),
          state: db.sqlite.prepare('SELECT COUNT(*) AS count FROM app_state').get(),
        }),
      );
      preference.subscribeChange('agent.default_model_id')(listener);

      await expect(service.sync()).rejects.toThrow();
      expect(await db.database.select().from(userProviderTable)).toEqual([]);
      expect(await db.database.select().from(preferenceTable)).toEqual([]);
      expect(await db.database.select().from(appStateTable)).toEqual([]);
      expect(preference.readCached('agent.default_model_id')).toBeNull();
      expect(listener).not.toHaveBeenCalled();

      if (failure === 'defaults') db.sqlite.exec('DROP TRIGGER fail_defaults');
      await service.sync();
      expect(preference.readCached('agent.default_model_id')).toBe('openai::chat@openai');
      expect(await db.database.select().from(preferenceTable)).toHaveLength(3);
      expect(await service.hasSynced()).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(observed).toEqual([{ providers: { count: 1 }, state: { count: 1 } }]);
    },
  );

  it('rejects new sync while frozen and prevents a queued transaction from writing after freeze', async () => {
    let unfreeze = storageMutationGate.freeze();
    await expect(service.sync()).rejects.toMatchObject({ code: 'busy' });
    expect(mockApi.getConfiguration).not.toHaveBeenCalled();
    unfreeze();

    const blocked = deferred<void>();
    const queued = deferred<void>();
    const blocker = db.dbService.withWriteTx(() => blocked.promise);
    const originalWrite = db.dbService.withWriteTx.bind(db.dbService);
    const spy = jest.spyOn(db.dbService, 'withWriteTx').mockImplementation((work) => {
      queued.resolve();
      return originalWrite(work);
    });
    const syncing = service.sync();
    const rejected = expect(syncing).rejects.toMatchObject({ code: 'busy' });
    try {
      await queued.promise;
      expect(service.hasPendingStorageWork()).toBe(true);
      unfreeze = storageMutationGate.freeze();
      blocked.resolve();
      await blocker;
      await rejected;
      expect(await db.database.select().from(userProviderTable)).toEqual([]);
    } finally {
      blocked.resolve();
      unfreeze();
      spy.mockRestore();
    }
  });

  it('stop aborts requests, waits for actual settlement, and rejects later writes', async () => {
    const response = deferred<unknown>();
    mockApi.getConfiguration.mockReturnValueOnce(response.promise);
    const syncing = service.sync();
    const rejected = expect(syncing).rejects.toThrow();
    let stopped = false;
    const stopping = service.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(mockApi.getConfiguration.mock.calls[0]![0].aborted).toBe(true);
    expect(stopped).toBe(false);
    expect(service.hasPendingStorageWork()).toBe(true);
    response.resolve(configuration);
    await rejected;
    await stopping;
    expect(service.hasPendingStorageWork()).toBe(false);
    expect(await db.database.select().from(userProviderTable)).toEqual([]);
    await expect(service.sync()).rejects.toThrow();
  });

  it('applies the rest of the snapshot when one Agent setup fails, leaving that Agent as installed', async () => {
    mockApi.getConfiguration.mockResolvedValue({ ...configuration, agents: [{ id: 1 }] });
    await service.sync();
    const installed = {
      agents: await db.database.select().from(agentTable),
      skills: await db.database.select().from(agentSkillTable),
    };
    expect(installed.skills).toHaveLength(1);

    mockApi.getConfiguration.mockResolvedValue({
      ...configuration,
      providers: [{ ...configuration.providers[0], name: 'Renamed' }],
      agents: [{ id: 1 }, { id: 2 }],
    });
    mockApi.setupAgent.mockImplementation(async (id: number) => {
      if (id === 1) throw new HttpError('Unavailable', { kind: 'http', status: 503 });
      return {
        agent: {
          id: 2,
          name: 'Writer',
          model: { model_id: 'chat', provider: { provider_id: 'openai' } },
        },
        tasks: [],
      };
    });
    await service.sync();
    const [provider] = await db.database.select().from(userProviderTable);
    expect(provider!.name).toBe('Renamed');
    const agents = await db.database.select().from(agentTable);
    expect(agents.map(({ managedRemoteId }) => managedRemoteId).sort()).toEqual(['1', '2']);
    expect(agents.find(({ managedRemoteId }) => managedRemoteId === '1')).toEqual(
      installed.agents[0],
    );
    expect(await db.database.select().from(agentSkillTable)).toEqual(installed.skills);
    expect(reportRejected).not.toHaveBeenCalled();
  });

  it('commits resources for the first launch and installs Skill packages in the next attempt', async () => {
    mockApi.getConfiguration.mockResolvedValue({ ...configuration, agents: [{ id: 1 }] });
    await service.syncResources();
    expect(await service.hasSynced()).toBe(true);
    expect(mockApi.downloadLibraryItem).not.toHaveBeenCalled();
    expect(await db.database.select().from(agentTable)).toHaveLength(1);
    expect(await db.database.select().from(agentGlobalSkillTable)).toEqual([]);

    await service.sync();
    const [agent] = await db.database.select().from(agentTable);
    const [skill] = await db.database.select().from(agentGlobalSkillTable);
    expect(skill).toMatchObject({ managedRemoteId: '7' });
    expect(await db.database.select().from(agentSkillTable)).toEqual([
      expect.objectContaining({ agentId: agent!.id, skillId: skill!.id }),
    ]);
    await service.sync();
    expect(mockApi.downloadLibraryItem).toHaveBeenCalledTimes(1);
  });

  it('skips a Skill package the role may not download without refusing the session', async () => {
    mockApi.getConfiguration.mockResolvedValue({ ...configuration, agents: [{ id: 1 }] });
    mockApi.downloadLibraryItem.mockRejectedValue(
      new HttpError('Forbidden', { kind: 'http', status: 403 }),
    );
    await service.sync();
    expect(reportRejected).not.toHaveBeenCalled();
    expect(await db.database.select().from(agentTable)).toHaveLength(1);
    expect(await db.database.select().from(agentToolBindingTable)).toEqual([]);
    expect(await db.database.select().from(agentGlobalSkillTable)).toEqual([]);
  });

  it('discards completed staging after stop and never publishes its package', async () => {
    const staged = deferred<string>();
    const started = deferred<void>();
    mockApi.getConfiguration.mockResolvedValueOnce({ ...configuration, agents: [{ id: 1 }] });
    mockSkillStorage.stage.mockImplementationOnce(() => {
      started.resolve();
      return staged.promise;
    });
    const syncing = service.sync();
    const rejected = expect(syncing).rejects.toThrow();
    await started.promise;
    const stopping = service.stop();
    staged.resolve('cancelled-stage');
    await rejected;
    await stopping;
    expect(mockSkillStorage.discardStaging).toHaveBeenCalledWith('cancelled-stage');
    expect(mockSkillStorage.publish).not.toHaveBeenCalled();
    expect(await db.database.select().from(agentGlobalSkillTable)).toEqual([]);
  });

  it('keeps backup admission and stop pending through an accepted native package publication', async () => {
    const published = deferred<void>();
    const started = deferred<void>();
    mockApi.getConfiguration.mockResolvedValueOnce({ ...configuration, agents: [{ id: 1 }] });
    mockSkillStorage.publish.mockImplementationOnce(() => {
      started.resolve();
      return published.promise;
    });
    const syncing = service.sync();
    const rejected = expect(syncing).rejects.toThrow();
    await started.promise;
    let stopped = false;
    const stopping = service.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    expect(service.hasPendingStorageWork()).toBe(true);
    published.resolve();
    await rejected;
    await stopping;
    expect(mockSkillStorage.discardStaging).toHaveBeenCalledWith('staging');
    expect(await db.database.select().from(agentGlobalSkillTable)).toEqual([]);
    // Resources committed before the package; its row waits for a later attempt.
    expect(await service.hasSynced()).toBe(true);
  });

  it('retries a failed MCP invalidation even when the next snapshot has the same hash', async () => {
    const initial = {
      ...configuration,
      mcpServers: [
        { id: 'search', name: 'Search', type: 'http', baseUrl: 'https://search.example.com' },
      ],
    };
    mockApi.getConfiguration.mockResolvedValue(initial);
    await service.sync();
    const [server] = await db.database.select().from(mcpServerTable);
    mockApi.getConfiguration.mockResolvedValue({
      ...initial,
      mcpServers: [{ ...initial.mcpServers[0], name: 'Updated' }],
    });
    mcp.invalidateServer.mockImplementationOnce(() => {
      throw new Error('cache failed');
    });
    await service.sync();
    expect(mcp.invalidateServer).toHaveBeenCalledTimes(1);
    await service.sync();
    expect(mcp.invalidateServer).toHaveBeenCalledTimes(2);
    expect(mcp.invalidateServer).toHaveBeenLastCalledWith(server!.id);
  });

  it('rejects the account when an address belongs to a different deployment', async () => {
    mockApi.getConfiguration.mockResolvedValueOnce({
      ...configuration,
      serverUniqueId: 'other-server',
    });
    await expect(service.sync()).rejects.toThrow('different server');
    expect(reportRejected).toHaveBeenCalledTimes(1);
    expect(await service.hasSynced()).toBe(false);
  });
});
