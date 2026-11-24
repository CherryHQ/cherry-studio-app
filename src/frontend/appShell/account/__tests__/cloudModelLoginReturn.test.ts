import {
  clearCloudModelTap,
  consumeCloudModelTap,
  rememberCloudModelTap,
} from '../accountNavigation';

const mockCache = new Map<string, string | null>();
jest.mock('@/frontend/data/CacheService', () => ({
  cacheService: {
    getPersist: (key: string) => mockCache.get(key) ?? null,
    setPersist: (key: string, value: string | null) => mockCache.set(key, value),
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'tap-token' }));

test('only the original model and conversation may resume a tap, once', () => {
  const destination = '/?sessionId=chat&cloudAnswerMessage=message';
  rememberCloudModelTap(destination, 'amd/model');
  expect(consumeCloudModelTap('/?sessionId=other', 'amd/model', 'tap-token')).toBe(false);
  expect(consumeCloudModelTap(destination, 'other', 'tap-token')).toBe(false);
  expect(consumeCloudModelTap(destination, 'amd/model', 'wrong')).toBe(false);
  expect(consumeCloudModelTap(destination, 'amd/model', 'tap-token')).toBe(true);
  expect(consumeCloudModelTap(destination, 'amd/model', 'tap-token')).toBe(false);
});

test('cancelling login discards its pending model action', () => {
  const destination = '/settings/provider/cherryai-subscription';
  const href = rememberCloudModelTap(destination, 'model');
  expect(clearCloudModelTap(href)).toBe(true);
  expect(consumeCloudModelTap(destination, 'model', 'tap-token')).toBe(false);
});
