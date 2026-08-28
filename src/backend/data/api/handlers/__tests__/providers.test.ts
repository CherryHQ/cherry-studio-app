import type { ProviderService } from '@/backend/data/services/ProviderService';

import { createProviderHandlers } from '../providers';

describe('provider Data API handlers', () => {
  test('adapt ProviderService methods and unwrap API key results', async () => {
    const provider = { id: 'provider-1', name: 'Provider' };
    const apiKey = { id: 'key-1', isEnabled: true, key: 'secret' };
    const service = {
      create: jest.fn(async () => provider),
      delete: jest.fn(async () => undefined),
      getAuthConfig: jest.fn(async () => null),
      getByProviderId: jest.fn(async () => provider),
      list: jest.fn(async () => [provider]),
      listPage: jest.fn(async () => ({ items: [provider] })),
      listApiKeys: jest.fn(async () => ({ keys: [apiKey] })),
      replaceApiKeys: jest.fn(async () => provider),
      update: jest.fn(async () => provider),
      updateApiKey: jest.fn(async () => provider),
    };
    const handlers = createProviderHandlers(service as unknown as ProviderService);

    await handlers['/providers'].GET({ query: { enabled: true } });
    await handlers['/providers/page'].GET({ query: { limit: 20 } });
    await handlers['/providers'].POST({
      body: { name: 'Provider', providerId: 'provider-1' },
    });
    await handlers['/providers/:id'].GET({ params: { id: 'provider-1' } });
    await handlers['/providers/:id'].PATCH({
      body: { name: 'Renamed' },
      params: { id: 'provider-1' },
    });
    await handlers['/providers/:id'].DELETE({ params: { id: 'provider-1' } });
    await expect(
      handlers['/providers/:id/api-keys'].GET({
        params: { id: 'provider-1' },
        query: { enabled: true },
      }),
    ).resolves.toEqual([apiKey]);
    await handlers['/providers/:id/api-keys'].PUT({
      body: [apiKey],
      params: { id: 'provider-1' },
    });
    await handlers['/providers/:id/api-keys/:keyId'].PATCH({
      body: { isEnabled: false },
      params: { id: 'provider-1', keyId: 'key-1' },
    });
    await handlers['/providers/:id/auth'].GET({ params: { id: 'provider-1' } });

    expect(service.list).toHaveBeenCalledWith({ enabled: true });
    expect(service.listPage).toHaveBeenCalledWith({ limit: 20 });
    expect(service.create).toHaveBeenCalledWith({ name: 'Provider', providerId: 'provider-1' });
    expect(service.getByProviderId).toHaveBeenCalledWith('provider-1');
    expect(service.update).toHaveBeenCalledWith('provider-1', { name: 'Renamed' });
    expect(service.delete).toHaveBeenCalledWith('provider-1');
    expect(service.listApiKeys).toHaveBeenCalledWith('provider-1', { enabled: true });
    expect(service.replaceApiKeys).toHaveBeenCalledWith('provider-1', [apiKey]);
    expect(service.updateApiKey).toHaveBeenCalledWith('provider-1', 'key-1', {
      isEnabled: false,
    });
    expect(service.getAuthConfig).toHaveBeenCalledWith('provider-1');
  });
});
