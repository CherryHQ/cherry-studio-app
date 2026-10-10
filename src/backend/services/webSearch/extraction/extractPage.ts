import * as z from 'zod';

import { HttpError } from '@/backend/services/http';
import { createJsSandbox } from '@/backend/services/jsSandbox';

import { WebSearchConfigError } from '../WebSearchConfigError';
import { createExtractionCode, MAX_EXTRACTED_CONTENT_CHARACTERS } from './createExtractionCode';

const extractionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('empty') }),
  z.object({
    status: z.literal('ok'),
    title: z.string().max(512),
    content: z.string().min(1).max(MAX_EXTRACTED_CONTENT_CHARACTERS),
    truncated: z.boolean(),
  }),
]);

export async function extractPage(input: {
  html: string;
  url: string;
  signal: AbortSignal;
  onSettled: () => void;
}) {
  // onSettled owns the download/extraction lease even if no native run starts.
  let submitted = false;
  try {
    const sandbox = createJsSandbox();
    if (!sandbox) {
      throw new WebSearchConfigError(
        'provider_unsupported_on_platform',
        'Local extraction requires a client with the native JavaScript sandbox.',
      );
    }
    const code = createExtractionCode(input.html, input.url);
    submitted = true;
    const outcome = await sandbox.run({
      code,
      signal: input.signal,
      onSettled: input.onSettled,
      limits: {
        timeoutMs: 5_000,
        memoryBytes: 64 * 1024 * 1024,
        maxResultBytes: 256 * 1024,
        maxLogBytes: 4 * 1024,
      },
    });
    input.signal.throwIfAborted();
    if (outcome.status === 'error') {
      throw new HttpError(`Local extraction failed: ${outcome.message}`, {
        code: `extraction_${outcome.kind}`,
        kind: outcome.kind === 'timeout' ? 'timeout' : 'invalid_response',
      });
    }
    if (outcome.resultTruncated || !outcome.result) {
      throw new HttpError('Local extraction returned an incomplete result.', {
        code: 'extraction_incomplete',
        kind: 'invalid_response',
      });
    }
    let result: z.infer<typeof extractionSchema>;
    try {
      result = extractionSchema.parse(JSON.parse(outcome.result));
    } catch {
      throw new HttpError('Local extraction returned an invalid result.', {
        code: 'extraction_invalid_result',
        kind: 'invalid_response',
      });
    }
    if (result.status === 'empty') {
      throw new HttpError('The downloaded page has no extractable main content.', {
        code: 'extraction_empty',
        kind: 'invalid_response',
      });
    }
    return { title: result.title, content: result.content, truncated: result.truncated };
  } finally {
    if (!submitted) input.onSettled();
  }
}
