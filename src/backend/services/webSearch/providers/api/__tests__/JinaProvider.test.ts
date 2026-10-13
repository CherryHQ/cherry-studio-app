import { HttpError } from '@/backend/services/http';
import { ApiKeyRotationState } from '@/backend/services/webSearch/utils/provider';
import type { WebSearchProvider, WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { JinaProvider } from '../JinaProvider';
import {
  createMockJsonRequester,
  type MockWebSearchJsonRequester,
} from './_webSearchJsonRequesterMocks';

const mockIsMainland = jest.fn(() => false);
jest.mock('@/backend/services/device', () => ({
  isDeviceRegionMainlandChina: () => mockIsMainland(),
}));

const config: WebSearchExecutionConfig = {
  compression: { cutoffLimit: 2000, method: 'none' },
  maxResults: 5,
};

describe('JinaProvider', () => {
  beforeEach(() => {
    mockIsMainland.mockReturnValue(false);
  });

  test('reads pages anonymously but requires a key to search', async () => {
    const requester = createMockJsonRequester({ data: { content: 'Example content' } });

    await createProvider([], requester).fetchUrls('https://example.com', config);
    expect(requester.mock.calls[0]?.[0].headers).not.toHaveProperty('Authorization');

    await expect(
      createProvider([], requester).searchKeywords('Cherry Studio', config),
    ).rejects.toMatchObject({ code: 'api_key_missing' });
  });

  test('uses a configured API key when available', async () => {
    const requester = createMockJsonRequester({ data: [] });

    await createProvider(['jina-key'], requester).searchKeywords('Cherry Studio', config);

    expect(requester.mock.calls[0]?.[0].headers).toHaveProperty('Authorization', 'Bearer jina-key');
  });

  test('uses the global hosts outside mainland China', async () => {
    const requester = createMockJsonRequester({});
    const provider = createProvider(['jina-key'], requester);

    await provider.searchKeywords('Cherry Studio', config);
    await provider.fetchUrls('https://example.com/a?b=1', config).catch(() => undefined);

    expect(requester.mock.calls.map(([request]) => request.url)).toEqual([
      'https://s.jina.ai/Cherry%20Studio',
      'https://r.jina.ai/https://example.com/a?b=1',
    ]);
  });

  test('uses the mainland mirror when the device is set up for mainland China', async () => {
    mockIsMainland.mockReturnValue(true);
    const requester = createMockJsonRequester({});
    const provider = createProvider(['jina-key'], requester);

    await provider.searchKeywords('Cherry Studio', config);
    await provider.fetchUrls('https://example.com', config).catch(() => undefined);

    expect(requester.mock.calls.map(([request]) => request.url)).toEqual([
      'https://s.jinaai.cn/Cherry%20Studio',
      'https://r.jinaai.cn/https://example.com',
    ]);
  });

  test('tries the other built-in host once when the first cannot be reached', async () => {
    const requester = createMockJsonRequester({ data: { content: 'Page' } });
    requester.mockRejectedValueOnce(new HttpError('Network Error', { kind: 'network' }));

    const response = await createProvider([], requester).fetchUrls('https://example.com', config);

    expect(requester.mock.calls.map(([request]) => request.url)).toEqual([
      'https://r.jina.ai/https://example.com',
      'https://r.jinaai.cn/https://example.com',
    ]);
    expect(response.results[0]?.content).toBe('Page');
  });

  test.each([
    [
      'the service answered',
      new HttpError('Unauthorized', { kind: 'http', status: 401 }),
      undefined,
    ],
    ['the request timed out', new HttpError('Timed out', { kind: 'timeout' }), undefined],
    [
      'the caller cancelled',
      new HttpError('Network Error', { kind: 'network' }),
      AbortSignal.abort(),
    ],
  ])('does not try the other host when %s', async (_case, error, signal) => {
    const requester = createMockJsonRequester({});
    requester.mockRejectedValue(error);

    await expect(
      createProvider([], requester).fetchUrls('https://example.com', config, { signal }),
    ).rejects.toBe(error);
    expect(requester).toHaveBeenCalledTimes(1);
  });

  test('leaves an address the user entered alone', async () => {
    mockIsMainland.mockReturnValue(true);
    const requester = createMockJsonRequester({});
    requester.mockRejectedValue(new HttpError('Network Error', { kind: 'network' }));

    await expect(
      createProvider([], requester, 'https://reader.internal/').fetchUrls(
        'https://example.com',
        config,
      ),
    ).rejects.toThrow('Network Error');

    expect(requester.mock.calls.map(([request]) => request.url)).toEqual([
      'https://reader.internal/https://example.com',
    ]);
  });

  test('gives remote page rendering a longer deadline than ordinary API requests', async () => {
    const requester = createMockJsonRequester({ data: { content: 'Page' } });
    const signal = new AbortController().signal;

    await createProvider([], requester).fetchUrls('https://example.com', config, { signal });

    expect(requester.mock.calls[0]?.[0]).toMatchObject({ timeoutMs: 60_000, signal });
  });
});

function createProvider(
  apiKeys: string[],
  requester: MockWebSearchJsonRequester,
  readerHost = 'https://r.jina.ai',
) {
  const provider: WebSearchProvider = {
    apiKeys,
    basicAuthPassword: '',
    basicAuthUsername: '',
    capabilities: [
      {
        apiHost: 'https://s.jina.ai',
        feature: 'searchKeywords',
        requiresApiHost: true,
        requiresApiKey: true,
      },
      {
        apiHost: readerHost,
        feature: 'fetchUrls',
        requiresApiHost: true,
        requiresApiKey: false,
      },
    ],
    engines: [],
    id: 'jina',
    name: 'Jina',
    type: 'api',
  };

  return new JinaProvider(provider, new ApiKeyRotationState(), requester);
}
