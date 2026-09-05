import { sliceByTokens } from 'tokenx';

import type { WebSearchExecutionConfig, WebSearchResult } from '@/shared/data/types/webSearch';

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

    expect(processed.response.results.map((item) => item.content)).toEqual(
      results.map((item) => {
        const sliced = sliceByTokens(item.content, 0, 4);
        return sliced.length < item.content.length ? `${sliced}...` : sliced;
      }),
    );
  });
});

function result(title: string, content: string): WebSearchResult {
  return {
    content,
    sourceInput: title,
    title,
    url: `https://example.com/${title.toLowerCase()}`,
  };
}
