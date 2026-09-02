import type { CherryMessagePart } from '@/shared/data/types/message';

import {
  enrichWebSources,
  getFaviconUrls,
  parseWebSources,
  resolveCitationWebSources,
} from '../webSource';

describe('webSource', () => {
  test('keeps result metadata without ever promoting an address to the page title', () => {
    expect(
      parseWebSources({
        results: [
          {
            content: 'A useful result summary.',
            date: '2026/09/01',
            favicon: 'https://example.com/icon.png',
            siteName: 'Example News',
            title: 'https://example.com/article',
            url: 'https://example.com/article',
          },
        ],
      }),
    ).toEqual([
      {
        content: 'A useful result summary.',
        faviconUrl: 'https://example.com/icon.png',
        id: 1,
        publishedDate: '2026-09-01',
        siteName: 'Example News',
        title: undefined,
        url: 'https://example.com/article',
      },
    ]);
  });

  test('fills final citation cards with metadata from the matching web-search result', () => {
    const parts = [
      {
        input: { query: 'Cherry Studio' },
        output: [
          {
            content: 'Cherry Studio is an AI client.',
            id: 'result-1',
            title: 'Cherry Studio',
            url: 'https://cherry-ai.com',
          },
        ],
        state: 'output-available',
        toolCallId: 'call-1',
        type: 'tool-web_search',
      },
      {
        sourceId: 'result-1',
        title: 'Cherry Studio',
        type: 'source-url',
        url: 'https://cherry-ai.com',
      },
    ] as CherryMessagePart[];

    expect(resolveCitationWebSources(parts)).toEqual([
      expect.objectContaining({
        content: 'Cherry Studio is an AI client.',
        id: 'result-1',
        siteName: 'Cherry Ai',
        title: 'Cherry Studio',
        url: 'https://cherry-ai.com',
      }),
    ]);
  });

  test('uses the persisted cited sentence when a result has no summary', () => {
    const parts = [
      {
        output: [
          {
            content: '',
            id: 'result-1',
            title: '文章标题 | 联合早报',
            url: 'https://www.zaobao.com.sg/news/story20260901-1234567',
          },
        ],
        state: 'output-available',
        toolCallId: 'call-1',
        type: 'tool-web_search',
      },
      {
        sourceId: 'result-1',
        title: '文章标题 | 联合早报',
        type: 'source-url',
        url: 'https://www.zaobao.com.sg/news/story20260901-1234567',
      },
      {
        text: '- 这是回答中与该引用直接相关的摘要。[cite:result-1]',
        type: 'text',
      },
    ] as CherryMessagePart[];

    expect(resolveCitationWebSources(parts)[0]).toEqual(
      expect.objectContaining({
        content: '这是回答中与该引用直接相关的摘要。',
      }),
    );
  });

  test('uses later fetched page metadata when the search result itself is sparse', () => {
    const searchOutput = [
      {
        content: '',
        id: 'search-1',
        title: '中国首部 AI 生成长剧开播 | 联合早报',
        url: 'https://www.zaobao.com.sg/news/story',
      },
    ];
    const parts = [
      {
        input: { query: '今日新闻' },
        output: searchOutput,
        state: 'output-available',
        toolCallId: 'search-call',
        type: 'tool-web_search',
      },
      {
        input: { url: 'https://www.zaobao.com.sg/news/story' },
        output: {
          content:
            'Title: 中国首部 AI 生成长剧开播 | 联合早报\nURL Source: https://www.zaobao.com.sg/final/story\nPublished Time: 2026-08-31T10:00:00Z\nMarkdown Content:\n这是抓取到的有效正文摘要。',
          sourceInput: 'https://www.zaobao.com.sg/news/story',
          title: '中国首部 AI 生成长剧开播 | 联合早报',
          url: 'https://www.zaobao.com.sg/final/story',
        },
        state: 'output-available',
        toolCallId: 'fetch-call',
        type: 'tool-web_fetch',
      },
      {
        sourceId: 'search-1',
        title: '中国首部 AI 生成长剧开播 | 联合早报',
        type: 'source-url',
        url: 'https://www.zaobao.com.sg/news/story',
      },
    ] as CherryMessagePart[];

    expect(enrichWebSources(parseWebSources(searchOutput), parts)[0]).toEqual(
      expect.objectContaining({
        content: '这是抓取到的有效正文摘要。',
        publishedDate: '2026-08-31',
        siteName: '联合早报',
      }),
    );
    expect(resolveCitationWebSources(parts)[0]).toEqual(
      expect.objectContaining({
        content: '这是抓取到的有效正文摘要。',
        publishedDate: '2026-08-31',
        siteName: '联合早报',
      }),
    );
  });

  test('uses the site favicon before the cached favicon service fallback', () => {
    expect(
      getFaviconUrls({
        id: 1,
        siteName: 'Cherry Studio',
        title: 'Cherry Studio',
        url: 'https://cherry-ai.com/docs',
      }),
    ).toEqual([
      'https://cherry-ai.com/favicon.ico',
      'https://icons.duckduckgo.com/ip3/cherry-ai.com.ico',
    ]);
  });

  test('removes page navigation from fetched content and reads a date from the article URL', () => {
    expect(
      parseWebSources({
        content:
          '[](javascript:void(0)) 网易首页 应用 登录 注册 邮箱 快速导航\n这是文章的有效摘要。',
        title: '文章标题 | 联合早报',
        url: 'https://www.zaobao.com.sg/news/story20260901-1234567',
      }),
    ).toEqual([
      expect.objectContaining({
        content: '这是文章的有效摘要。',
        publishedDate: '2026-09-01',
        siteName: '联合早报',
      }),
    ]);
  });
});
