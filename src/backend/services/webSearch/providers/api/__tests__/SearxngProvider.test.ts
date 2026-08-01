import type { WebSearchProvider } from '@cherrystudio/universal/data/preference';
import type { WebSearchExecutionConfig } from '@cherrystudio/universal/data/types/webSearch';

import { ApiKeyRotationState } from '../../../utils/provider';
import { SearxngProvider } from '../SearxngProvider';

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ warn: jest.fn() }),
  },
}));

const runtimeConfig: WebSearchExecutionConfig = {
  maxResults: 5,
  excludeDomains: [],
  compression: { method: 'none', cutoffLimit: 2000 },
};

describe('SearxngProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('keeps only http(s) result URLs', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          query: 'hello',
          results: [
            { title: 'Https', content: 'A', url: 'https://example.com/a' },
            { title: 'Http', content: 'B', url: 'http://example.com/b' },
            { title: 'Javascript', content: 'C', url: 'javascript:alert(1)' },
            { title: 'File', content: 'D', url: 'file:///etc/passwd' },
            { title: 'Relative', content: 'E', url: '/relative/path' },
            { title: 'Blank', content: 'F', url: '   ' },
            { title: 'Missing', content: 'G' },
          ],
        }),
        { status: 200 },
      ),
    );

    const provider = new SearxngProvider(createProvider(), new ApiKeyRotationState());
    const result = await provider.searchKeywords('hello', runtimeConfig);

    expect(result.results.map((item) => item.url)).toEqual([
      'https://example.com/a',
      'http://example.com/b',
    ]);
  });
});

function createProvider(): WebSearchProvider {
  return {
    id: 'searxng',
    name: 'Searxng',
    type: 'api',
    apiKeys: [],
    capabilities: [{ feature: 'searchKeywords', apiHost: 'http://localhost:8080' }],
    engines: [],
    basicAuthUsername: '',
    basicAuthPassword: '',
  };
}
