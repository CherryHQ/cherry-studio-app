import type { WebSearchExecutionConfig, WebSearchResponse } from '@/shared/data/types/webSearch';

import { downloadWebPage } from '../../http/downloadWebPage';
import { BaseWebSearchProvider } from '../base/BaseWebSearchProvider';
import { acquireLocalFetchSlot } from './localFetchSlot';

const MAX_TEXT_CHARACTERS = 24_000;

export class FetchProvider extends BaseWebSearchProvider {
  async fetchUrls(
    input: string,
    _config: WebSearchExecutionConfig,
    httpOptions?: RequestInit,
  ): Promise<WebSearchResponse> {
    const signal = httpOptions?.signal ?? new AbortController().signal;
    const release = await acquireLocalFetchSlot(signal);
    let extractionOwnsSlot = false;
    try {
      const page = await downloadWebPage(input, signal);
      let result: { title: string; content: string; truncated: boolean };
      if (page.isHtml) {
        const { extractPage } = await import('../../extraction');
        signal.throwIfAborted();
        extractionOwnsSlot = true;
        result = await extractPage({
          html: page.content,
          url: page.url,
          signal,
          onSettled: release,
        });
      } else {
        const content = page.content.trim();
        result = {
          title: '',
          content: content.slice(0, MAX_TEXT_CHARACTERS),
          truncated: content.length > MAX_TEXT_CHARACTERS,
        };
      }
      signal.throwIfAborted();
      return {
        query: input,
        inputs: [input],
        providerId: this.provider.id,
        capability: 'fetchUrls',
        results: [
          { ...result, title: result.title || page.url, url: page.url, sourceInput: input },
        ],
      };
    } finally {
      if (!extractionOwnsSlot) release();
    }
  }
}
