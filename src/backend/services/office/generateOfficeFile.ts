import type { JsSandbox } from '@/backend/services/jsSandbox';

import { createOfficeCode, type OfficeImageInput } from './createOfficeCode';
import { OFFICE_MAX_FILE_BYTES } from './officePackageCode';
import type { OfficeImage, OfficeRequest } from './officeSpec';

export const OFFICE_MAX_INPUT_BYTES = 128 * 1024;
/** Distinct images one call may embed or replace. */
export const OFFICE_MAX_IMAGES = 50;

export class OfficeGenerationError extends Error {}

/** The largest heap an Office job may use. */
export const OFFICE_MAX_MEMORY_BYTES = 512 * 1024 * 1024;

/**
 * A job's heap grows with the bytes it reads. Measured with the native engine, unzipping, editing
 * and repacking peak near 2.7x the input (30 MiB deck plus 30 MiB of images: 160 MiB).
 */
export function officeLimits(inputBytes: number, maxResultBytes = 1024) {
  return {
    timeoutMs: 120_000,
    memoryBytes: Math.min(OFFICE_MAX_MEMORY_BYTES, 128 * 1024 * 1024 + 4 * inputBytes),
    maxResultBytes,
    maxLogBytes: 1024,
  };
}

/** Writes the generated file to `output` and returns its size. */
export async function generateOfficeFile(input: {
  request: OfficeRequest;
  images: Readonly<Record<string, OfficeImage>>;
  output: string;
  sandbox: JsSandbox;
  signal: AbortSignal;
  onSettled: () => void;
}): Promise<number> {
  let submitted = false;
  try {
    input.signal.throwIfAborted();
    const entries = Object.entries(input.images);
    const images: Record<string, OfficeImageInput> = Object.fromEntries(
      entries.map(([id, image], index) => [id, { index, mediaType: image.mediaType }]),
    );
    const code = createOfficeCode(input.request, images);
    submitted = true;
    const outcome = await input.sandbox.run({
      code,
      files: { inputs: entries.map(([, image]) => image.uri), output: input.output },
      signal: input.signal,
      onSettled: input.onSettled,
      limits: officeLimits(entries.reduce((total, [, image]) => total + image.size, 0)),
    });
    input.signal.throwIfAborted();
    if (outcome.status === 'error') {
      throw new OfficeGenerationError(
        `Office generation failed (${outcome.kind}): ${outcome.message.slice(0, 500)}`,
      );
    }
    return writtenSize(outcome.result && JSON.parse(outcome.result));
  } finally {
    if (!submitted) input.onSettled();
  }
}

/** The size a job reported after writing its output file. */
export function writtenSize(size: unknown): number {
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0)
    throw new OfficeGenerationError('Office generation returned no file.');
  if (size > OFFICE_MAX_FILE_BYTES)
    throw new OfficeGenerationError('Office generation returned an oversized file.');
  return size;
}
