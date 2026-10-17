import {
  WebSearchTransportError,
  type WebSearchHttpRequest,
  type WebSearchHttpResponse,
} from '@cherrystudio/web-search';
import { jina } from '@cherrystudio/web-search/providers/jina';

import { ApiKeyRotationState } from '@/backend/services/webSearch/utils/provider';
import { WEB_SEARCH_PROVIDER_PRESET_MAP } from '@/shared/data/presets/webSearchProviders';
import type { WebSearchProvider, WebSearchExecutionConfig } from '@/shared/data/types/webSearch';

import { JinaProvider } from '../JinaProvider';

const mockIsMainland = jest.fn(() => false);
jest.mock('@/backend/services/device', () => ({
  isDeviceRegionMainlandChina: () => mockIsMainland(),
}));

const config: WebSearchExecutionConfig = {
  compression: { cutoffLimit: 2000, method: 'none' },
  maxResults: 5,
};
const request = jest.fn<Promise<WebSearchHttpResponse>, [WebSearchHttpRequest]>();

beforeEach(() => {
  mockIsMainland.mockReturnValue(false);
  request.mockReset().mockResolvedValue({
    bodyText: JSON.stringify({ data: { content: 'Page' } }),
    headers: {},
    status: 200,
  });
});

test.each([false, true])(
  'selects built-in hosts using device region (mainland=%s)',
  async (mainland) => {
    mockIsMainland.mockReturnValue(mainland);
    const provider = createProvider(['key']);
    request.mockResolvedValueOnce({ bodyText: '{"data":[]}', headers: {}, status: 200 });
    await provider.searchKeywords('Cherry Studio', config);
    await provider.fetchUrls('https://example.com/a?b=1', config);
    expect(request.mock.calls.map(([call]) => call.url)).toEqual(
      mainland
        ? ['https://s.jinaai.cn/Cherry%20Studio', 'https://r.jinaai.cn/https://example.com/a?b=1']
        : ['https://s.jina.ai/Cherry%20Studio', 'https://r.jina.ai/https://example.com/a?b=1'],
    );
  },
);

test('retries an unreachable built-in host once with the same selected key', async () => {
  request.mockRejectedValueOnce(new WebSearchTransportError('network', 'offline'));
  const provider = createProvider(['first-key', 'second-key']);
  await expect(provider.fetchUrls('https://example.com', config)).resolves.toMatchObject({
    results: [{ content: 'Page' }],
  });
  await provider.fetchUrls('https://example.com', config);
  expect(request.mock.calls.map(([call]) => call.headers.Authorization)).toEqual([
    'Bearer first-key',
    'Bearer first-key',
    'Bearer second-key',
  ]);
  expect(request.mock.calls.map(([call]) => call.url)).toEqual([
    'https://r.jina.ai/https://example.com',
    'https://r.jinaai.cn/https://example.com',
    'https://r.jina.ai/https://example.com',
  ]);
});

test('also retries a keyword lookup only when its built-in host cannot be reached', async () => {
  request
    .mockRejectedValueOnce(new WebSearchTransportError('network', 'offline'))
    .mockResolvedValueOnce({ bodyText: '{"data":[]}', headers: {}, status: 200 });
  await expect(createProvider(['key']).searchKeywords('query', config)).resolves.toMatchObject({
    results: [],
  });
  expect(request.mock.calls.map(([call]) => call.url)).toEqual([
    'https://s.jina.ai/query',
    'https://s.jinaai.cn/query',
  ]);
});

test.each(['timeout', 'invalid_response'] as const)('does not retry %s failures', async (kind) => {
  request.mockRejectedValue(new WebSearchTransportError(kind, 'Failure'));
  await expect(createProvider([]).fetchUrls('https://example.com', config)).rejects.toMatchObject({
    kind,
  });
  expect(request).toHaveBeenCalledTimes(1);
});

test.each([401, 429, 503])('does not retry when the service answered HTTP %s', async (status) => {
  request.mockResolvedValue({ status, headers: {}, bodyText: '{"message":"Failure"}' });
  await expect(createProvider([]).fetchUrls('https://example.com', config)).rejects.toMatchObject({
    kind: 'http',
    status,
  });
  expect(request).toHaveBeenCalledTimes(1);
});

test('does not retry a custom host', async () => {
  mockIsMainland.mockReturnValue(true);
  request.mockRejectedValue(new WebSearchTransportError('network', 'offline'));
  await expect(
    createProvider([], 'https://reader.internal/').fetchUrls('https://example.com', config),
  ).rejects.toMatchObject({ kind: 'network' });
  expect(request.mock.calls.map(([call]) => call.url)).toEqual([
    'https://reader.internal/https://example.com',
  ]);
});

test('does not request either host after cancellation', async () => {
  await expect(
    createProvider([]).fetchUrls('https://example.com', config, { signal: AbortSignal.abort() }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(request).not.toHaveBeenCalled();
});

test('retains the longer page-rendering deadline and anonymous reader access', async () => {
  const signal = new AbortController().signal;
  await createProvider([]).fetchUrls('https://example.com', config, { signal });
  expect(request.mock.calls[0][0]).toMatchObject({ timeoutMs: 60_000, signal });
  expect(request.mock.calls[0][0].headers).not.toHaveProperty('Authorization');
});

function createProvider(apiKeys: string[], readerHost = 'https://r.jina.ai') {
  const provider: WebSearchProvider = {
    id: 'jina',
    ...WEB_SEARCH_PROVIDER_PRESET_MAP.jina,
    apiKeys,
    basicAuthPassword: '',
    basicAuthUsername: '',
    engines: [],
    capabilities: WEB_SEARCH_PROVIDER_PRESET_MAP.jina.capabilities.map((item) => ({
      ...item,
      ...(item.feature === 'fetchUrls' ? { apiHost: readerHost } : {}),
    })),
  };
  return new JinaProvider(provider, new ApiKeyRotationState(), jina, { request });
}
