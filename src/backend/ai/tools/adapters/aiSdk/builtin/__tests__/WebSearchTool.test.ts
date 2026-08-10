import { getTrustedLocalToolTerminalFailure } from '@cherrystudio/ai-runtime/runtime';

import {
  WEB_LOOKUP_ERROR_NOTE,
  WEB_NETWORK_ERROR_NOTE,
  WEB_PROVIDER_CONFIGURATION_ERROR_NOTE,
  WEB_PROVIDER_NOT_CONFIGURED_NOTE,
} from '@/backend/ai/tools/webLookup';
import type { WebSearchConfigErrorCode } from '@/backend/services/webSearch/WebSearchConfigError';
import { WebSearchConfigError } from '@/backend/services/webSearch/WebSearchConfigError';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';

import { createWebFetchTool, webFetchInputSchema } from '../WebFetchTool';
import { createWebSearchTool, webSearchInputSchema } from '../WebSearchTool';

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ error: jest.fn(), warn: jest.fn() }),
  },
}));

function createTool(searchKeywords: jest.Mock) {
  return createWebSearchTool({ searchKeywords } as unknown as WebSearchService);
}

function createFetchTool(fetchUrls: jest.Mock) {
  return createWebFetchTool({ fetchUrls } as unknown as WebSearchService);
}

function execute(tool: ReturnType<typeof createTool>, abortSignal?: AbortSignal) {
  return tool.execute?.(
    { query: 'Cherry Studio mobile' },
    { abortSignal, messages: [], toolCallId: 'web-search-1' },
  );
}

function executeFetch(tool: ReturnType<typeof createFetchTool>, abortSignal?: AbortSignal) {
  return tool.execute?.(
    { urls: ['https://example.com'] },
    { abortSignal, messages: [], toolCallId: 'web-fetch-1' },
  );
}

describe('createWebSearchTool', () => {
  it('returns citation IDs that are unique across lookup calls', async () => {
    const searchTool = createTool(
      jest.fn(async () => ({
        results: [
          { content: 'A', title: 'A', url: 'https://example.com/a' },
          { content: 'B', title: 'B', url: 'https://example.com/b' },
        ],
      })),
    );

    const first = await execute(searchTool);
    const second = await execute(searchTool);

    expect(first).toEqual([
      expect.objectContaining({ id: expect.stringMatching(/^[0-9a-f]{8}-1$/) }),
      expect.objectContaining({ id: expect.stringMatching(/^[0-9a-f]{8}-2$/) }),
    ]);
    expect((first as { id: string }[])[0].id).not.toBe((second as { id: string }[])[0].id);
  });

  it.each([
    {
      code: 'provider_not_configured',
      i18nKey: 'web_search_provider_unavailable',
      userMessage: /no compatible provider is configured/,
    },
    {
      code: 'provider_unknown',
      i18nKey: 'web_search_provider_unavailable',
      userMessage: /no compatible provider is configured/,
    },
    {
      code: 'capability_unsupported',
      i18nKey: 'web_search_provider_unavailable',
      userMessage: /no compatible provider is configured/,
    },
    {
      code: 'provider_unsupported_on_platform',
      i18nKey: 'web_search_provider_unavailable',
      userMessage: /not supported on this device/,
    },
    {
      code: 'api_key_missing',
      i18nKey: 'web_search_api_key_missing',
      userMessage: /missing an API key/,
    },
    {
      code: 'api_host_missing',
      i18nKey: 'web_search_api_host_missing',
      userMessage: /missing an API host/,
    },
    {
      code: 'api_host_invalid',
      i18nKey: 'web_search_api_host_invalid',
      userMessage: /API host is invalid/,
    },
  ] satisfies {
    code: WebSearchConfigErrorCode;
    i18nKey: string;
    userMessage: RegExp;
  }[])(
    'marks a $code configuration error as terminal with matching guidance',
    async ({ code, i18nKey, userMessage }) => {
      const message = `web search failed with ${code}`;
      const searchTool = createTool(
        jest.fn(async () => {
          throw new WebSearchConfigError(code, message);
        }),
      );

      const output = await execute(searchTool, new AbortController().signal);

      expect(output).toEqual({
        error: message,
        i18nKey,
        retryable: false,
        terminal: true,
        userMessage: expect.stringMatching(userMessage),
      });
      // The loop only stops on a failure it can attribute to a local tool it trusts.
      expect(getTrustedLocalToolTerminalFailure(output)).toMatchObject({ error: message, i18nKey });
    },
  );

  it('reports a transient provider failure as retryable, keeping the raw message', async () => {
    const searchTool = createTool(
      jest.fn(async () => {
        throw new Error('HTTP 503 upstream unavailable');
      }),
    );

    const output = await execute(searchTool);

    expect(output).toEqual({ error: 'HTTP 503 upstream unavailable', retryable: true });
    expect(getTrustedLocalToolTerminalFailure(output)).toBeUndefined();
  });

  it('rethrows an abort instead of turning it into an error result', async () => {
    const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    const searchTool = createTool(
      jest.fn(async () => {
        throw abortError;
      }),
    );

    await expect(execute(searchTool)).rejects.toBe(abortError);
  });

  it.each([
    { i18nKey: 'web_search_provider_unavailable', note: WEB_PROVIDER_NOT_CONFIGURED_NOTE },
    { i18nKey: 'web_search_api_key_missing', note: WEB_PROVIDER_CONFIGURATION_ERROR_NOTE },
    { i18nKey: 'web_search_api_host_missing', note: WEB_PROVIDER_CONFIGURATION_ERROR_NOTE },
    { i18nKey: 'web_search_api_host_invalid', note: WEB_PROVIDER_CONFIGURATION_ERROR_NOTE },
    { i18nKey: undefined, note: WEB_LOOKUP_ERROR_NOTE },
  ])('projects the $i18nKey failure to its model-facing note', ({ i18nKey, note }) => {
    const searchTool = createTool(jest.fn());

    expect(searchTool.toModelOutput?.({ output: { error: 'boom', i18nKey } } as never)).toEqual({
      type: 'text',
      value: note,
    });
  });

  it('passes results through as json', () => {
    const searchTool = createTool(jest.fn());
    const results = [{ content: 'A', id: 'abc-1', title: 'A', url: 'https://example.com/a' }];

    expect(searchTool.toModelOutput?.({ output: results } as never)).toEqual({
      type: 'json',
      value: results,
    });
  });

  it('requires concise, self-contained queries', () => {
    expect(webSearchInputSchema.safeParse({ query: 'x' }).success).toBe(false);
    expect(webSearchInputSchema.safeParse({ query: 'x'.repeat(201) }).success).toBe(false);
    expect(webSearchInputSchema.safeParse({ query: 'current Cherry Studio release' }).success).toBe(
      true,
    );
  });
});

