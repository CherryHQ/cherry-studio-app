import * as z from 'zod';

import { HttpError } from '@/backend/services/http';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type {
  WebSearchCapability,
  WebSearchExecutionConfig,
  WebSearchResponse,
  WebSearchResult,
} from '@/shared/data/types/webSearch';

import { resolveProviderApiHost } from '../../utils/provider';
import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';

const McpResponseSchema = z.object({
  error: z.object({ code: z.number(), message: z.string() }).optional(),
  result: z
    .object({
      isError: z.boolean().optional(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
    })
    .optional(),
});

const SEARCH_TIMEOUT_MS = 25_000;
const FETCH_TIMEOUT_MS = 60_000;
// Matches the service's maximum per-page character allowance before token cutoff.
const FETCH_MAX_CHARACTERS = 24_000;
const logger = loggerService.withContext('ExaMcpProvider');

type ExaResult = Pick<WebSearchResult, 'title' | 'url' | 'content'>;

export class ExaMcpProvider extends BaseWebSearchProvider {
  async searchKeywords(
    query: string,
    config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    const texts = await this.callTool(
      'searchKeywords',
      {
        query,
        type: 'auto',
        numResults: config.maxResults,
        livecrawl: 'fallback',
      },
      httpOptions?.signal,
    );

    return {
      query,
      providerId: this.provider.id,
      capability: 'searchKeywords',
      inputs: [query],
      results: parseSearchText(texts.join('\n\n'))
        .slice(0, config.maxResults)
        .map((result) => ({
          ...result,
          sourceInput: query,
        })),
    };
  }

  async fetchUrls(
    query: string,
    _config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    const texts = await this.callTool(
      'fetchUrls',
      {
        urls: [query],
        maxCharacters: FETCH_MAX_CHARACTERS,
      },
      httpOptions?.signal,
    );
    const results = texts.flatMap(parsePageText);
    if (results.length === 0) {
      throw new Error('Exa MCP returned no readable page content.');
    }

    return {
      query,
      providerId: this.provider.id,
      capability: 'fetchUrls',
      inputs: [query],
      results: results.map((result) => ({
        ...result,
        sourceInput: query,
        ...(result.content.length >= FETCH_MAX_CHARACTERS ? { truncated: true } : {}),
      })),
    };
  }

  private async callTool(
    capability: WebSearchCapability,
    args: Record<string, unknown>,
    upstreamSignal?: AbortSignal | null,
  ): Promise<string[]> {
    const url = resolveProviderApiHost(this.provider, capability);
    const apiKey = this.resolveApiKey(false);
    const isFetch = capability === 'fetchUrls';
    const timeoutMs = isFetch ? FETCH_TIMEOUT_MS : SEARCH_TIMEOUT_MS;
    const operation = isFetch ? 'fetch' : 'search';
    const timeoutController = new AbortController();
    const timeoutError = new DOMException(
      `Exa MCP ${operation} timed out after ${timeoutMs}ms`,
      'TimeoutError',
    );
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
    const signal = upstreamSignal
      ? AbortSignal.any([timeoutController.signal, upstreamSignal])
      : timeoutController.signal;

    try {
      signal.throwIfAborted();
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders({
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        }),
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: isFetch ? 'web_fetch_exa' : 'web_search_exa', arguments: args },
        }),
        signal,
      });
      if (!response.ok) {
        await this.throwHttpError(`Exa MCP ${operation} failed`, response);
      }
      return readMcpTexts(await response.text());
    } catch (error) {
      // React Native may drop abort reasons; only our timeout owns this classification.
      if (timeoutController.signal.aborted && !upstreamSignal?.aborted) throw timeoutError;
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function parseSearchText(raw: string): ExaResult[] {
  // A blank line also separates paragraphs inside an article. Split only at the next result header.
  const chunks = raw.replace(/\r\n/g, '\n').split(/\n\n(?:---\n\n)?(?=Title:[^\n]*\nURL:)/);
  return chunks.flatMap((chunk) => {
    const title = /^Title:\s*([^\n]*)/m.exec(chunk)?.[1]?.trim() ?? '';
    const url = /^URL:\s*(https?:\/\/[^\s]+)/m.exec(chunk)?.[1];
    if (!url) return [];
    const content = /^(?:Text|Highlights):[ \t]*([\s\S]*)/m.exec(chunk)?.[1]?.trim() ?? '';
    return [{ title, url, content }];
  });
}

function parsePageText(raw: string): ExaResult[] {
  const match =
    /^# ([^\n]+)\nURL: (https?:\/\/[^\s]+)\n(?:Published:[^\n]*\n)?(?:Author:[^\n]*\n)?\n([\s\S]*)/.exec(
      raw.replace(/\r\n/g, '\n'),
    );
  if (!match || !match[3].trim()) return [];
  return [{ title: match[1].trim(), url: match[2], content: match[3].trim() }];
}

function readMcpTexts(responseText: string): string[] {
  const frames = responseText.split('\n').flatMap((line) => {
    if (!line.startsWith('data:')) return [];
    const payload = line.slice(5).trim();
    return payload && payload !== '[DONE]' ? [payload] : [];
  });
  const texts = (frames.length > 0 ? frames : [responseText]).flatMap((frame) => {
    let payload: unknown;
    try {
      payload = JSON.parse(frame);
    } catch {
      logger.warn('Failed to parse Exa MCP response frame');
      return [];
    }
    const parsed = McpResponseSchema.safeParse(payload);
    if (!parsed.success) return [];
    const { result, error } = parsed.data;
    if (error) {
      throw new HttpError(`Exa MCP: ${error.message}`, {
        code: 'MCP_PROTOCOL_ERROR',
        kind: 'invalid_response',
      });
    }
    const content =
      result?.content.flatMap((item) =>
        item.type === 'text' && item.text?.trim() ? [item.text.trim()] : [],
      ) ?? [];
    if (result?.isError) {
      throw new HttpError(content.join('\n') || 'Exa MCP tool failed.', {
        code: 'MCP_TOOL_ERROR',
        kind: 'invalid_response',
      });
    }
    return content;
  });
  if (texts.length > 0) return texts;
  if (responseText.startsWith('Title:')) return [responseText];
  throw new HttpError('Exa MCP response parsing failed: no parseable content found', {
    kind: 'invalid_response',
    code: 'MCP_INVALID_RESPONSE',
  });
}
