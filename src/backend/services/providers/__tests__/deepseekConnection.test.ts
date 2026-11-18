import { getBaseUrl } from '@cherrystudio/ai-runtime/provider';

import { providerService } from '@/backend/data/services/ProviderService';
import type { Provider } from '@/shared/data/types/provider';

import {
  deepseekServiceBaseUrl,
  isDeepseekConfigured,
  resolveDeepseekConnection,
} from '../deepseekConnection';

jest.mock('@cherrystudio/ai-runtime/provider', () => ({ getBaseUrl: jest.fn() }));
jest.mock('@/backend/data/services/ProviderService', () => ({
  providerService: { getByProviderId: jest.fn(), resolveApiKey: jest.fn(), listApiKeys: jest.fn() },
}));

const provider = { id: 'deepseek', isEnabled: true, authType: 'api-key' } as Provider;

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(providerService.getByProviderId).mockResolvedValue(provider);
  jest
    .mocked(providerService.resolveApiKey)
    .mockResolvedValue({ value: 'first-key', apiKeySelection: { attribution: 'unknown' } });
  jest.mocked(getBaseUrl).mockReturnValue('https://api.deepseek.com/anthropic');
});

test('reads the model provider on every operation and isolates changed credentials and hosts', async () => {
  const signal = new AbortController().signal;
  const first = await resolveDeepseekConnection(signal);
  expect(first).toMatchObject({
    providerId: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    headers: { Authorization: 'Bearer first-key' },
  });
  jest
    .mocked(providerService.resolveApiKey)
    .mockResolvedValue({ value: 'updated-key', apiKeySelection: { attribution: 'unknown' } });
  jest.mocked(getBaseUrl).mockReturnValue('https://relay.example/deepseek/v1');
  const updated = await resolveDeepseekConnection(signal);
  expect(updated).toMatchObject({
    baseUrl: 'https://relay.example/deepseek',
    headers: { Authorization: 'Bearer updated-key' },
  });
  expect(updated.scope).not.toBe(first.scope);
  expect(providerService.resolveApiKey).toHaveBeenNthCalledWith(2, 'deepseek');
  expect(providerService.getByProviderId).toHaveBeenNthCalledWith(2, 'deepseek');
});

test('disabled providers cannot supply cloud credentials', async () => {
  jest.mocked(providerService.getByProviderId).mockResolvedValue({ ...provider, isEnabled: false });
  const signal = new AbortController().signal;
  await expect(isDeepseekConfigured(signal)).resolves.toBe(false);
  await expect(resolveDeepseekConnection(signal)).rejects.toMatchObject({ code: 'not-configured' });
  expect(providerService.resolveApiKey).not.toHaveBeenCalled();
});

test.each([
  ['https://api.deepseek.com/anthropic/v1/', 'https://api.deepseek.com'],
  ['https://api.deepseek.com/v1', 'https://api.deepseek.com'],
  ['https://relay.example/tenant/anthropic/v1', 'https://relay.example/tenant'],
])('derives a service root from %s without dropping a gateway prefix', (address, expected) => {
  expect(deepseekServiceBaseUrl(address)).toBe(expected);
});

test.each([
  'https://key@example.com',
  'https://example.com?key=secret',
  'https://example.com#fragment',
  'file:///tmp/key',
])('rejects an address carrying credentials or a non-HTTP scheme', (address) => {
  expect(() => deepseekServiceBaseUrl(address)).toThrow();
});