describe('createWebFetchTool', () => {
  it('passes URLs and the request abort signal to WebSearchService', async () => {
    const abortSignal = new AbortController().signal;
    const fetchUrls = jest.fn(async () => ({
      results: [{ content: 'Page', title: 'Example', url: 'https://example.com' }],
    }));

    const output = await executeFetch(createFetchTool(fetchUrls), abortSignal);

    expect(fetchUrls).toHaveBeenCalledWith(
      { urls: ['https://example.com'] },
      { signal: abortSignal },
    );
    expect(output).toEqual([
      expect.objectContaining({
        content: 'Page',
        id: expect.stringMatching(/^[0-9a-f]{8}-1$/),
        url: 'https://example.com',
      }),
    ]);
  });

  it('returns transient fetch failures without disguising them as empty results', async () => {
    const fetchTool = createFetchTool(
      jest.fn(async () => {
        throw new Error('HTTP 503 upstream unavailable');
      }),
    );

    await expect(executeFetch(fetchTool)).resolves.toEqual({
      error: 'HTTP 503 upstream unavailable',
      retryable: true,
    });
  });

  it('marks proxy Fake-IP rejection as a terminal network error', async () => {
    const fetchTool = createFetchTool(
      jest.fn(async () => {
        throw new Error(
          'Unsafe remote url: DNS resolved to local or private address (example.com -> 198.18.1.14)',
        );
      }),
    );

    const output = await executeFetch(fetchTool);

    expect(output).toEqual({
      error: 'Web access failed. Check your network connection and try again.',
      i18nKey: 'web_lookup_network_error',
      retryable: false,
      terminal: true,
      userMessage: 'Web access failed. Check your network connection and try again.',
    });
    expect(fetchTool.toModelOutput?.({ output } as never)).toEqual({
      type: 'text',
      value: WEB_NETWORK_ERROR_NOTE,
    });
    expect(getTrustedLocalToolTerminalFailure(output)).toMatchObject({
      i18nKey: 'web_lookup_network_error',
    });
  });

  it('rethrows aborts', async () => {
    const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    const fetchTool = createFetchTool(
      jest.fn(async () => {
        throw abortError;
      }),
    );

    await expect(executeFetch(fetchTool)).rejects.toBe(abortError);
  });

  it('accepts only HTTP(S) URL input', () => {
    expect(webFetchInputSchema.safeParse({ urls: ['https://example.com'] }).success).toBe(true);
    expect(webFetchInputSchema.safeParse({ urls: ['example.com'] }).success).toBe(false);
    expect(webFetchInputSchema.safeParse({ urls: ['file:///etc/passwd'] }).success).toBe(false);
  });
});
