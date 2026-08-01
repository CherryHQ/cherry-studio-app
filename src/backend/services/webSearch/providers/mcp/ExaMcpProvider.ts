import type {
  WebSearchExecutionConfig,
  WebSearchResponse,
} from '@cherrystudio/universal/data/types/webSearch';

import { loggerService } from '@/shared/core/logger/LoggerService';

import { resolveProviderApiHost } from '../../utils/provider';
import { assertRecord, readObject, readObjectArray, readString } from '../api/schemaUtils';
import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';
import type { RequestSearchContext } from '../base/context';

type McpSearchRequest = {
  jsonrpc: string;
  id: number;
  method: string;
  params: {
    name: string;
    arguments: {
      query: string;
      numResults: number;
      livecrawl: 'fallback' | 'preferred';
      type: 'auto' | 'fast' | 'deep';
    };
  };
};

type ExaSearchResult = {
  title: string;
  url: string;
  text: string;
};

const REQUEST_TIMEOUT_MS = 25000;
const logger = loggerService.withContext('ExaMcpProvider');

type ExaMcpSearchContext = RequestSearchContext<McpSearchRequest> & {
  upstreamSignal?: AbortSignal;
};

export class ExaMcpProvider extends BaseWebSearchProvider {
  async searchKeywords(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    const context = this.prepareSearchContext(query, config, httpOptions);
    const responseText = await this.executeSearch(context);

    return this.buildFinalResponse(context, responseText);
  }

  private prepareSearchContext(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): ExaMcpSearchContext {
    return {
      query,
      maxResults: config.maxResults,
      requestUrl: resolveProviderApiHost(this.provider, 'searchKeywords'),
      requestBody: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'web_search_exa',
          arguments: {
            query,
            type: 'auto',
            numResults: config.maxResults,
            livecrawl: 'fallback',
          },
        },
      },
      upstreamSignal: httpOptions?.signal ?? undefined,
    };
  }

  private buildFinalResponse(
    context: ExaMcpSearchContext,
    responseText: string,
  ): WebSearchResponse {
    const results = this.parseResponse(responseText);

    return {
      query: context.query,
      providerId: this.provider.id,
      capability: 'searchKeywords',
      inputs: [context.query],
      results: results.slice(0, context.maxResults).map((result) => ({
        title: result.title.trim() || '',
        content: result.text.trim() || '',
        url: result.url || '',
        sourceInput: context.query,
      })),
    };
  }

  private parseTextChunk(raw: string): ExaSearchResult[] {
    const items: ExaSearchResult[] = [];

    for (const chunk of raw.split('\n\n')) {
      const lines = chunk.split('\n');
      let title = '';
      let url = '';
      let fullText = '';
      let textStartIndex = -1;

      lines.forEach((line, index) => {
        if (line.startsWith('Title:')) {
          title = line.replace(/^Title:\s*/, '');
        } else if (line.startsWith('URL:')) {
          url = line.replace(/^URL:\s*/, '');
        } else if (line.startsWith('Text:') && textStartIndex === -1) {
          textStartIndex = index;
          fullText = line.replace(/^Text:\s*/, '');
        }
      });

      if (textStartIndex !== -1) {
        const rest = lines.slice(textStartIndex + 1).join('\n');
        if (rest.trim().length > 0) {
          fullText = fullText ? `${fullText}\n${rest}` : rest;
        }
      }

      if (title || url || fullText) {
        items.push({ title, url, text: fullText });
      }
    }

    return items;
  }

  private parseResponse(responseText: string): ExaSearchResult[] {
    const payloadTexts: string[] = [];

    for (const line of responseText.split('\n')) {
      if (!line.startsWith('data: ')) {
        continue;
      }

      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') {
        continue;
      }

      try {
        const text = this.extractContentText(payload);
        if (text) {
          payloadTexts.push(text);
        }
      } catch (error) {
        logger.warn('Failed to parse Exa MCP SSE line', {
          line,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (payloadTexts.length === 0) {
      try {
        const directText = this.extractContentText(responseText);
        if (directText) {
          payloadTexts.push(directText);
        }
      } catch (error) {
        logger.warn('Failed to parse Exa MCP direct response', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (payloadTexts.length === 0 && responseText.includes('Title:')) {
      payloadTexts.push(responseText);
    }

    if (payloadTexts.length === 0 && responseText.trim().length > 0) {
      throw new Error('Exa MCP response parsing failed: no parseable content found');
    }

    return this.parseTextChunk(payloadTexts.join('\n\n')).filter((item) =>
      Boolean(item.title || item.url || item.text),
    );
  }

  private extractContentText(payload: string): string | null {
    // JSON.parse throws on purpose: a malformed line is worth a warning, while a
    // well-formed line that simply is not a tool result is skipped silently.
    const content = readMcpContent(JSON.parse(payload));
    if (!content) {
      return null;
    }

    const text = content
      .map((item) => item.text.trim())
      .filter(Boolean)
      .join('\n\n');

    return text || null;
  }

  private async executeSearch(context: ExaMcpSearchContext): Promise<string> {
    const timeoutController = new AbortController();
    const timeoutError = new DOMException(
      `Exa MCP search timed out after ${REQUEST_TIMEOUT_MS}ms`,
      'TimeoutError',
    );
    const timeoutId = setTimeout(() => timeoutController.abort(timeoutError), REQUEST_TIMEOUT_MS);

    const signal = context.upstreamSignal
      ? AbortSignal.any([timeoutController.signal, context.upstreamSignal])
      : timeoutController.signal;

    try {
      const response = await fetch(context.requestUrl, {
        method: 'POST',
        headers: this.buildHeaders({
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        }),
        body: JSON.stringify(context.requestBody),
        signal,
      });

      if (!response.ok) {
        await this.throwHttpError('Exa MCP search failed', response);
      }

      return await response.text();
    } catch (error) {
      // Desktop reads `timeoutController.signal.reason` here. React Native's
      // AbortController drops the reason passed to abort(), so decide from
      // `aborted` alone and rethrow the error we created.
      if (timeoutController.signal.aborted && !context.upstreamSignal?.aborted) {
        throw timeoutError;
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/** Returns null when the payload is not a JSON-RPC tool result, matching desktop's safeParse. */
function readMcpContent(payload: unknown): { type: string; text: string }[] | null {
  try {
    const record = assertRecord(payload);
    const result = readObject(record.result, 'payload.result');

    return readObjectArray(result.content, 'payload.result.content').map((item, index) => ({
      type: readString(item.type, `payload.result.content[${index}].type`),
      text: readString(item.text, `payload.result.content[${index}].text`),
    }));
  } catch {
    return null;
  }
}
