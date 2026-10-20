import { toByteArray } from 'base64-js';

import type { JsSandbox } from '@/backend/services/jsSandbox';

import { createOfficeCode } from './createOfficeCode';
import type { OfficeImage, OfficeRequest } from './officeSpec';

export const OFFICE_MAX_INPUT_BYTES = 128 * 1024;
export const OFFICE_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const OFFICE_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

export class OfficeGenerationError extends Error {}

export async function generateOfficeFile(input: {
  request: OfficeRequest;
  images: Readonly<Record<string, OfficeImage>>;
  sandbox: JsSandbox;
  signal: AbortSignal;
  onSettled: () => void;
}): Promise<Uint8Array> {
  let submitted = false;
  try {
    input.signal.throwIfAborted();
    const code = createOfficeCode(input.request, input.images);
    submitted = true;
    const outcome = await input.sandbox.run({
      code,
      signal: input.signal,
      onSettled: input.onSettled,
      limits: {
        timeoutMs: 30_000,
        memoryBytes: 64 * 1024 * 1024,
        maxResultBytes: Math.ceil(OFFICE_MAX_OUTPUT_BYTES / 3) * 4 + 2,
        maxLogBytes: 1024,
      },
    });
    input.signal.throwIfAborted();
    if (outcome.status === 'error') {
      throw new OfficeGenerationError(
        `Office generation failed (${outcome.kind}). Reduce the document size or complexity and try again.`,
      );
    }
    return decodeOfficeResult(outcome);
  } finally {
    if (!submitted) input.onSettled();
  }
}

/** Validates a sandbox result holding one base64 ZIP package within the output limit. */
export function decodeOfficeResult(outcome: {
  result?: string;
  resultTruncated?: boolean;
}): Uint8Array {
  if (!outcome.result || outcome.resultTruncated) {
    throw new OfficeGenerationError(
      'Office generation returned an incomplete file. Reduce its size and try again.',
    );
  }
  const result: unknown = JSON.parse(outcome.result);
  if (
    typeof result !== 'string' ||
    result.length > Math.ceil(OFFICE_MAX_OUTPUT_BYTES / 3) * 4 ||
    result.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(result)
  ) {
    throw new OfficeGenerationError('Office generation returned an invalid file.');
  }
  const bytes = toByteArray(result);
  if (
    bytes.length > OFFICE_MAX_OUTPUT_BYTES ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 3 ||
    bytes[3] !== 4
  ) {
    throw new OfficeGenerationError('Office generation returned an invalid or oversized file.');
  }
  return bytes;
}
