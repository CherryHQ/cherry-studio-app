import { DatabaseSync } from 'node:sqlite';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { DataApiService } from '@/backend/data/DataApiService';
import { userModelTable } from '@/backend/data/db/schemas/userModel';
import { userProviderTable } from '@/backend/data/db/schemas/userProvider';
import { createTestDb } from '@/backend/data/services/__tests__/_testDb';
import { ModelService } from '@/backend/data/services/ModelService';
import { installProviderRegistryTestSnapshot } from '@/backend/data/services/providerRegistryTestSnapshot';
import { CLOUD_PROVIDER_ID } from '@/shared/contracts/cloud';
import { LOCAL_PROFILE, setActiveProfile } from '@/shared/data/activeProfile';
import { DataApiError, DataApiErrorFactory } from '@/shared/data/api/errors';
import type { ReorderModelsRequest } from '@/shared/data/api/schemas/models';
import type { ApiImplementation } from '@/shared/data/api/types';
import { createUniqueModelId } from '@/shared/data/types/model';

import { createModelHandlers } from '../models';

describe('model order batch handler', () => {
  let sqlite: DatabaseSync;
  let service: ModelService;
  let api: DataApiService;
  const id = (model: string, provider = 'p') => createUniqueModelId(provider, model);
  const patch = (body: unknown) =>
    api.patch('/models/order:batch', { body: body as ReorderModelsRequest });

  beforeEach(async () => {
    installProviderRegistryTestSnapshot();
    sqlite = new DatabaseSync(':memory:');
    const db = createTestDb(sqlite);
    await installTestHost({ DbService: db.dbService });
    for (const providerId of ['p', 'q', CLOUD_PROVIDER_ID]) {
      await db.database
        .insert(userProviderTable)
        .values({ providerId, name: providerId, orderKey: 'a0' });
      await db.database.insert(userModelTable).values(
        ['a', 'org/模型::variant', 'org/model/order'].map((modelId, index) => ({
          id: id(modelId, providerId),
          providerId,
          modelId,
          name: modelId,
          capabilities: [],
          supportsStreaming: true,
          orderKey: `a${index}`,
        })),
      );
    }
    service = new ModelService();
    api = new DataApiService(
      createModelHandlers(service, { filter: async (models) => [...models] }) as ApiImplementation,
    );
  });

  afterEach(async () => {
    setActiveProfile(LOCAL_PROFILE);
    jest.restoreAllMocks();
    await uninstallTestHost();
    sqlite.close();
  });

  it('dispatches the static batch command and returns undefined after persisting the move', async () => {
    await expect(
      patch({ moves: [{ id: id('org/模型::variant'), anchor: { before: id('a') } }] }),
    ).resolves.toBeUndefined();
    expect(
      sqlite.prepare('SELECT id FROM user_model WHERE provider_id = ? ORDER BY order_key').all('p'),
    ).toEqual(['org/模型::variant', 'a', 'org/model/order'].map((model) => ({ id: id(model) })));
  });

  it.each([
    [undefined, '_root'],
    [null, '_root'],
    [{}, 'moves'],
    [{ moves: [] }, 'moves'],
    [{ moves: [{ id: 'bad', anchor: { position: 'first' } }] }, 'moves.0.id'],
    ...[
      {},
      { before: '::invalid' },
      { after: 'p::' },
      { before: 'p::a', after: 'p::a' },
      { position: 'middle' },
    ].map((anchor) => [{ moves: [{ id: 'p::a', anchor }] }, 'moves.0.anchor'] as const),
    [
      {
        moves: [
          { id: 'p::a', anchor: { position: 'first' } },
          { id: 'p::a', anchor: { position: 'last' } },
        ],
      },
      'moves.1.id',
    ],
  ] as const)('normalizes malformed input %j to a field validation error', async (body, field) => {
    const error = await patch(body).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(DataApiError);
    expect(error).toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
      details: { fieldErrors: { [field]: expect.any(Array) } },
    });
  });

  it.each([
    ['target', { id: 'p::missing', anchor: { position: 'first' } }, 'p::missing'],
    ['missing anchor', { id: 'p::a', anchor: { before: 'p::missing' } }, 'p::missing'],
    ['foreign anchor', { id: 'p::a', anchor: { after: 'q::a' } }, 'q::a'],
  ])('preserves the scoped not-found shape for %s', async (_label, move, missing) => {
    await expect(patch({ moves: [move] })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      details: { resource: 'user_model', id: missing },
    });
  });

  it('preserves the helper self-anchor error', async () => {
    await expect(
      patch({ moves: [{ id: 'p::a', anchor: { before: 'p::a' } }] }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
      details: { fieldErrors: { anchor: expect.any(Array) } },
    });
  });

  it('returns a moves field error for mixed persisted providers', async () => {
    await expect(
      patch({
        moves: [
          { id: 'p::a', anchor: { position: 'last' } },
          { id: 'q::a', anchor: { position: 'last' } },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
      details: { fieldErrors: { moves: expect.any(Array) } },
    });
  });

  it.each(['cloud', 'enterprise'])('preserves the %s guard denial shape', async (policy) => {
    if (policy === 'enterprise') {
      setActiveProfile({
        id: 'enterprise',
        address: 'https://enterprise.test',
        identity: { deployment: 'test', subject: 'user', authentication: 'password' },
      });
    }
    await expect(
      patch({
        moves: [
          {
            id: id('a', policy === 'cloud' ? CLOUD_PROVIDER_ID : 'p'),
            anchor: { position: 'first' },
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_OPERATION',
      status: 400,
      details:
        policy === 'cloud'
          ? { operation: 'provider.edit', reason: 'managed by Cherry Cloud' }
          : { operation: 'model.reorderBatch', reason: 'managed by the enterprise server' },
    });
  });

  it('preserves existing DataApiError instances and normalizes unexpected failures', async () => {
    const body = { moves: [{ id: 'p::a', anchor: { position: 'first' } }] };
    const expected = DataApiErrorFactory.notFound('user_model', 'p::a');
    const reorder = jest.spyOn(service, 'reorderBatch').mockRejectedValueOnce(expected);
    await expect(patch(body)).rejects.toBe(expected);
    reorder.mockRejectedValueOnce(new Error('unexpected failure'));
    await expect(patch(body)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      status: 500,
      details: { context: 'model.reorderBatch', originalError: 'unexpected failure' },
    });
  });

  it('keeps metadata PATCH working for a model identity ending in /order', async () => {
    await expect(
      api.patch('/models/p::org/model/order', { body: { name: 'Renamed' } }),
    ).resolves.toMatchObject({
      id: 'p::org/model/order',
      name: 'Renamed',
    });
    expect(
      sqlite
        .prepare('SELECT name, order_key FROM user_model WHERE id = ?')
        .get('p::org/model/order'),
    ).toEqual({ name: 'Renamed', order_key: 'a2' });
  });
});
