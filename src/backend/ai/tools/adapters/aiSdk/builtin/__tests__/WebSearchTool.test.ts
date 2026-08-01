import { getTrustedLocalToolTerminalFailure } from '@/backend/ai/runtime/aiSdk/loop/localToolTerminalOutcome';
import {
  WEB_LOOKUP_ERROR_NOTE,
  WEB_PROVIDER_CONFIGURATION_ERROR_NOTE,
  WEB_PROVIDER_NOT_CONFIGURED_NOTE,
} from '@/backend/ai/tools/webLookup';
import type { WebSearchConfigErrorCode } from '@/backend/services/webSearch/WebSearchConfigError';
import { WebSearchConfigError } from '@/backend/services/webSearch/WebSearchConfigError';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';

import { createWebSearchTool, webSearchInputSchema } from '../WebSearchTool';

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ error: jest.fn(), warn: jest.fn() }),
  },
}));

function createTool(searchKeywords: jest.Mock) {
  return createWebSearchTool({ searchKeywords } as unknown as WebSearchService);
}

function execute(tool: ReturnType<typeof createTool>, abortSignal?: AbortSignal) {
  return tool.execute?.(
    { query: 'Cherry Studio mobile' },
    { abortSignal, messages: [], toolCallId: 'web-search-1' },
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
