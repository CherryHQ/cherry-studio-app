import { estimateTokenCount } from 'tokenx';

import type {
  WebSearchExecutionConfig,
  WebSearchResponse,
  WebSearchResult,
} from '@/shared/data/types/webSearch';

import { postProcessWebSearchResponse } from '../postProcessing';

describe('web search post processing', () => {
  test('applies cutoff limits as tokens for English and Chinese content', async () => {
    const results = [
      result('English', 'alpha beta gamma delta epsilon zeta'),
      result('Chinese', '移动端网络搜索需要保持双端一致'),
    ];
    const config: WebSearchExecutionConfig = {
      compression: { cutoffLimit: 8, method: 'cutoff' },
      maxResults: 5,
    };

    const processed = await postProcessWebSearchResponse(
      {
        capability: 'searchKeywords',
        inputs: ['test'],
        providerId: 'jina',
        query: 'test',
        results,
      },
      config,
    );

    for (const item of processed.response.results) {
      expect(estimateTokenCount(item.content)).toBeLessThanOrEqual(4);
      expect(item.truncated).toBe(true);
    }
    expect(processed.response.results[0].content).toContain('alpha');
    expect(processed.response.results[0].content).not.toContain('epsilon');
    expect(processed.response.results[1].content).toBe('移动端网');
  });

  test.each(['none', 'cutoff'] as const)(
    'bounds fetch pages independently of search compression %s',
    async (method) => {
      const response = fetchResponse([
        result('First', '文'.repeat(4_001)),
        result('Second', '字'.repeat(4_001)),
      ]);
      const { response: processed } = await postProcessWebSearchResponse(response, {
        compression: { method, cutoffLimit: 8 },
        maxResults: 5,
      });

      expect(processed.results.map((item) => item.content.length)).toEqual([4_000, 4_000]);
      expect(processed.results.every((item) => item.truncated)).toBe(true);
      expect(response.results[0].content).toHaveLength(4_001);
    },
  );

  test('shares the fetch budget across a large URL batch', async () => {
    const response = fetchResponse(
      Array.from({ length: 20 }, (_, index) => result(`Page-${index}`, '文'.repeat(4_001))),
    );
    const { response: processed } = await postProcessWebSearchResponse(response, NO_COMPRESSION);

    expect(processed.results).toHaveLength(20);
    expect(processed.results.every((item) => item.content.length === 800 && item.truncated)).toBe(
      true,
    );
    expect(
      processed.results.reduce((total, item) => total + estimateTokenCount(item.content), 0),
    ).toBe(16_000);
  });

  test.each([
    ['numeric runs', '1'.repeat(30_000)],
    ['whitespace', `a${' '.repeat(30_000)}b`],
  ])('bounds %s that the token estimator undercounts', async (_label, content) => {
    const { response } = await postProcessWebSearchResponse(
      fetchResponse([result('Long', content)]),
      NO_COMPRESSION,
    );

    expect(response.results[0].content.length).toBeLessThanOrEqual(24_000);
    expect(response.results[0].truncated).toBe(true);
  });

  test('preserves complete pages and metadata at the limit', async () => {
    const response = fetchResponse([
      result('Short', 'Article text'),
      result('Boundary', '文'.repeat(4_000)),
    ]);
    const processed = await postProcessWebSearchResponse(response, NO_COMPRESSION);

    expect(processed.response).toEqual(response);
    expect(processed.response.results.every((item) => item.truncated === undefined)).toBe(true);
  });

  test('respects explicitly disabled search compression', async () => {
    const response: WebSearchResponse = {
      ...fetchResponse([result('Long', '文'.repeat(4_001))]),
      capability: 'searchKeywords',
    };
    expect((await postProcessWebSearchResponse(response, NO_COMPRESSION)).response).toBe(response);
  });

  test('does not exceed a search budget smaller than the result count', async () => {
    const response: WebSearchResponse = {
      ...fetchResponse([result('First', '文'), result('Second', '字')]),
      capability: 'searchKeywords',
    };
    const { response: processed } = await postProcessWebSearchResponse(response, {
      ...NO_COMPRESSION,
      compression: { method: 'cutoff', cutoffLimit: 1 },
    });
    expect(processed.results.map((item) => item.content)).toEqual(['', '']);
    expect(processed.results.every((item) => item.truncated)).toBe(true);
  });
});

const NO_COMPRESSION: WebSearchExecutionConfig = {
  compression: { method: 'none', cutoffLimit: 2_000 },
  maxResults: 5,
};

function fetchResponse(results: WebSearchResult[]): WebSearchResponse {
  return {
    capability: 'fetchUrls',
    inputs: results.map((item) => item.url),
    providerId: 'jina',
    results,
  };
}

function result(title: string, content: string): WebSearchResult {
  return {
    content,
    sourceInput: title,
    title,
    url: `https://example.com/${title.toLowerCase()}`,
  };
}
