import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import {
  agentGlobalSkillTable,
  appStateTable,
  mcpServerTable,
  preferenceTable,
  userProviderTable,
} from '@/backend/data/db/schemas';
import { PreferenceService } from '@/backend/data/PreferenceService';
import { createTestDb, type TestDb } from '@/backend/data/services/__tests__/_testDb';
import { installProviderRegistryTestSnapshot } from '@/backend/data/services/providerRegistryTestSnapshot';
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
jest.mock('../../account/AccountRuntime', () => ({ isAuthenticationRejection: () => false }));
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
    service.configure({ getProductToken: async () => 'token', reportRejected });
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

  it('joins the other setup requests when one fails instead of releasing backup admission early', async () => {
    const started = deferred<void>();
    const response = deferred<unknown>();
    mockApi.getConfiguration.mockResolvedValueOnce({
      ...configuration,
      agents: [{ id: 1 }, { id: 2 }],
    });
    mockApi.setupAgent.mockImplementation((id: number) => {
      if (id === 1) return Promise.reject(new Error('setup failed'));
      started.resolve();
      return response.promise;
    });
    const syncing = service.sync();
    const rejected = expect(syncing).rejects.toThrow('setup failed');
    await started.promise;
    await Promise.resolve();
    expect(service.hasPendingStorageWork()).toBe(true);
    response.resolve({ agent: { id: 2, name: 'No supported model' }, tasks: [] });
    await rejected;
    expect(await db.database.select().from(appStateTable)).toEqual([]);
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
    expect(await service.hasSynced()).toBe(false);
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
